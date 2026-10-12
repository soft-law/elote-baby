// Shared helpers for the elote credit preset scripts (Meteora DBC, DAMM v2 and Dynamic Fee Sharing on
// Solana devnet). Flag parsing, cluster and keypair handling, dry-run simulation, sending, explorer
// links, the R1 curve and the small address book the scripts share.
//
// Keys are read from files and never printed; only addresses, signatures and explorer links are.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  type Signer,
  type TransactionInstruction,
  TransactionExpiredBlockheightExceededError,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenType,
  buildCurveWithCustomSqrtPrices,
  getSqrtPriceFromPrice,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

export const DISCLAIMER = "Demo on Solana devnet with test assets. Not an offer of securities.";
export const ASSET = "tMXN (devnet test token, no value)";
export const DECIMALS = 6;
export const UNIT = 10n ** BigInt(DECIMALS);

/** Devnet addresses of the elote demo (the brief's R1 values). */
export const DEVNET = {
  tmxn: "5RyA7YFdhqHz4CLSAyep2w3fJMFvjg4i3s2UmgRUrmYb",
  admin: "Hj5pkVVYa3Qb4qtKr56mMEY69JXWSMXuxtzd4nChdTF4",
  elotePool: "5bndQsto8p3rXEcG2Crz2zRSk2KN2fKwBsk5S2k2ndET",
} as const;

export const GENESIS = {
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
} as const;

export const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const DEFAULT_CU_PRICE = 100_000; // micro-lamports, the brief's computeUnitPriceMicroLamports

/** Name, symbol and hosted metadata of the community token on the R1 curve. */
export const TELOTE = {
  name: "Elote Community (devnet test)",
  symbol: "tELOTE",
  uri: "https://elote.baby/token/telote.json",
} as const;

// -- arguments ------------------------------------------------------------------------------------

export class UsageError extends Error {}

export type ArgSpec = { values: readonly string[]; flags: readonly string[] };
export type Args = { values: Record<string, string>; flags: Set<string> };

/** Every script accepts these. */
export const COMMON: ArgSpec = { values: ["cluster", "keypair", "as"], flags: ["dry-run", "help"] };

/** Strict `--name value` / `--flag` parser: unknown flags, missing values and repeats are errors. */
export function parseArgs(argv: readonly string[], spec: ArgSpec): Args {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const allValues = [...COMMON.values, ...spec.values];
  const allFlags = [...COMMON.flags, ...spec.flags];
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) throw new UsageError(`unexpected argument ${JSON.stringify(raw)}`);
    const name = raw.slice(2);
    if (allFlags.includes(name)) {
      flags.add(name);
      continue;
    }
    if (!allValues.includes(name)) {
      throw new UsageError(`unknown flag --${name}; flags: ${[...allValues, ...allFlags].map((f) => `--${f}`).join(", ")}`);
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new UsageError(`--${name} needs a value`);
    if (name in values) throw new UsageError(`--${name} given twice`);
    values[name] = value;
    i++;
  }
  return { values, flags };
}

export type Cluster = "devnet" | "local";

/** Accepts devnet or local only; any form of mainnet is refused by name. */
export function parseCluster(value: string | undefined): Cluster {
  if (value === undefined) throw new UsageError("--cluster is required (devnet or local)");
  if (/main/i.test(value)) throw new UsageError("mainnet is refused: these scripts run on devnet or a local validator only");
  if (value !== "devnet" && value !== "local") throw new UsageError("--cluster must be devnet or local");
  return value;
}

export function rpcUrlFor(cluster: Cluster, env: NodeJS.ProcessEnv = process.env): string {
  return env.ELOTE_RPC ?? (cluster === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899");
}

/** Refuses an RPC whose genesis is mainnet's, and checks devnet's or a local host for the others. */
export function assertClusterGenesis(cluster: Cluster, rpcUrl: string, genesisHash: string): void {
  if (genesisHash === GENESIS.mainnet) throw new UsageError("the RPC answers with mainnet's genesis hash: refused");
  if (cluster === "devnet" && genesisHash !== GENESIS.devnet) {
    throw new UsageError(`the RPC is not devnet (genesis ${genesisHash})`);
  }
  if (cluster === "local") {
    const host = new URL(rpcUrl).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") throw new UsageError("--cluster local needs an RPC on 127.0.0.1 or localhost");
  }
}

export function parseAddress(label: string, value: string): PublicKey {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error();
    return key;
  } catch {
    throw new UsageError(`${label} is not a valid address`);
  }
}

/** Parses a token amount with up to `decimals` decimals into base units. */
export function parseAmount(label: string, value: string, decimals = DECIMALS): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!m || (m[2] ?? "").length > decimals) throw new UsageError(`${label} must be a positive amount with up to ${decimals} decimals`);
  const units = BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt((m[2] ?? "").padEnd(decimals, "0"));
  if (units <= 0n) throw new UsageError(`${label} must be greater than zero`);
  return units;
}

export function parseNumber(label: string, value: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new UsageError(`${label} must be a number from ${min} to ${max}`);
  return n;
}

export function fmt(units: bigint | BN, decimals = DECIMALS): string {
  const v = typeof units === "bigint" ? units : BigInt(units.toString());
  const unit = 10n ** BigInt(decimals);
  const sign = v < 0n ? "-" : "";
  const abs = v < 0n ? -v : v;
  const frac = (abs % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${sign}${(abs / unit).toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}

// -- keys and the address book --------------------------------------------------------------------

/** `.demo-keys/` at the repo root (ignored by git), or ELOTE_KEY_DIR. */
export function keyDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ELOTE_KEY_DIR) return path.resolve(env.ELOTE_KEY_DIR.replace(/^~/, os.homedir()));
  return fileURLToPath(new URL("../../.demo-keys", import.meta.url));
}

/** Reads a 64-byte Solana keypair file. The secret is never printed. */
export function readKeypair(label: string, file: string): Keypair {
  const resolved = path.resolve(file.replace(/^~/, os.homedir()));
  if (!fs.existsSync(resolved)) throw new UsageError(`${label} keypair file not found: ${resolved}`);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf8")));
  } catch {
    throw new UsageError(`${label} keypair file is not a JSON array of bytes`);
  }
  if (bytes.length !== 64) throw new UsageError(`${label} keypair file must hold 64 bytes`);
  try {
    return Keypair.fromSecretKey(bytes);
  } catch {
    throw new UsageError(`${label} keypair file does not hold a valid keypair`);
  }
}

/** `--keypair`, then the env var, then `.demo-keys/<role>.json`. Never generated here. */
export function signerPath(args: Args, envVar: string, role: string, env: NodeJS.ProcessEnv = process.env): string {
  return args.values.keypair ?? env[envVar] ?? path.join(keyDir(env), `${role}.json`);
}

export type Actor = { publicKey: PublicKey; keypair: Keypair | null };

/**
 * The script's signer. In a dry run without the key file, `--as <address>` stands in for it, so a
 * transaction can be simulated from a public key alone (signatures are not checked in simulation).
 */
export function actor(ctx: Ctx, envVar: string, role: string): Actor {
  if (ctx.dryRun && ctx.args.values.as) return { publicKey: parseAddress("--as", ctx.args.values.as), keypair: null };
  const file = signerPath(ctx.args, envVar, role);
  if (!fs.existsSync(path.resolve(file.replace(/^~/, os.homedir())))) {
    const hint = ctx.dryRun ? "; in a dry run, --as <address> works without it" : "";
    throw new UsageError(`${role} keypair not found (--keypair or ${envVar})${hint}`);
  }
  const keypair = readKeypair(role, file);
  return { publicKey: keypair.publicKey, keypair };
}

export const signersOf = (...actors: (Actor | Keypair)[]): Keypair[] =>
  actors.flatMap((a) => (a instanceof Keypair ? [a] : a.keypair ? [a.keypair] : []));

/** Loads a keypair that the script creates an account with, generating it on the first run. */
export function loadOrCreateKeypair(file: string, persist: boolean): { keypair: Keypair; created: boolean } {
  if (fs.existsSync(file)) return { keypair: readKeypair(path.basename(file), file), created: false };
  const keypair = Keypair.generate();
  if (persist) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify([...keypair.secretKey]), { mode: 0o600 });
  }
  return { keypair, created: true };
}

/** Addresses only (no secrets): what one step hands to the next. */
export type Book = Partial<Record<"vault" | "config" | "baseMint" | "dbcPool" | "dammPool" | "position" | "treasury", string>>;

export function bookPath(cluster: Cluster, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(keyDir(env), `meteora-${cluster}.json`);
}

export function readBook(cluster: Cluster, env: NodeJS.ProcessEnv = process.env): Book {
  const file = bookPath(cluster, env);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Book) : {};
}

export function writeBook(cluster: Cluster, update: Book, env: NodeJS.ProcessEnv = process.env): void {
  const file = bookPath(cluster, env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ ...readBook(cluster, env), ...update }, null, 2) + "\n");
}

/** A flag, else the address book, else a devnet default, else a usage error. */
export function addressFrom(args: Args, flag: string, book: Book, key: keyof Book, fallback?: string): PublicKey {
  const value = args.values[flag] ?? book[key] ?? fallback;
  if (!value) throw new UsageError(`--${flag} is required (not in the address book yet)`);
  return parseAddress(`--${flag}`, value);
}

// -- context --------------------------------------------------------------------------------------

export type Ctx = {
  script: string;
  cluster: Cluster;
  rpcUrl: string;
  conn: Connection;
  dryRun: boolean;
  args: Args;
  cuPrice: number;
};

/** Parses the command line, refuses mainnet, prints the header. Exits 2 on a usage error. */
export async function start(script: string, usage: string, spec: ArgSpec): Promise<Ctx> {
  let args: Args;
  let cluster: Cluster;
  try {
    args = parseArgs(process.argv.slice(2), { values: [...spec.values, "cu-price"], flags: spec.flags });
    if (args.flags.has("help")) {
      console.log(usage);
      process.exit(0);
    }
    cluster = parseCluster(args.values.cluster);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`${script}: ${e.message}\n\n${usage}`);
      process.exit(2);
    }
    throw e;
  }
  const rpcUrl = rpcUrlFor(cluster);
  const conn = new Connection(rpcUrl, "confirmed");
  try {
    assertClusterGenesis(cluster, rpcUrl, await conn.getGenesisHash());
  } catch (e) {
    if (e instanceof UsageError) fail(script, e.message);
    fail(script, `cannot reach ${rpcUrl}: ${(e as Error).message}`);
  }
  const dryRun = args.flags.has("dry-run");
  const cuPrice = args.values["cu-price"] ? parseNumber("--cu-price", args.values["cu-price"], 0, 10_000_000) : DEFAULT_CU_PRICE;
  console.log(`${DISCLAIMER}\nCluster: ${cluster} (${rpcUrl})${dryRun ? ", dry run: nothing is sent" : ""}\n`);
  return { script, cluster, rpcUrl, conn, dryRun, args, cuPrice };
}

export function fail(script: string, message: string): never {
  console.error(`${script}: ${message}`);
  process.exit(1);
}

/** Runs a script body, turning usage errors and thrown errors into one line and exit 1. */
export function run(script: string, body: () => Promise<void>): void {
  body().catch((e: unknown) => {
    const err = e as Error & { logs?: string[]; transactionLogs?: string[] };
    const logs = err.logs ?? err.transactionLogs;
    if (logs?.length) console.error(logs.slice(-12).join("\n"));
    fail(script, err.message ?? String(e));
  });
}

export function explorer(ctx: Pick<Ctx, "cluster" | "rpcUrl">, kind: "tx" | "address", value: string): string {
  const c = ctx.cluster === "devnet" ? "devnet" : `custom&customUrl=${encodeURIComponent(ctx.rpcUrl)}`;
  return `https://explorer.solana.com/${kind}/${value}?cluster=${c}`;
}

/** One machine-readable line per script, for the e2e run and for copy-paste. */
export function result(fields: Record<string, string | number | bigint>): void {
  console.log(`RESULT ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ")}`);
}

// -- transactions ---------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends `instructions` with `payer` paying and every `signers` key signing, or, in a dry run,
 * simulates them without signature checks and prints the accounts and the compute units.
 * Returns the signature, or null in a dry run.
 */
export async function submit(
  ctx: Ctx,
  label: string,
  payer: PublicKey,
  instructions: TransactionInstruction[],
  signers: Signer[],
): Promise<string | null> {
  const ixs = instructions.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId));
  const limit = instructions.find((ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2);
  const all = [
    ...(limit ? [limit] : []),
    ...(ctx.cuPrice > 0 ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: ctx.cuPrice })] : []),
    ...ixs,
  ];
  const { blockhash, lastValidBlockHeight } = await ctx.conn.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: all }).compileToV0Message();
  const tx = new VersionedTransaction(message);

  if (ctx.dryRun) {
    const sim = await ctx.conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true });
    console.log(`  ${label} (simulated)`);
    const keys = message.staticAccountKeys;
    keys.forEach((key, i) => {
      const role = [message.isAccountSigner(i) ? "signer" : "", message.isAccountWritable(i) ? "writable" : ""].filter(Boolean).join(" ");
      console.log(`    ${key.toBase58()}${role ? ` ${role}` : ""}`);
    });
    console.log(`    err ${JSON.stringify(sim.value.err)}, compute units ${sim.value.unitsConsumed ?? "?"}`);
    if (sim.value.err) {
      console.log((sim.value.logs ?? []).slice(-12).map((l) => `    ${l}`).join("\n"));
      throw new Error(`${label}: simulation failed`);
    }
    return null;
  }

  // An expired blockhash means the transaction never landed, so it is rebuilt and sent again.
  let attempt = { tx, blockhash, lastValidBlockHeight };
  for (let n = 1; ; n++) {
    const needed = new Set(keysToSign(attempt.tx.message));
    attempt.tx.sign(signers.filter((s) => needed.has(s.publicKey.toBase58())));
    const signature = await ctx.conn.sendTransaction(attempt.tx, { preflightCommitment: "confirmed", maxRetries: 5 });
    try {
      const res = await ctx.conn.confirmTransaction(
        { signature, blockhash: attempt.blockhash, lastValidBlockHeight: attempt.lastValidBlockHeight },
        "confirmed",
      );
      if (res.value.err) throw new Error(`${label} failed (${signature}): ${JSON.stringify(res.value.err)}`);
      console.log(`  ${label}\n    ${signature}\n    ${explorer(ctx, "tx", signature)}`);
      return signature;
    } catch (e) {
      if (!(e instanceof TransactionExpiredBlockheightExceededError) || n >= 3) throw e;
      console.log(`  ${label}: blockhash expired before confirmation (${signature}), sending again`);
      const fresh = await ctx.conn.getLatestBlockhash("confirmed");
      const m = new TransactionMessage({ payerKey: payer, recentBlockhash: fresh.blockhash, instructions: all }).compileToV0Message();
      attempt = { tx: new VersionedTransaction(m), ...fresh };
    }
  }
}

function keysToSign(message: VersionedTransaction["message"]): string[] {
  return message.staticAccountKeys.slice(0, message.header.numRequiredSignatures).map((k) => k.toBase58());
}

export async function accountExists(conn: Connection, key: PublicKey): Promise<boolean> {
  return (await conn.getAccountInfo(key, "confirmed")) !== null;
}

export async function tokenBalance(conn: Connection, account: PublicKey): Promise<bigint> {
  try {
    const { value } = await conn.getTokenAccountBalance(account, "confirmed");
    return BigInt(value.amount);
  } catch {
    return 0n;
  }
}

export async function waitFor(check: () => Promise<boolean>, ms = 30_000): Promise<boolean> {
  for (let t = 0; t < ms; t += 500) {
    if (await check()) return true;
    await sleep(500);
  }
  return false;
}

// -- the R1 curve ---------------------------------------------------------------------------------

export type R1Params = {
  prices: [string, string];
  supply: number;
  feeBps: number;
  migrationFeePercent: number;
  migratedPoolFeeBps: number;
};

/** The brief's R1 configuration (Invent dbc_config.jsonc, buildCurveMode 5). */
export const R1: R1Params = { prices: ["1.00", "1.05"], supply: 3500, feeBps: 100, migrationFeePercent: 20, migratedPoolFeeBps: 30 };

export function buildR1Curve(p: R1Params = R1) {
  const sqrtPrices = p.prices.map((price) => getSqrtPriceFromPrice(price, DECIMALS, DECIMALS));
  const curve = buildCurveWithCustomSqrtPrices({
    sqrtPrices,
    token: {
      totalTokenSupply: p.supply,
      tokenBaseDecimal: DECIMALS,
      tokenQuoteDecimal: DECIMALS,
      tokenType: TokenType.SPLToken,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: p.feeBps, endingFeeBps: p.feeBps, numberOfPeriod: 0, totalDuration: 0 },
      },
      dynamicFeeEnabled: false,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: p.migrationFeePercent, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: p.migratedPoolFeeBps,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 100,
      creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
  });
  return { sqrtPrices, curve };
}
