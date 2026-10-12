// Step 2 of the elote credit preset: builds the R1 bonding curve (prices 1.00 to 1.05 tMXN per token,
// 3,500 tokens, 1% fee in tMXN, 20% migration fee to the partner, migration to DAMM v2 with 100% of
// the partner's liquidity permanently locked) and creates the DBC config whose fee claimer is the fee
// vault PDA and whose leftover receiver is the admin. Prints every value first. Idempotent: if the
// config account exists, it is checked, printed, and the script exits 0.
//
//   cd scripts/meteora && npx tsx dbc-config.ts --cluster devnet|local [--fee-claimer <vault>]
//        [--treasury <address>] [--leftover-receiver <address>] [--quote-token <address>]
//        [--price-start 1.00] [--price-end 1.05] [--supply 3500] [--fee-bps 100] [--migration-fee-percent 20]
//        [--migrated-fee-bps 30] [--print-only] [--keypair <admin.json>] [--as <address>] [--send]
//
// Without --send it only simulates and prints the config address --send would create.
// --fee-claimer        the fee vault PDA (default: the address book, written by fee-vault.ts). It is
//                      checked first: a Dynamic Fee Sharing PDA vault for the quote token, with the
//                      treasury at 8000 and the admin at 2000. A config's fee claimer cannot be changed.
// --leftover-receiver  default and, on devnet, required: the devnet admin Hj5p...; on local the signer
// --quote-token        on devnet tMXN 5RyA... unless given (then an OVERRIDE line is printed)
// --print-only         prints the curve and stops (no RPC transaction)
//
// The config account's keypair is kept in .demo-keys/meteora-<cluster>-config.json so a rerun finds it.
// Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import {
  ActivationType,
  CollectFeeMode,
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenType,
  getPriceFromSqrtPrice,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  DECIMALS,
  DEVNET,
  DRY_RUN_END,
  UsageError,
  accountExists,
  accountKeyPath,
  actor,
  addressFrom,
  buildR1Curve,
  explorer,
  fmt,
  loadOrCreateKeypair,
  readBook,
  result,
  run,
  signersOf,
  start,
  submit,
  writeBook,
} from "./lib.ts";
import { describeCurve, r1FromFlags, r1Overrides } from "./curve.ts";
import { verifyFeeVault } from "./vault.ts";

const SCRIPT = "dbc-config";
const USAGE =
  "npx tsx dbc-config.ts --cluster devnet|local [--fee-claimer <vault>] [--treasury <address>] [--leftover-receiver <address>] [--quote-token <address>]\n" +
  "  [--price-start 1.00] [--price-end 1.05] [--supply 3500] [--fee-bps 100] [--migration-fee-percent 20] [--migrated-fee-bps 30]\n" +
  "  [--print-only] [--keypair <admin.json>] [--as <address>] [--send]";

const named = (e: Record<number, string>, v: number) => `${v} (${e[v] ?? "?"})`;

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, {
    values: ["fee-claimer", "treasury", "leftover-receiver", "quote-token", "price-start", "price-end", "supply", "fee-bps", "migration-fee-percent", "migrated-fee-bps"],
    flags: ["print-only"],
  });
  const params = r1FromFlags(ctx.args.values);
  const { sqrtPrices, curve } = buildR1Curve(params);
  const d = describeCurve(curve, params.migrationFeePercent);
  const overrides = r1Overrides(params);

  console.log("R1 curve (buildCurveWithCustomSqrtPrices)");
  console.log(`  prices                 ${params.prices.join(" -> ")} tMXN per token`);
  console.log(`  sqrt prices (Q64)      ${sqrtPrices.map((s) => s.toString()).join(", ")}`);
  console.log(`  sqrt start price       ${curve.sqrtStartPrice.toString()} (price ${getPriceFromSqrtPrice(curve.sqrtStartPrice, DECIMALS, DECIMALS).toString()})`);
  curve.curve.forEach((c, i) => console.log(`  segment ${i}              sqrt price ${c.sqrtPrice.toString()}, liquidity ${c.liquidity.toString()}`));
  console.log(`  migration threshold    ${curve.migrationQuoteThreshold.toString()} base units = ${fmt(curve.migrationQuoteThreshold)} tMXN`);
  console.log(`  supply                 ${fmt(d.supply)} tokens (pre and post migration), ${curve.tokenDecimal} decimals`);
  console.log(`  sold on the curve      ${fmt(d.baseOnCurve)} tokens; to DAMM v2 about ${fmt(d.migrationBase)} tokens`);
  console.log(`  migration fee          ${fmt(d.migrationFee)} tMXN to the partner (the fee vault); ${fmt(d.migrationQuote)} tMXN to DAMM v2 before Meteora's share`);
  console.log(`  trading fee            ${params.feeBps} bps; collectFeeMode ${named(CollectFeeMode, curve.collectFeeMode)}`);
  console.log(`  creator trading fee    ${curve.creatorTradingFeePercentage}% (all of the non-protocol fee goes to the partner)`);
  console.log(`  pool creation fee      ${curve.poolCreationFee.toString()}`);
  console.log(`  token                  tokenType ${named(TokenType, curve.tokenType)}, tokenAuthorityOption ${named(TokenAuthorityOption, curve.tokenUpdateAuthority)}`);
  console.log(`  migration              migrationOption ${named(MigrationOption, curve.migrationOption)}, migrationFeeOption ${named(MigrationFeeOption, curve.migrationFeeOption)}`);
  console.log(`  migration fee split    ${curve.migrationFee.feePercentage}% of the raise, creator share ${curve.migrationFee.creatorFeePercentage}%`);
  console.log(`  migrated pool          fee ${curve.migratedPoolFee.poolFeeBps} bps, collectFeeMode ${curve.migratedPoolFee.collectFeeMode}, dynamic fee ${curve.migratedPoolFee.dynamicFee}`);
  console.log(
    `  liquidity              partner ${curve.partnerLiquidityPercentage}%, creator ${curve.creatorLiquidityPercentage}%, ` +
      `partner permanent lock ${curve.partnerPermanentLockedLiquidityPercentage}%, creator permanent lock ${curve.creatorPermanentLockedLiquidityPercentage}%`,
  );
  console.log(`  locked vesting         amount per period ${curve.lockedVesting.amountPerPeriod.toString()}, cliff ${curve.lockedVesting.cliffUnlockAmount.toString()} (none)`);
  console.log(`  activationType         ${named(ActivationType, curve.activationType)}`);
  if (overrides.length) {
    console.log("");
    for (const o of overrides) console.log(`  *** OVERRIDE differs from R1: ${o}`);
  } else console.log("  (R1 preset, no overrides)");
  console.log("");
  if (ctx.args.flags.has("print-only")) {
    result({ threshold: curve.migrationQuoteThreshold.toString(), supply: d.supply.toString() });
    return;
  }

  const admin = actor(ctx, "ELOTE_ADMIN_KEYPAIR", "admin");
  const book = readBook(ctx.cluster);
  const devnet = ctx.cluster === "devnet";
  const feeClaimer = addressFrom(ctx.args, "fee-claimer", book, "vault");
  const quoteMint = addressFrom(ctx.args, "quote-token", {}, "vault", devnet ? DEVNET.tmxn : undefined);
  if (devnet && !quoteMint.equals(new PublicKey(DEVNET.tmxn))) console.log(`  *** OVERRIDE differs from R1: --quote-token ${quoteMint.toBase58()} (R1 tMXN ${DEVNET.tmxn})\n`);
  const leftoverReceiver = addressFrom(ctx.args, "leftover-receiver", {}, "vault", devnet ? DEVNET.admin : admin.publicKey.toBase58());
  if (devnet && !leftoverReceiver.equals(new PublicKey(DEVNET.admin))) {
    throw new UsageError(`on devnet the leftover receiver must be the admin ${DEVNET.admin}, not ${leftoverReceiver.toBase58()}`);
  }
  const treasuryArg = ctx.args.values.treasury ?? book.treasury;
  const treasury = treasuryArg ? addressFrom(ctx.args, "treasury", book, "treasury") : undefined;

  // The fee claimer is written into the config for good: check it is the R1 vault before building.
  await verifyFeeVault(ctx.conn, feeClaimer, { token: quoteMint, admin: devnet ? new PublicKey(DEVNET.admin) : leftoverReceiver, treasury });
  console.log(`Fee vault checked:  ${feeClaimer.toBase58()} is a Dynamic Fee Sharing PDA vault for ${quoteMint.toBase58()}, treasury 8000 / admin 2000`);

  const dbc = new DynamicBondingCurveClient(ctx.conn, "confirmed");
  const { keypair: config } = loadOrCreateKeypair(accountKeyPath(ctx.cluster, "config"));
  console.log(`Program:            ${DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58()}`);
  console.log(`Config:             ${config.publicKey.toBase58()} (the address --send creates)`);
  console.log(`Quote token:        ${quoteMint.toBase58()}`);
  console.log(`Fee claimer:        ${feeClaimer.toBase58()} (fee vault)`);
  console.log(`Leftover receiver:  ${leftoverReceiver.toBase58()}`);
  console.log(`Payer:              ${admin.publicKey.toBase58()}\n`);

  if (await accountExists(ctx.conn, config.publicKey)) {
    const state = await dbc.state.getPoolConfig(config.publicKey);
    if (!state) throw new Error(`${config.publicKey.toBase58()} exists but is not a DBC config`);
    if (!state.feeClaimer.equals(feeClaimer)) throw new Error(`the existing config's fee claimer is ${state.feeClaimer.toBase58()}, not ${feeClaimer.toBase58()}`);
    if (!new BN(state.migrationQuoteThreshold.toString()).eq(curve.migrationQuoteThreshold)) {
      throw new Error(`the existing config's threshold is ${state.migrationQuoteThreshold.toString()}, not ${curve.migrationQuoteThreshold.toString()}`);
    }
    console.log("The config exists already: nothing to do.");
    console.log(`  ${explorer(ctx, "address", config.publicKey.toBase58())}`);
    writeBook(ctx.cluster, { config: config.publicKey.toBase58() });
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
    result({ config: config.publicKey.toBase58(), threshold: curve.migrationQuoteThreshold.toString(), dryRun: "yes" });
    console.log(`\n${DRY_RUN_END}`);
    return;
  }
  writeBook(ctx.cluster, { config: config.publicKey.toBase58() });
  console.log(`  config ${explorer(ctx, "address", config.publicKey.toBase58())}`);
  result({ config: config.publicKey.toBase58(), threshold: curve.migrationQuoteThreshold.toString() });
});
