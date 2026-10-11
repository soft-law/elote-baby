//! Shared LiteSVM harness for the `elote_pool` integration tests.
//!
//! Everything here builds state the way a client would: real instructions, signed by real
//! keypairs, executed by the compiled `target/deploy/elote_pool.so`. SPL Token and the Associated
//! Token Account program come from `LiteSVM::new()`, which loads them by default in litesvm 0.9.0
//! (`spl_token-3.5.0.so`, `spl_associated_token_account-1.1.1.so`).

#![allow(dead_code)]

use anchor_lang::{AccountDeserialize, Discriminator};
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
