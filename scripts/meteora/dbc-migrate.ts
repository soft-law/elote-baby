// Step 5 of the elote credit preset: graduates the tELOTE curve to a DAMM v2 pool once the quote
// reserve has reached the threshold (devnet has no migration keepers, so someone has to send it).
// Resumable: each sub-step reads the chain first and is skipped if done.
//
//   a. locker: only when the config has locked vesting (R1 has none, so it is skipped with the reason)
//   b. migrateToDammV2 with the DAMM v2 config of the pool's migration fee option (Customizable: A8gM...)
//   c. reads back the DAMM v2 pool and the partner position, owned by the fee vault (the fee claimer)
//
// DAMM v2 needs no migration metadata account (that step exists only for DAMM v1).
//
//   cd scripts/meteora && npx tsx dbc-migrate.ts --cluster devnet|local [--pool <address>]
//        [--keypair <payer.json>] [--dry-run [--as <address>]]
//
// --pool     the DBC pool (default: the address book)
// --keypair  any funded wallet pays (default ELOTE_ADMIN_KEYPAIR, .demo-keys/admin.json)
//
// Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import BN from "bn.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  deriveBaseKeyForLocker,
  deriveDammV2PoolAddress,
  deriveEscrow,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { accountExists, actor, addressFrom, explorer, fmt, readBook, result, run, signersOf, start, submit, waitFor, writeBook } from "./lib.ts";

const SCRIPT = "dbc-migrate";
const USAGE = "npx tsx dbc-migrate.ts --cluster devnet|local [--pool <address>] [--keypair <payer.json>] [--dry-run [--as <address>]]";

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, { values: ["pool"], flags: [] });
  const book = readBook(ctx.cluster);
  const pool = addressFrom(ctx.args, "pool", book, "dbcPool");
  const payer = actor(ctx, "ELOTE_ADMIN_KEYPAIR", "admin");
  const dbc = new DynamicBondingCurveClient(ctx.conn, "confirmed");

  const vp = await dbc.state.getPool(pool);
  if (!vp) throw new Error(`no DBC pool at ${pool.toBase58()}`);
  const config = await dbc.state.getPoolConfig(vp.poolState.config);
  if (!config) throw new Error(`no DBC config at ${vp.poolState.config.toBase58()}`);
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption];
  if (!dammConfig) throw new Error(`no DAMM v2 config for migration fee option ${config.migrationFeeOption}`);
  const dammPool = deriveDammV2PoolAddress(dammConfig, vp.poolState.baseMint, config.quoteMint);

  console.log(`DBC pool:     ${pool.toBase58()}`);
  console.log(`Token:        ${vp.poolState.baseMint.toBase58()}`);
  console.log(`Quote:        ${fmt(BigInt(vp.poolState.quoteReserve.toString()))} / ${fmt(BigInt(config.migrationQuoteThreshold.toString()))} tMXN`);
  console.log(`DAMM config:  ${dammConfig.toBase58()} (migration fee option ${config.migrationFeeOption})`);
  console.log(`DAMM v2 pool: ${dammPool.toBase58()}`);
  console.log(`Fee claimer:  ${config.feeClaimer.toBase58()} (receives the partner position)\n`);

  if (vp.poolState.quoteReserve.lt(config.migrationQuoteThreshold)) {
    throw new Error("the curve has not reached the threshold yet: buy with dbc-swap.ts first");
  }

  // a. locker (locked vesting only)
  if (config.lockedVestingConfig.amountPerPeriod.gt(new BN(0)) || config.lockedVestingConfig.cliffUnlockAmount.gt(new BN(0))) {
    const escrow = deriveEscrow(deriveBaseKeyForLocker(pool));
    if (await accountExists(ctx.conn, escrow)) console.log("a. locker: exists, skipped");
    else {
      const tx = await dbc.migration.createLocker({ pool, payer: payer.publicKey });
      await submit(ctx, "a. create the locker (createLocker)", payer.publicKey, tx.instructions, signersOf(payer));
    }
  } else {
    console.log("a. locker: not needed (the config has no locked vesting)");
  }

  // b. migrate
  if (vp.poolState.isMigrated !== 0) {
    console.log("b. migrateToDammV2: done already, skipped");
  } else {
    const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await dbc.migration.migrateToDammV2({
      payer: payer.publicKey,
      pool,
      dammConfig,
    });
    await submit(ctx, "b. migrate to DAMM v2 (migrationDammV2)", payer.publicKey, transaction.instructions, [
      ...signersOf(payer),
      firstPositionNftKeypair,
      secondPositionNftKeypair,
    ]);
    if (ctx.dryRun) {
      console.log("\nDry run: nothing was sent.");
      result({ dammPool: dammPool.toBase58(), dryRun: "yes" });
      return;
    }
  }

  // c. read back
  const cpAmm = new CpAmm(ctx.conn);
  await waitFor(() => accountExists(ctx.conn, dammPool));
  const state = await cpAmm.fetchPoolState(dammPool);
  const positions = await cpAmm.getUserPositionByPool(dammPool, config.feeClaimer);
  const after = await dbc.state.getPool(pool);
  console.log(`c. DAMM v2 pool ${dammPool.toBase58()}: liquidity ${state.liquidity.toString()}, permanently locked ${state.permanentLockLiquidity.toString()}`);
  console.log(`   ${explorer(ctx, "address", dammPool.toBase58())}`);
  console.log(`   DBC pool migrated: ${after?.poolState.isMigrated === 1 ? "yes" : "no"}, migration progress ${after?.poolState.migrationProgress}`);
  if (positions.length === 0) throw new Error(`no DAMM v2 position owned by the fee claimer ${config.feeClaimer.toBase58()}`);
  for (const p of positions) {
    console.log(`   partner position ${p.position.toBase58()} (NFT account ${p.positionNftAccount.toBase58()}), owned by the fee vault`);
    console.log(`     permanently locked liquidity ${p.positionState.permanentLockedLiquidity.toString()}, unlocked ${p.positionState.unlockedLiquidity.toString()}`);
  }
  writeBook(ctx.cluster, { dammPool: dammPool.toBase58(), position: positions[0].position.toBase58() });
  result({ dammPool: dammPool.toBase58(), position: positions[0].position.toBase58() });
});
