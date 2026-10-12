// Step 2 of the elote credit preset: builds the R1 bonding curve (prices 1.00 to 1.05 tMXN per token,
// 3,500 tokens, 1% fee in tMXN, 20% migration fee to the partner, migration to DAMM v2 with 100% of
// the partner's liquidity permanently locked) and creates the DBC config whose fee claimer is the fee
// vault PDA and whose leftover receiver is the admin. Prints the threshold, the supply and the sqrt
// prices first. Idempotent: if the config account exists, it is printed and the script exits 0.
//
//   cd scripts/meteora && npx tsx dbc-config.ts --cluster devnet|local [--fee-claimer <vault>]
//        [--leftover-receiver <address>] [--quote-token <address>] [--price-start 1.00] [--price-end 1.05]
//        [--supply 3500] [--fee-bps 100] [--migration-fee-percent 20] [--migrated-fee-bps 30]
//        [--print-only] [--keypair <admin.json>] [--dry-run [--as <address>]]
//
// --fee-claimer        the fee vault PDA (default: the address book, written by fee-vault.ts)
// --leftover-receiver  default: the admin (the signer)
// --print-only         prints the curve and stops (no RPC transaction)
//
// The config account's keypair is kept in .demo-keys/meteora-config.json so a rerun finds it.
// Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import path from "node:path";
import BN from "bn.js";
import {
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DynamicBondingCurveClient,
  getPriceFromSqrtPrice,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  DECIMALS,
  DEVNET,
  accountExists,
  actor,
  addressFrom,
  buildR1Curve,
  explorer,
  fmt,
  keyDir,
  loadOrCreateKeypair,
  readBook,
  result,
  run,
  signersOf,
  start,
  submit,
  writeBook,
} from "./lib.ts";
import { describeCurve, r1FromFlags } from "./curve.ts";

const SCRIPT = "dbc-config";
const USAGE =
  "npx tsx dbc-config.ts --cluster devnet|local [--fee-claimer <vault>] [--leftover-receiver <address>] [--quote-token <address>]\n" +
  "  [--price-start 1.00] [--price-end 1.05] [--supply 3500] [--fee-bps 100] [--migration-fee-percent 20] [--migrated-fee-bps 30]\n" +
  "  [--print-only] [--keypair <admin.json>] [--dry-run [--as <address>]]";

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, {
    values: ["fee-claimer", "leftover-receiver", "quote-token", "price-start", "price-end", "supply", "fee-bps", "migration-fee-percent", "migrated-fee-bps"],
    flags: ["print-only"],
  });
  const params = r1FromFlags(ctx.args.values);
  const { sqrtPrices, curve } = buildR1Curve(params);
  const d = describeCurve(curve, params.migrationFeePercent);

  console.log("R1 curve (buildCurveWithCustomSqrtPrices)");
  console.log(`  prices                ${params.prices.join(" -> ")} tMXN per token`);
  console.log(`  sqrt prices (Q64)     ${sqrtPrices.map((s) => s.toString()).join(", ")}`);
  console.log(`  sqrt start price      ${curve.sqrtStartPrice.toString()} (price ${getPriceFromSqrtPrice(curve.sqrtStartPrice, DECIMALS, DECIMALS).toString()})`);
  curve.curve.forEach((c, i) => console.log(`  segment ${i}             sqrt price ${c.sqrtPrice.toString()}, liquidity ${c.liquidity.toString()}`));
  console.log(`  migration threshold   ${curve.migrationQuoteThreshold.toString()} base units = ${fmt(curve.migrationQuoteThreshold)} tMXN`);
  console.log(`  supply                ${fmt(d.supply)} tokens (pre and post migration)`);
  console.log(`  sold on the curve     ${fmt(d.baseOnCurve)} tokens; to DAMM v2 ${fmt(d.migrationBase)} tokens`);
  console.log(`  migration fee         ${fmt(d.migrationFee)} tMXN to the partner (the fee vault); ${fmt(d.migrationQuote)} tMXN to DAMM v2`);
  console.log(`  trading fee           ${params.feeBps} bps in tMXN; migrated pool fee ${params.migratedPoolFeeBps} bps\n`);
  if (ctx.args.flags.has("print-only")) {
    result({ threshold: curve.migrationQuoteThreshold.toString(), supply: d.supply.toString() });
    return;
  }

  const admin = actor(ctx, "ELOTE_ADMIN_KEYPAIR", "admin");
  const book = readBook(ctx.cluster);
  const feeClaimer = addressFrom(ctx.args, "fee-claimer", book, "vault");
  const quoteMint = addressFrom(ctx.args, "quote-token", {}, "vault", ctx.cluster === "devnet" ? DEVNET.tmxn : undefined);
  const leftoverReceiver = addressFrom(ctx.args, "leftover-receiver", {}, "vault", admin.publicKey.toBase58());
  const dbc = new DynamicBondingCurveClient(ctx.conn, "confirmed");

  const { keypair: config, created } = loadOrCreateKeypair(path.join(keyDir(), "meteora-config.json"), !ctx.dryRun);
  console.log(`Program:           ${DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58()}`);
  console.log(`Config:            ${config.publicKey.toBase58()}${created && ctx.dryRun ? " (throwaway: a placeholder)" : ""}`);
  console.log(`Quote token:       ${quoteMint.toBase58()}`);
  console.log(`Fee claimer:       ${feeClaimer.toBase58()} (fee vault)`);
  console.log(`Leftover receiver: ${leftoverReceiver.toBase58()}`);
  console.log(`Payer:             ${admin.publicKey.toBase58()}\n`);

  if (await accountExists(ctx.conn, config.publicKey)) {
    const state = await dbc.state.getPoolConfig(config.publicKey);
    if (!state) throw new Error(`${config.publicKey.toBase58()} exists but is not a DBC config`);
    if (!state.feeClaimer.equals(feeClaimer)) throw new Error(`the existing config's fee claimer is ${state.feeClaimer.toBase58()}, not ${feeClaimer.toBase58()}`);
    if (!new BN(state.migrationQuoteThreshold.toString()).eq(curve.migrationQuoteThreshold)) {
      throw new Error(`the existing config's threshold is ${state.migrationQuoteThreshold.toString()}, not ${curve.migrationQuoteThreshold.toString()}`);
    }
    console.log("The config exists already: nothing to do.");
    console.log(`  ${explorer(ctx, "address", config.publicKey.toBase58())}`);
    if (!ctx.dryRun) writeBook(ctx.cluster, { config: config.publicKey.toBase58() });
    result({ config: config.publicKey.toBase58(), threshold: curve.migrationQuoteThreshold.toString() });
    return;
  }

  const tx = await dbc.partner.createConfig({
    config: config.publicKey,
    quoteMint,
    feeClaimer,
    leftoverReceiver,
    payer: admin.publicKey,
    ...curve,
  });
  await submit(ctx, "create the DBC config (createConfig)", admin.publicKey, tx.instructions, signersOf(admin, config));
  if (ctx.dryRun) {
    console.log("\nDry run: nothing was sent.");
    result({ config: config.publicKey.toBase58(), threshold: curve.migrationQuoteThreshold.toString(), dryRun: "yes" });
    return;
  }
  writeBook(ctx.cluster, { config: config.publicKey.toBase58() });
  console.log(`  config ${explorer(ctx, "address", config.publicKey.toBase58())}`);
  result({ config: config.publicKey.toBase58(), threshold: curve.migrationQuoteThreshold.toString() });
});
