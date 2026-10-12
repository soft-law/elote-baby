// Step 6 of the elote credit preset: moves what the partner earned on the tELOTE pool into the fee
// vault, through the Dynamic Fee Sharing program (the vault PDA is the DBC fee claimer and owns the
// DAMM v2 partner position, so only the vault program can claim for it). Resumable: each source is
// read first and skipped when there is nothing to move.
//
//   a. DBC partner trading fees     fundByClaimDbcPartnerTradingFee (claim_trading_fee; the "2" variant is
//                                   not whitelisted by the DFS 0.1.1 build deployed on devnet)
//   b. DBC partner migration fee    fundByWithdrawDbcMigrationFee (after graduation)
//   c. DBC partner surplus          fundByWithdrawDbcPartnerSurplus (after graduation, if any)
//   d. DAMM v2 position fees        fundByClaimDammV2Fee (after graduation; run again later for more)
//
//   cd scripts/meteora && npx tsx fund-vault.ts --cluster devnet|local [--vault <address>]
//        [--pool <dbc pool>] [--keypair <treasury.json>] [--as <address>] [--send]
//
// --keypair  a user of the vault signs (the program checks it): default ELOTE_TREASURY_KEYPAIR,
//            .demo-keys/treasury.json; the admin works too
//
// Without --send every write is only simulated (accounts and compute units are printed).
// Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import BN from "bn.js";
import { CpAmm, getUnClaimLpFee } from "@meteora-ag/cp-amm-sdk";
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  DynamicBondingCurveIdl,
  deriveDammV2PoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { DynamicFeeSharingClient, deriveTokenVaultAddress } from "@meteora-ag/dynamic-fee-sharing-sdk";
import type { Transaction } from "@solana/web3.js";
import { partnerMigrationFeeProblems } from "./vault.ts";
import { type Ctx, DRY_RUN_END, UsageError, actor, addressFrom, fmt, readBook, result, run, signersOf, start, submit, tokenBalance } from "./lib.ts";

const SCRIPT = "fund-vault";
const USAGE = "npx tsx fund-vault.ts --cluster devnet|local [--vault <address>] [--pool <dbc pool>] [--keypair <treasury.json>] [--as <address>] [--send]";
const PARTNER_MIGRATION_FEE_MASK = 0b100; // dynamic-bonding-curve state/virtual_pool.rs

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, { values: ["vault", "pool"], flags: [] });
  const book = readBook(ctx.cluster);
  const vault = addressFrom(ctx.args, "vault", book, "vault");
  const pool = addressFrom(ctx.args, "pool", book, "dbcPool");
  const signer = actor(ctx, "ELOTE_TREASURY_KEYPAIR", "treasury");

  const dfs = new DynamicFeeSharingClient(ctx.conn, "confirmed");
  const dbc = new DynamicBondingCurveClient(ctx.conn, "confirmed");
  const breakdown = await dfs.getFeeBreakdown(vault);
  if (!breakdown.userFees.some((u) => u.address.equals(signer.publicKey))) {
    throw new UsageError(`${signer.publicKey.toBase58()} is not a user of the vault; sign with the treasury or the admin`);
  }
  const tokenVault = deriveTokenVaultAddress(vault);
  const vp = await dbc.state.getPool(pool);
  if (!vp) throw new Error(`no DBC pool at ${pool.toBase58()}`);
  const ps = vp.poolState;
  const config = await dbc.state.getPoolConfig(ps.config);
  if (!config) throw new Error(`no DBC config at ${ps.config.toBase58()}`);
  if (!config.feeClaimer.equals(vault)) throw new Error(`the pool's fee claimer is ${config.feeClaimer.toBase58()}, not the vault`);

  console.log(`Vault:    ${vault.toBase58()} (token account ${tokenVault.toBase58()})`);
  console.log(`DBC pool: ${pool.toBase58()}`);
  console.log(`Signer:   ${signer.publicKey.toBase58()}`);
  console.log(`Vault funded so far: ${fmt(breakdown.totalFundedFee)} tMXN\n`);

  const step = async (label: string, build: () => Promise<Transaction>) => {
    const before = await tokenBalance(ctx.conn, tokenVault);
    const tx = await build();
    await submit(ctx, label, signer.publicKey, tx.instructions, signersOf(signer));
    if (!ctx.dryRun) console.log(`    vault +${fmt((await tokenBalance(ctx.conn, tokenVault)) - before)} tMXN`);
  };
  const migrated = ps.isMigrated !== 0;

  // a. trading fees
  if (ps.partnerQuoteFee.gt(new BN(0)) || ps.partnerBaseFee.gt(new BN(0))) {
    console.log(`a. DBC partner trading fees: ${fmt(ps.partnerQuoteFee)} tMXN unclaimed`);
    // feeClaimer here only names the owner of the token-A (tELOTE) fee account: base-side fees go to
    // the signer's tELOTE account, not the vault. Under collectFeeMode QuoteToken they are zero; the
    // tMXN side goes to the vault's token account (the instruction's token_b, checked by the program).
    await step("a. fund from the DBC partner trading fees", () =>
      dfs.fundByClaimDbcPartnerTradingFee({ signer: signer.publicKey, feeClaimer: signer.publicKey, feeVault: vault, poolConfig: ps.config, virtualPool: pool }),
    );
  } else console.log("a. DBC partner trading fees: nothing unclaimed, skipped");

  // b. migration fee
  if (!migrated) console.log("b. DBC migration fee: the curve has not graduated yet, skipped");
  else if ((ps.migrationFeeWithdrawStatus & PARTNER_MIGRATION_FEE_MASK) !== 0) console.log("b. DBC migration fee: withdrawn already, skipped");
  else {
    await step("b. fund from the DBC partner migration fee", async () => {
      const tx = await dfs.fundByWithdrawDbcMigrationFee({
        signer: signer.publicKey,
        isPartner: true,
        feeVault: vault,
        poolConfig: ps.config,
        virtualPool: pool,
        // dynamic-fee-sharing-sdk 1.1.0 inverts its client-side check for isPartner (it compares the
        // pool's creator with the vault). The instruction it builds is right (flag 0 = partner), and
        // the program checks the fee claimer itself, so the check is satisfied with a copy of the
        // pool state whose creator field reads as the vault. Nothing else reads that field here.
        virtualPoolState: { ...vp, poolState: { ...ps, creator: vault } },
      });
      // Because the SDK check above is bypassed, check what was built: partner flag, vault as sender.
      const disc = DynamicBondingCurveIdl.instructions.find((i) => i.name === "withdraw_migration_fee")?.discriminator;
      if (!disc) throw new Error("withdraw_migration_fee is missing from the DBC IDL");
      const problems = partnerMigrationFeeProblems(tx.instructions, vault, disc);
      if (problems.length) throw new Error(`refusing the migration fee transaction: ${problems.join("; ")}`);
      return tx;
    });
  }

  // c. surplus
  const surplus = ps.quoteReserve.sub(config.migrationQuoteThreshold);
  if (!migrated) console.log("c. DBC surplus: the curve has not graduated yet, skipped");
  else if (ps.isPartnerWithdrawSurplus !== 0) console.log("c. DBC surplus: withdrawn already, skipped");
  else if (surplus.lten(0)) console.log("c. DBC surplus: none, skipped");
  else {
    console.log(`c. DBC surplus: ${fmt(surplus)} tMXN above the threshold (the partner takes its share)`);
    await step("c. fund from the DBC partner surplus", () =>
      dfs.fundByWithdrawDbcPartnerSurplus({ signer: signer.publicKey, feeVault: vault, poolConfig: ps.config, virtualPool: pool }),
    );
  }

  // d. DAMM v2 position fees
  if (!migrated) console.log("d. DAMM v2 position fees: no DAMM v2 pool yet, skipped");
  else {
    await fundFromDamm(ctx, dfs, vault, signer.publicKey, deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption], ps.baseMint, config.quoteMint), step);
  }

  const after = await dfs.getFeeBreakdown(vault);
  console.log(`\nVault funded in total: ${fmt(after.totalFundedFee)} tMXN; claimed ${fmt(after.totalClaimedFee)}; unclaimed ${fmt(after.totalUnclaimedFee)}`);
  for (const u of after.userFees) console.log(`  ${u.address.toBase58()}: claimable ${fmt(u.feeUnclaimed)} tMXN (claimed ${fmt(u.feeClaimed)})`);
  result({ funded: after.totalFundedFee.toString(), unclaimed: after.totalUnclaimedFee.toString(), ...(ctx.dryRun ? { dryRun: "yes" } : {}) });
  if (ctx.dryRun) console.log(`\n${DRY_RUN_END}`);
});

async function fundFromDamm(
  ctx: Ctx,
  dfs: DynamicFeeSharingClient,
  vault: import("@solana/web3.js").PublicKey,
  signer: import("@solana/web3.js").PublicKey,
  dammPool: import("@solana/web3.js").PublicKey,
  step: (label: string, build: () => Promise<Transaction>) => Promise<void>,
) {
  const cpAmm = new CpAmm(ctx.conn);
  const poolState = await cpAmm.fetchPoolState(dammPool);
  const positions = await cpAmm.getUserPositionByPool(dammPool, vault);
  if (positions.length === 0) {
    console.log(`d. DAMM v2 position fees: no position of the vault on ${dammPool.toBase58()}, skipped`);
    return;
  }
  for (const p of positions) {
    const pending = getUnClaimLpFee(poolState, p.positionState);
    if (pending.feeTokenA.isZero() && pending.feeTokenB.isZero()) {
      console.log(`d. DAMM v2 position ${p.position.toBase58()}: no fees yet, skipped (run again after trades on DAMM v2)`);
      continue;
    }
    console.log(`d. DAMM v2 position ${p.position.toBase58()}: ${fmt(pending.feeTokenB)} tMXN and ${fmt(pending.feeTokenA)} tELOTE of fees`);
    await step("d. fund from the DAMM v2 position fees", () =>
      dfs.fundByClaimDammV2Fee({
        signer,
        // owner only names the owner of the token-A (tELOTE) fee account; the DAMM v2 pool collects
        // its fee in tMXN only (migrated collectFeeMode QuoteToken), so nothing goes there.
        owner: signer,
        feeVault: vault,
        dammV2Pool: dammPool,
        dammV2Position: p.position,
        dammV2PositionNftAccount: p.positionNftAccount,
        dammV2PoolState: poolState,
      }),
    );
  }
}
