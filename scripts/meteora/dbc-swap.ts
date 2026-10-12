// Step 4 of the elote credit preset: buys tELOTE with tMXN on the curve (or sells it back) and prints
// the progress toward the migration threshold (quote reserve / threshold) after the swap. After
// graduation the same command swaps on the DAMM v2 pool instead (its fees go to the vault's position). Buys use the
// partial-fill mode, so a buy larger than what is left stops exactly at the threshold and the rest of
// the tMXN stays with the buyer.
//
//   cd scripts/meteora && npx tsx dbc-swap.ts --cluster devnet|local --amount <tMXN> [--sell <tELOTE>]
//        [--pool <address>] [--slippage-bps 100] [--keypair <buyer.json>] [--dry-run [--as <address>]]
//
// --amount        tMXN to spend on a buy (up to 6 decimals)
// --sell          tELOTE to sell back instead of buying
// --pool          the DBC pool (default: the address book, written by dbc-pool.ts)
// --keypair       the buyer (default ELOTE_BUYER_KEYPAIR, .demo-keys/investor-a.json)
//
// Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import BN from "bn.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  SwapMode,
  deriveDammV2PoolAddress,
  getCurrentPoint,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { progressBps } from "./curve.ts";
import {
  TOKEN_PROGRAM,
  UsageError,
  actor,
  addressFrom,
  fmt,
  parseAmount,
  parseNumber,
  readBook,
  result,
  run,
  signersOf,
  start,
  submit,
} from "./lib.ts";

const SCRIPT = "dbc-swap";
const USAGE =
  "npx tsx dbc-swap.ts --cluster devnet|local (--amount <tMXN> | --sell <tELOTE>) [--pool <address>] [--slippage-bps 100] [--keypair <buyer.json>] [--dry-run [--as <address>]]";

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, { values: ["amount", "sell", "pool", "slippage-bps"], flags: [] });
  const { amount, sell } = ctx.args.values;
  if ((amount === undefined) === (sell === undefined)) throw new UsageError("give exactly one of --amount <tMXN> (buy) or --sell <tELOTE>");
  const isSell = sell !== undefined;
  const amountIn = parseAmount(isSell ? "--sell" : "--amount", (sell ?? amount)!);
  const slippageBps = parseNumber("--slippage-bps", ctx.args.values["slippage-bps"] ?? "100", 0, 5000);
  const book = readBook(ctx.cluster);
  const pool = addressFrom(ctx.args, "pool", book, "dbcPool");
  const buyer = actor(ctx, "ELOTE_BUYER_KEYPAIR", "investor-a");

  const dbc = new DynamicBondingCurveClient(ctx.conn, "confirmed");
  const progress = async () => {
    const vp = await dbc.state.getPool(pool);
    if (!vp) throw new Error(`no DBC pool at ${pool.toBase58()}`);
    const config = await dbc.state.getPoolConfig(vp.poolState.config);
    if (!config) throw new Error(`no DBC config at ${vp.poolState.config.toBase58()}`);
    const reserve = BigInt(vp.poolState.quoteReserve.toString());
    const threshold = BigInt(config.migrationQuoteThreshold.toString());
    return { vp, config, reserve, threshold, bps: progressBps(reserve, threshold) };
  };
  const show = (label: string, p: Awaited<ReturnType<typeof progress>>) =>
    console.log(`${label}: ${fmt(p.reserve)} / ${fmt(p.threshold)} tMXN (${(Number(p.bps) / 100).toFixed(2)}% of the threshold)`);

  const before = await progress();
  console.log(`Pool:  ${pool.toBase58()}\nBuyer: ${buyer.publicKey.toBase58()}`);
  show("Progress before", before);
  if (before.vp.poolState.isMigrated !== 0) {
    // After graduation the market is the DAMM v2 pool; its trading fees accrue to the vault's position.
    const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[before.config.migrationFeeOption];
    const dammPool = deriveDammV2PoolAddress(dammConfig, before.vp.poolState.baseMint, before.config.quoteMint);
    const cpAmm = new CpAmm(ctx.conn);
    const ps = await cpAmm.fetchPoolState(dammPool);
    const input = isSell ? ps.tokenAMint : ps.tokenBMint;
    const output = isSell ? ps.tokenBMint : ps.tokenAMint;
    const slot = await ctx.conn.getSlot("confirmed");
    const time = (await ctx.conn.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
    const q = cpAmm.getQuote({
      inAmount: new BN(amountIn.toString()),
      inputTokenMint: input,
      slippage: slippageBps / 100,
      poolState: ps,
      currentTime: time,
      currentSlot: slot,
      tokenADecimal: 6,
      tokenBDecimal: 6,
    });
    console.log(`The curve has graduated: swapping on the DAMM v2 pool ${dammPool.toBase58()}`);
    console.log(`Quote: ${fmt(amountIn)} ${isSell ? "tELOTE" : "tMXN"} for about ${fmt(q.swapOutAmount)} ${isSell ? "tMXN" : "tELOTE"} (at least ${fmt(q.minSwapOutAmount)})`);
    const tx = await cpAmm.swap({
      payer: buyer.publicKey,
      pool: dammPool,
      inputTokenMint: input,
      outputTokenMint: output,
      amountIn: new BN(amountIn.toString()),
      minimumAmountOut: q.minSwapOutAmount,
      tokenAMint: ps.tokenAMint,
      tokenBMint: ps.tokenBMint,
      tokenAVault: ps.tokenAVault,
      tokenBVault: ps.tokenBVault,
      tokenAProgram: TOKEN_PROGRAM,
      tokenBProgram: TOKEN_PROGRAM,
      referralTokenAccount: null,
      poolState: ps,
    });
    await submit(ctx, `${isSell ? "sell" : "buy"} tELOTE on DAMM v2 (swap)`, buyer.publicKey, tx.instructions, signersOf(buyer));
    result({ graduated: "yes", dammPool: dammPool.toBase58() });
    return;
  }
  if (before.reserve >= before.threshold) {
    console.log("The curve has reached the threshold: no more swaps here (run dbc-migrate.ts).");
    result({ progressBps: before.bps.toString(), graduated: "pending" });
    return;
  }

  const currentPoint = await getCurrentPoint(ctx.conn, before.config.activationType);
  const quote = dbc.pool.swapQuote2({
    virtualPool: before.vp,
    config: before.config,
    swapBaseForQuote: isSell,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
    slippageBps,
    swapMode: isSell ? SwapMode.ExactIn : SwapMode.PartialFill,
    amountIn: new BN(amountIn.toString()),
  });
  const minOut = quote.minimumAmountOut ?? new BN(0);
  const used = quote.includedFeeInputAmount ?? new BN(amountIn.toString());
  console.log(
    isSell
      ? `Quote: sell ${fmt(amountIn)} tELOTE for about ${fmt(quote.outputAmount)} tMXN (at least ${fmt(minOut)})`
      : `Quote: spend ${fmt(used)} of ${fmt(amountIn)} tMXN for about ${fmt(quote.outputAmount)} tELOTE (at least ${fmt(minOut)}); fee after the protocol share ${fmt(quote.tradingFee)} tMXN`,
  );

  const tx = await dbc.pool.swap2({
    owner: buyer.publicKey,
    pool,
    swapBaseForQuote: isSell,
    referralTokenAccount: null,
    ...(isSell
      ? { swapMode: SwapMode.ExactIn as const, amountIn: new BN(amountIn.toString()), minimumAmountOut: minOut }
      : { swapMode: SwapMode.PartialFill as const, amountIn: new BN(amountIn.toString()), minimumAmountOut: minOut }),
  });
  await submit(ctx, isSell ? "sell tELOTE (swap2, exact in)" : "buy tELOTE (swap2, partial fill)", buyer.publicKey, tx.instructions, signersOf(buyer));
  if (ctx.dryRun) {
    console.log("\nDry run: nothing was sent.");
    result({ progressBps: before.bps.toString(), dryRun: "yes" });
    return;
  }
  const after = await progress();
  show("Progress after", after);
  if (after.reserve >= after.threshold) console.log("Threshold reached: the curve is complete. Next: dbc-migrate.ts.");
  result({ progressBps: after.bps.toString(), quoteReserve: after.reserve.toString(), threshold: after.threshold.toString() });
});
