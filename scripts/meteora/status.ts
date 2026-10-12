// Read-only status of the elote credit preset: curve progress, migration state, fee vault totals and
// what each user can claim, the treasury's elote pool shares and the pool's value per share. Sends
// nothing and reads no keys; addresses come from flags or the address book (.demo-keys/meteora-<cluster>.json).
//
//   cd scripts/meteora && npx tsx status.ts --cluster devnet|local [--pool <dbc pool>] [--vault <address>]
//        [--treasury <address>] [--elote-pool <address>]
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import { CpAmm, getUnClaimLpFee } from "@meteora-ag/cp-amm-sdk";
import { DAMM_V2_MIGRATION_FEE_ADDRESS, DynamicBondingCurveClient, deriveDammV2PoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { DynamicFeeSharingClient } from "@meteora-ag/dynamic-fee-sharing-sdk";
import { progressBps } from "./curve.ts";
import { ata, eloteRpc, snapshot, tokenAmount } from "./elote.ts";
import { DEVNET, explorer, fmt, parseAddress, readBook, result, run, start } from "./lib.ts";

const SCRIPT = "status";
const USAGE = "npx tsx status.ts --cluster devnet|local [--pool <dbc pool>] [--vault <address>] [--treasury <address>] [--elote-pool <address>]";
const PARTNER_MIGRATION_FEE_MASK = 0b100;

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, { values: ["pool", "vault", "treasury", "elote-pool"], flags: [] });
  const book = readBook(ctx.cluster);
  const pick = (flag: string, fallback?: string) => {
    const v = ctx.args.values[flag] ?? fallback;
    return v ? parseAddress(`--${flag}`, v) : null;
  };
  const pool = pick("pool", book.dbcPool);
  const vault = pick("vault", book.vault);
  const treasury = pick("treasury", book.treasury);
  const elotePool = pick("elote-pool", ctx.cluster === "devnet" ? DEVNET.elotePool : undefined);
  const out: Record<string, string> = {};

  if (pool) {
    const dbc = new DynamicBondingCurveClient(ctx.conn, "confirmed");
    const vp = await dbc.state.getPool(pool);
    const config = vp && (await dbc.state.getPoolConfig(vp.poolState.config));
    if (!vp || !config) console.log(`Curve: no DBC pool at ${pool.toBase58()}`);
    else {
      const ps = vp.poolState;
      const reserve = BigInt(ps.quoteReserve.toString());
      const threshold = BigInt(config.migrationQuoteThreshold.toString());
      const bps = progressBps(reserve, threshold);
      out.progressBps = bps.toString();
      out.migrated = ps.isMigrated ? "yes" : "no";
      console.log(`Curve ${pool.toBase58()}`);
      console.log(`  progress          ${fmt(reserve)} / ${fmt(threshold)} tMXN (${(Number(bps) / 100).toFixed(2)}%)`);
      console.log(`  migrated          ${ps.isMigrated ? "yes" : "no"} (migration progress ${ps.migrationProgress})`);
      console.log(`  partner fees      ${fmt(ps.partnerQuoteFee)} tMXN not yet moved to the vault`);
      console.log(`  migration fee     ${(ps.migrationFeeWithdrawStatus & PARTNER_MIGRATION_FEE_MASK) !== 0 ? "moved to the vault" : ps.isMigrated ? "not yet moved" : "due at graduation"}`);
      console.log(`  ${explorer(ctx, "address", pool.toBase58())}`);
      if (ps.isMigrated) {
        const dammPool = deriveDammV2PoolAddress(DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption], ps.baseMint, config.quoteMint);
        const cpAmm = new CpAmm(ctx.conn);
        const dps = await cpAmm.fetchPoolState(dammPool);
        console.log(`DAMM v2 pool ${dammPool.toBase58()}: liquidity ${dps.liquidity.toString()}, permanently locked ${dps.permanentLockLiquidity.toString()}`);
        out.dammPool = dammPool.toBase58();
        for (const p of await cpAmm.getUserPositionByPool(dammPool, config.feeClaimer)) {
          const fee = getUnClaimLpFee(dps, p.positionState);
          console.log(`  vault position ${p.position.toBase58()}: ${fmt(fee.feeTokenB)} tMXN of fees not yet moved to the vault`);
        }
      }
    }
  }

  if (vault) {
    const dfs = new DynamicFeeSharingClient(ctx.conn, "confirmed");
    const b = await dfs.getFeeBreakdown(vault);
    out.vaultFunded = b.totalFundedFee.toString();
    console.log(`Fee vault ${vault.toBase58()}`);
    console.log(`  funded ${fmt(b.totalFundedFee)} tMXN; claimed ${fmt(b.totalClaimedFee)}; unclaimed ${fmt(b.totalUnclaimedFee)}`);
    for (const u of b.userFees) {
      const who = treasury && u.address.equals(treasury) ? " (treasury)" : "";
      console.log(`  ${u.address.toBase58()}${who}: claimable ${fmt(u.feeUnclaimed)}, claimed ${fmt(u.feeClaimed)}`);
    }
  }

  if (elotePool) {
    const rpc = eloteRpc(ctx.rpcUrl);
    const s = await snapshot(rpc, elotePool.toBase58());
    out.perShare = s.perShare.toString();
    console.log(`Elote pool ${elotePool.toBase58()}`);
    console.log(`  NAV ${fmt(s.nav)} tMXN, share supply ${fmt(s.supply)}, value per share ${fmt(s.perShare)} tMXN`);
    if (treasury) {
      const shares = await tokenAmount(rpc, await ata(treasury.toBase58(), s.shareMint));
      out.treasuryShares = shares.toString();
      console.log(`  treasury ${treasury.toBase58()} holds ${fmt(shares)} shares (about ${fmt(s.supply === 0n ? 0n : (shares * s.nav) / s.supply)} tMXN)`);
    }
  }
  result(out);
});
