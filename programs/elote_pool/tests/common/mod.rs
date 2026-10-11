//! Shared LiteSVM harness for the `elote_pool` integration tests.
//!
//! Everything here builds state the way a client would: real instructions, signed by real
//! keypairs, executed by the compiled `target/deploy/elote_pool.so`. SPL Token and the Associated
//! Token Account program come from `LiteSVM::new()`, which loads them by default in litesvm 0.9.0
//! (`spl_token-3.5.0.so`, `spl_associated_token_account-1.1.1.so`).

#![allow(dead_code)]

use anchor_lang::{AccountDeserialize, Discriminator, InstructionData, ToAccountMetas};
use anchor_spl::associated_token::{
    get_associated_token_address, spl_associated_token_account::instruction as ata_ix,
};
use anchor_spl::token::spl_token;
use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
use litesvm::LiteSVM;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_pubkey::{pubkey, Pubkey};
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;

/// `elote_pool`'s `declare_id!`.
pub const PROGRAM_ID: Pubkey = pubkey!("BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM");
pub const TOKEN_PROGRAM_ID: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ATA_PROGRAM_ID: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const SYSTEM_PROGRAM_ID: Pubkey = pubkey!("11111111111111111111111111111111");

pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

/// Anchor's `#[error_code]` numbering: the first variant of the program's error enum is 6000.
pub const ERR_BASE: u32 = 6000;

pub const E_PAUSED: u32 = ERR_BASE; // PoolError::Paused
pub const E_UNAUTHORIZED: u32 = ERR_BASE + 1; // PoolError::Unauthorized
pub const E_WRONG_AMOUNT: u32 = ERR_BASE + 2; // PoolError::WrongAmount
pub const E_INSUFFICIENT_LIQUIDITY: u32 = ERR_BASE + 3; // PoolError::InsufficientLiquidity
pub const E_LINE_STATUS: u32 = ERR_BASE + 4; // PoolError::LineStatus
pub const E_TERM_NOT_ENDED: u32 = ERR_BASE + 5; // PoolError::TermNotEnded
pub const E_OVERFLOW: u32 = ERR_BASE + 6; // PoolError::Overflow
pub const E_SPONSOR_REQUIRED: u32 = ERR_BASE + 7; // PoolError::SponsorRequired
pub const E_ZERO_SHARES: u32 = ERR_BASE + 8; // PoolError::ZeroShares
pub const E_FIRST_DEPOSIT_TOO_SMALL: u32 = ERR_BASE + 9; // PoolError::FirstDepositTooSmall
pub const E_WRONG_ACCOUNT: u32 = ERR_BASE + 10; // PoolError::WrongAccount

/// One whole test-token unit: the asset mint has 6 decimals.
pub const UNIT: u64 = 1_000_000;

// -----------------------------------------------------------------------------------------------
// PDAs: the seed layouts of `state::seeds`.
// -----------------------------------------------------------------------------------------------

pub fn pool_pda(admin: &Pubkey, asset_mint: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"pool", admin.as_ref(), asset_mint.as_ref()], &PROGRAM_ID)
}

pub fn share_mint_pda(pool: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"shares", pool.as_ref()], &PROGRAM_ID)
}

pub fn line_pda(pool: &Pubkey, line_id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"line", pool.as_ref(), &line_id.to_le_bytes()], &PROGRAM_ID)
}

/// The addresses of one pool, all derived from the admin and the asset mint.
#[derive(Clone, Copy, Debug)]
pub struct PoolKeys {
    pub pool: Pubkey,
    pub asset_mint: Pubkey,
    pub share_mint: Pubkey,
    pub vault: Pubkey,
}

impl PoolKeys {
    pub fn new(admin: &Pubkey, asset_mint: &Pubkey) -> Self {
        let pool = pool_pda(admin, asset_mint).0;
        Self {
            pool,
            asset_mint: *asset_mint,
            share_mint: share_mint_pda(&pool).0,
            vault: ata(&pool, asset_mint),
        }
    }
}

/// The `#[event_cpi]` self-CPI authority every event-emitting instruction carries.
pub fn event_authority_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"__event_authority"], &PROGRAM_ID)
}

pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(owner, mint)
}

pub struct Env {
    pub svm: LiteSVM,
    pub admin: Keypair,
}

fn event_metas() -> (Pubkey, Pubkey) {
    (event_authority_pda().0, PROGRAM_ID)
}

fn workspace_root() -> std::path::PathBuf {
    // CARGO_MANIFEST_DIR is `<root>/programs/elote_pool`.
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .expect("workspace root")
        .to_path_buf()
}

impl Env {
    /// A fresh SVM with the program loaded (SPL Token and ATA are LiteSVM defaults) and a funded
    /// admin.
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        assert!(svm.get_account(&TOKEN_PROGRAM_ID).is_some(), "SPL Token not loaded");
        assert!(svm.get_account(&ATA_PROGRAM_ID).is_some(), "ATA program not loaded");

        let so = workspace_root().join("target/deploy/elote_pool.so");
        assert!(so.exists(), "{} missing — run `NO_DNA=1 anchor build` first", so.display());
        svm.add_program_from_file(PROGRAM_ID, &so).expect("load elote_pool.so");

        let admin = Keypair::new();
        svm.airdrop(&admin.pubkey(), 500 * LAMPORTS_PER_SOL).expect("airdrop admin");

        Self { svm, admin }
    }

    pub fn funded(&mut self, sol: u64) -> Keypair {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), sol * LAMPORTS_PER_SOL).expect("airdrop");
        kp
    }

    // -- transaction plumbing ------------------------------------------------------------------

    /// Sends `ix`, panicking with the program logs if it fails.
    pub fn send(&mut self, ix: Instruction, payer: &Keypair, extra: &[&Keypair]) -> TransactionMetadata {
        self.send_all(&[ix], payer, extra)
    }

    #[allow(clippy::result_large_err)] // litesvm's error carries the whole transaction metadata
    pub fn try_send(
        &mut self,
        ix: Instruction,
        payer: &Keypair,
        extra: &[&Keypair],
    ) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        self.try_send_all(&[ix], payer, extra)
    }

    #[allow(clippy::result_large_err)]
    pub fn try_send_all(
        &mut self,
        ixs: &[Instruction],
        payer: &Keypair,
        extra: &[&Keypair],
    ) -> Result<TransactionMetadata, FailedTransactionMetadata> {
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra);
        let tx = Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), &signers, self.svm.latest_blockhash());
        let res = self.svm.send_transaction(tx);
        // A fresh blockhash per transaction, so two identical instructions are two transactions.
        self.svm.expire_blockhash();
        res
    }

    pub fn send_all(&mut self, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> TransactionMetadata {
        match self.try_send_all(ixs, payer, extra) {
            Ok(meta) => meta,
            Err(e) => panic!("transaction failed: {:?}\n{}", e.err, e.meta.pretty_logs()),
        }
    }

    /// Asserts the instruction fails with Anchor custom error `code`, printing logs otherwise.
    pub fn expect_err(&mut self, ix: Instruction, payer: &Keypair, extra: &[&Keypair], code: u32) {
        match self.try_send(ix, payer, extra) {
            Ok(meta) => panic!("expected custom error {code}, but the tx succeeded\n{}", meta.pretty_logs()),
            Err(e) => {
                let got = custom_error_code(&e.err);
                assert_eq!(got, Some(code), "expected custom error {code}, got {:?}\n{}", e.err, e.meta.pretty_logs());
            }
        }
    }

    // -- account access ------------------------------------------------------------------------

    pub fn account(&self, key: &Pubkey) -> solana_account::Account {
        self.svm.get_account(key).unwrap_or_else(|| panic!("account {key} not found"))
    }

    pub fn anchor_account<T: AccountDeserialize>(&self, key: &Pubkey) -> T {
        let acc = self.account(key);
        T::try_deserialize(&mut acc.data.as_slice()).expect("anchor deserialize")
    }

    /// The SVM's current `Clock::unix_timestamp`, what the program reads as `now`.
    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<anchor_lang::prelude::Clock>().unix_timestamp
    }

    /// Moves the SVM clock to `unix_timestamp = ts`, keeping every other `Clock` field.
    pub fn warp(&mut self, ts: i64) {
        let mut clock = self.svm.get_sysvar::<anchor_lang::prelude::Clock>();
        clock.unix_timestamp = ts;
        self.svm.set_sysvar(&clock);
    }

    // -- SPL Token helpers ---------------------------------------------------------------------

    /// Creates a classic SPL mint with `authority` as mint authority.
    pub fn create_mint(&mut self, authority: &Pubkey, decimals: u8) -> Pubkey {
        let mint = Keypair::new();
        let len = anchor_spl::token::Mint::LEN;
        let lamports = self.svm.minimum_balance_for_rent_exemption(len);
        let create = anchor_lang::solana_program::system_instruction::create_account(
            &self.admin.pubkey(),
            &mint.pubkey(),
            lamports,
            len as u64,
            &TOKEN_PROGRAM_ID,
        );
        let init = spl_token::instruction::initialize_mint2(&TOKEN_PROGRAM_ID, &mint.pubkey(), authority, None, decimals)
            .expect("initialize_mint2");
        let admin = self.admin.insecure_clone();
        self.send_all(&[create, init], &admin, &[&mint]);
        mint.pubkey()
    }

    /// Creates `owner`'s associated token account for `mint`, paid by the admin.
    pub fn create_ata(&mut self, owner: &Pubkey, mint: &Pubkey) -> Pubkey {
        let ix = ata_ix::create_associated_token_account(&self.admin.pubkey(), owner, mint, &TOKEN_PROGRAM_ID);
        let admin = self.admin.insecure_clone();
        self.send(ix, &admin, &[]);
        ata(owner, mint)
    }

    /// Mints `amount` of `mint` into `owner`'s ATA (created if missing); `authority` signs.
    pub fn mint_to(&mut self, mint: &Pubkey, authority: &Keypair, owner: &Pubkey, amount: u64) -> Pubkey {
        let dest = ata(owner, mint);
        if self.svm.get_account(&dest).is_none() {
            self.create_ata(owner, mint);
        }
        let ix = spl_token::instruction::mint_to(&TOKEN_PROGRAM_ID, mint, &dest, &authority.pubkey(), &[], amount)
            .expect("mint_to");
        let admin = self.admin.insecure_clone();
        self.send(ix, &admin, &[authority]);
        dest
    }

    /// A plain SPL transfer between two token accounts, signed by `owner`.
    pub fn transfer(&mut self, from: &Pubkey, to: &Pubkey, owner: &Keypair, amount: u64) {
        let ix = spl_token::instruction::transfer(&TOKEN_PROGRAM_ID, from, to, &owner.pubkey(), &[], amount)
            .expect("transfer");
        let admin = self.admin.insecure_clone();
        self.send(ix, &admin, &[owner]);
    }

    /// The balance of a token account, or 0 when it does not exist.
    pub fn token_balance(&self, account: &Pubkey) -> u64 {
        match self.svm.get_account(account) {
            Some(acc) => anchor_spl::token::TokenAccount::try_deserialize(&mut acc.data.as_slice())
                .expect("token account")
                .amount,
            None => 0,
        }
    }

    pub fn mint_supply(&self, mint: &Pubkey) -> u64 {
        self.anchor_account::<anchor_spl::token::Mint>(mint).supply
    }

    pub fn mint_decimals(&self, mint: &Pubkey) -> u8 {
        self.anchor_account::<anchor_spl::token::Mint>(mint).decimals
    }

    // -- pool instructions ---------------------------------------------------------------------

    pub fn init_pool_ix(&self, admin: &Pubkey, asset_mint: &Pubkey) -> Instruction {
        let k = PoolKeys::new(admin, asset_mint);
        let (event_authority, program) = event_metas();
        Instruction {
            program_id: PROGRAM_ID,
            accounts: elote_pool::accounts::InitPool {
                admin: *admin,
                asset_mint: k.asset_mint,
                pool: k.pool,
                share_mint: k.share_mint,
                vault: k.vault,
                token_program: TOKEN_PROGRAM_ID,
                associated_token_program: ATA_PROGRAM_ID,
                system_program: SYSTEM_PROGRAM_ID,
                event_authority,
                program,
            }
            .to_account_metas(None),
            data: elote_pool::instruction::InitPool {}.data(),
        }
    }

    /// Creates a 6-decimal test asset mint (authority = admin) and a pool for it.
    pub fn setup_pool(&mut self) -> (PoolKeys, TransactionMetadata) {
        let admin = self.admin.insecure_clone();
        let asset_mint = self.create_mint(&admin.pubkey(), 6);
        let ix = self.init_pool_ix(&admin.pubkey(), &asset_mint);
        let meta = self.send(ix, &admin, &[]);
        (PoolKeys::new(&admin.pubkey(), &asset_mint), meta)
    }

    /// A funded wallet holding `assets` of the pool asset, with its share account already created.
    pub fn investor(&mut self, k: &PoolKeys, assets: u64) -> Keypair {
        let kp = self.funded(10);
        let admin = self.admin.insecure_clone();
        if assets > 0 {
            self.mint_to(&k.asset_mint, &admin, &kp.pubkey(), assets);
        } else {
            self.create_ata(&kp.pubkey(), &k.asset_mint);
        }
        self.create_ata(&kp.pubkey(), &k.share_mint);
        kp
    }

    pub fn deposit_ix_with(&self, k: &PoolKeys, depositor: &Pubkey, asset_account: Pubkey, share_account: Pubkey, assets: u64) -> Instruction {
        let (event_authority, program) = event_metas();
        Instruction {
            program_id: PROGRAM_ID,
            accounts: elote_pool::accounts::Deposit {
                depositor: *depositor,
                pool: k.pool,
                share_mint: k.share_mint,
                vault: k.vault,
                depositor_asset_account: asset_account,
                depositor_share_account: share_account,
                token_program: TOKEN_PROGRAM_ID,
                event_authority,
                program,
            }
            .to_account_metas(None),
            data: elote_pool::instruction::Deposit { assets }.data(),
        }
    }

    pub fn deposit_ix(&self, k: &PoolKeys, depositor: &Pubkey, assets: u64) -> Instruction {
        self.deposit_ix_with(k, depositor, ata(depositor, &k.asset_mint), ata(depositor, &k.share_mint), assets)
    }

    pub fn deposit(&mut self, k: &PoolKeys, depositor: &Keypair, assets: u64) -> elote_pool::events::Deposited {
        let ix = self.deposit_ix(k, &depositor.pubkey(), assets);
        let meta = self.send(ix, depositor, &[]);
        find_event(&meta).expect("Deposited event")
    }

    pub fn redeem_ix(&self, k: &PoolKeys, holder: &Pubkey, shares: u64) -> Instruction {
        let (event_authority, program) = event_metas();
        Instruction {
            program_id: PROGRAM_ID,
            accounts: elote_pool::accounts::Redeem {
                holder: *holder,
                pool: k.pool,
                share_mint: k.share_mint,
                vault: k.vault,
                holder_share_account: ata(holder, &k.share_mint),
                holder_asset_account: ata(holder, &k.asset_mint),
                token_program: TOKEN_PROGRAM_ID,
                event_authority,
                program,
            }
            .to_account_metas(None),
            data: elote_pool::instruction::Redeem { shares }.data(),
        }
    }

    pub fn redeem(&mut self, k: &PoolKeys, holder: &Keypair, shares: u64) -> elote_pool::events::Redeemed {
        let ix = self.redeem_ix(k, &holder.pubkey(), shares);
        let meta = self.send(ix, holder, &[]);
        find_event(&meta).expect("Redeemed event")
    }

    pub fn set_paused_ix(&self, k: &PoolKeys, admin: &Pubkey, paused: bool) -> Instruction {
        let (event_authority, program) = event_metas();
        Instruction {
            program_id: PROGRAM_ID,
            accounts: elote_pool::accounts::SetPaused { admin: *admin, pool: k.pool, event_authority, program }
                .to_account_metas(None),
            data: elote_pool::instruction::SetPaused { paused }.data(),
        }
    }

    pub fn set_paused(&mut self, k: &PoolKeys, paused: bool) -> TransactionMetadata {
        let admin = self.admin.insecure_clone();
        let ix = self.set_paused_ix(k, &admin.pubkey(), paused);
        self.send(ix, &admin, &[])
    }

    // -- pool reads ----------------------------------------------------------------------------

    pub fn pool(&self, k: &PoolKeys) -> elote_pool::state::Pool {
        self.anchor_account(&k.pool)
    }

    /// Net asset value as the program computes it: vault balance + outstanding principal.
    pub fn nav(&self, k: &PoolKeys) -> u64 {
        self.token_balance(&k.vault) + self.pool(k).outstanding_principal
    }

    pub fn supply(&self, k: &PoolKeys) -> u64 {
        self.mint_supply(&k.share_mint)
    }

    /// A direct SPL transfer into the vault from a fresh wallet: value enters without new shares.
    pub fn donate(&mut self, k: &PoolKeys, amount: u64) {
        let admin = self.admin.insecure_clone();
        let donor = self.funded(1);
        let from = self.mint_to(&k.asset_mint, &admin, &donor.pubkey(), amount);
        self.transfer(&from, &k.vault, &donor, amount);
    }
}

/// The Anchor custom error number inside a failed transaction, if it carries one.
pub fn custom_error_code(err: &TransactionError) -> Option<u32> {
    match err {
        TransactionError::InstructionError(_, solana_instruction::error::InstructionError::Custom(n)) => Some(*n),
        _ => None,
    }
}

/// Finds an `emit_cpi!` event in a transaction's inner instructions.
///
/// `#[event_cpi]` emits events as a self-CPI whose instruction data is
/// `EVENT_IX_TAG_LE (8) || event discriminator (8) || borsh(event)`; it never reaches the
/// `Program data:` logs that plain `emit!` uses, so the inner instruction list is the only place
/// to look.
pub fn find_event<E>(meta: &TransactionMetadata) -> Option<E>
where
    E: Discriminator + anchor_lang::AnchorDeserialize,
{
    for inner in meta.inner_instructions.iter().flatten() {
        let data = &inner.instruction.data;
        if data.len() < 16 {
            continue;
        }
        if &data[..8] != anchor_lang::event::EVENT_IX_TAG_LE {
            continue;
        }
        if &data[8..16] != E::DISCRIMINATOR {
            continue;
        }
        return Some(E::deserialize(&mut &data[16..]).expect("event borsh"));
    }
    None
}
