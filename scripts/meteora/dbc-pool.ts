// Step 3 of the elote credit preset: creates the tELOTE pool on the R1 config, with the treasury as
// creator. Name "Elote Community (devnet test)", symbol tELOTE, metadata at
// https://elote.baby/token/telote.json (hosted from web/public/token/). Idempotent: if the pool
// exists, it is printed and the script exits 0. Without --send it only simulates; it prints the
// config it binds to (quote token, fee claimer, threshold) and the token and pool --send creates.
//
//   cd scripts/meteora && npx tsx dbc-pool.ts --cluster devnet|local [--config <address>]
//        [--uri <https url>] [--keypair <treasury.json>] [--as <address>] [--send]
//
// --config   the DBC config (default: the address book, written by dbc-config.ts)
// --keypair  the treasury, creator and payer (default ELOTE_TREASURY_KEYPAIR, .demo-keys/treasury.json)
//
// The token's keypair is kept in .demo-keys/meteora-<cluster>-telote-token.json so a rerun finds the same pool.
// Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  TELOTE,
  UsageError,
  accountExists,
  actor,
  addressFrom,
  explorer,
  accountKeyPath,
  DEVNET,
  fmt,
  loadOrCreateKeypair,
  readBook,
  result,
  run,
  signersOf,
  start,
  submit,
  writeBook,
  DRY_RUN_END,
} from "./lib.ts";

const SCRIPT = "dbc-pool";
const USAGE = "npx tsx dbc-pool.ts --cluster devnet|local [--config <address>] [--uri <https url>] [--keypair <treasury.json>] [--as <address>] [--send]";

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, { values: ["config", "uri"], flags: [] });
  const book = readBook(ctx.cluster);
  const treasury = actor(ctx, "ELOTE_TREASURY_KEYPAIR", "treasury");
  const config = addressFrom(ctx.args, "config", book, "config");
  const uri = ctx.args.values.uri ?? TELOTE.uri;
  if (!/^https:\/\//.test(uri) || uri.length > 200) throw new UsageError("--uri must be an https URL of at most 200 bytes");

  const dbc = new DynamicBondingCurveClient(ctx.conn, "confirmed");
  const state = await dbc.state.getPoolConfig(config);
  if (!state) throw new Error(`no DBC config at ${config.toBase58()}`);

  const { keypair: token } = loadOrCreateKeypair(accountKeyPath(ctx.cluster, "telote-token"));
  const pool = deriveDbcPoolAddress(state.quoteMint, token.publicKey, config);
  console.log(`Config:       ${config.toBase58()}`);
  console.log(`  quote token ${state.quoteMint.toBase58()}`);
  console.log(`  fee claimer ${state.feeClaimer.toBase58()} (must be the fee vault${book.vault ? ` ${book.vault}` : ""})`);
  console.log(`  threshold   ${state.migrationQuoteThreshold.toString()} base units = ${fmt(BigInt(state.migrationQuoteThreshold.toString()))} tMXN`);
  console.log(`Creator:      ${treasury.publicKey.toBase58()} (treasury, pays)`);
  console.log(`Token:        ${token.publicKey.toBase58()} (${TELOTE.symbol}, "${TELOTE.name}"; the address --send creates)`);
  console.log(`Pool:         ${pool.toBase58()}`);
  console.log(`URI:          ${uri}\n`);
  if (book.vault && state.feeClaimer.toBase58() !== book.vault) {
    throw new Error(`the config's fee claimer ${state.feeClaimer.toBase58()} is not the address book's fee vault ${book.vault}`);
  }
  if (ctx.cluster === "devnet" && state.quoteMint.toBase58() !== DEVNET.tmxn) {
    console.log(`*** the config's quote token ${state.quoteMint.toBase58()} is not tMXN ${DEVNET.tmxn}\n`);
  }

  if (await accountExists(ctx.conn, pool)) {
    console.log("The pool exists already: nothing to do.");
    console.log(`  ${explorer(ctx, "address", pool.toBase58())}`);
    writeBook(ctx.cluster, { baseMint: token.publicKey.toBase58(), dbcPool: pool.toBase58() });
    result({ baseMint: token.publicKey.toBase58(), pool: pool.toBase58() });
    return;
  }

  const tx = await dbc.creator.createPool({
    name: TELOTE.name,
    symbol: TELOTE.symbol,
    uri,
    payer: treasury.publicKey,
    poolCreator: treasury.publicKey,
    config,
    baseMint: token.publicKey,
  });
  await submit(ctx, "create the tELOTE pool (initializeVirtualPoolWithSplToken)", treasury.publicKey, tx.instructions, signersOf(treasury, token));
  if (ctx.dryRun) {
    result({ baseMint: token.publicKey.toBase58(), pool: pool.toBase58(), dryRun: "yes" });
    console.log(`\n${DRY_RUN_END}`);
    return;
  }
  writeBook(ctx.cluster, { baseMint: token.publicKey.toBase58(), dbcPool: pool.toBase58() });
  console.log(`  pool ${explorer(ctx, "address", pool.toBase58())}`);
  result({ baseMint: token.publicKey.toBase58(), pool: pool.toBase58() });
});
