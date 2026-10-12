// Unit tests: the R1 curve pinned to the Step 0 numbers, flag parsing, the mainnet refusal paths and
// the share arithmetic. No RPC. Run with `npm test` (node --test through tsx).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { DYNAMIC_FEE_SHARING_PROGRAM_ID } from "@meteora-ag/dynamic-fee-sharing-sdk";
import { describeCurve, progressBps, r1FromFlags, r1Overrides, sharesFor } from "../curve.ts";
import { partnerMigrationFeeProblems, vaultProblems } from "../vault.ts";
import {
  COMMON,
  GENESIS,
  R1,
  TOKEN_PROGRAM,
  UsageError,
  afterExpiry,
  assertClusterGenesis,
  buildR1Curve,
  fmt,
  parseAmount,
  parseArgs,
  parseCluster,
  readKeypair,
  rpcUrlFor,
} from "../lib.ts";

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

describe("R1 curve (Step 0 numbers)", () => {
  const { sqrtPrices, curve } = buildR1Curve();
  const d = describeCurve(curve, R1.migrationFeePercent);

  test("sqrt prices in Q64", () => {
    assert.deepEqual(
      sqrtPrices.map((s) => s.toString()),
      ["18446744073709551616", "18902287831555877210"],
    );
    assert.equal(curve.sqrtStartPrice.toString(), "18446744073709551616");
    assert.equal(curve.curve.length, 1);
    assert.equal(curve.curve[0].sqrtPrice.toString(), "18902287831555877210");
    assert.equal(curve.curve[0].liquidity.toString(), "1504445252386059529400000000000");
  });

  test("migration threshold 2,014,035,137 base units", () => {
    assert.equal(curve.migrationQuoteThreshold.toString(), "2014035137");
    assert.equal(d.threshold, 2_014_035_137n);
  });

  test("supply 3,500 tokens before and after migration", () => {
    assert.equal(curve.tokenSupply!.preMigrationTokenSupply.toString(), "3500000000");
    assert.equal(curve.tokenSupply!.postMigrationTokenSupply.toString(), "3500000000");
    assert.equal(d.supply, 3_500_000_000n);
  });

  test("curve and migration split", () => {
    assert.equal(fmt(d.baseOnCurve), "1,965.497038");
    assert.equal(fmt(d.migrationBase), "1,534.502962");
    // Program rounding (quote to DAMM v2 rounds up): the partner fee is 402.807027, as paid in the e2e.
    assert.equal(d.migrationFee, 402_807_027n);
    assert.equal(d.migrationQuote, 1_611_228_110n);
    assert.equal(d.migrationFee + d.migrationQuote, d.threshold);
  });

  test("fees, migration option and liquidity as in the brief", () => {
    assert.equal(curve.poolFees.baseFee.cliffFeeNumerator.toString(), "10000000"); // 1%
    assert.equal(curve.collectFeeMode, 0); // fees in tMXN
    assert.equal(curve.migrationOption, 1); // DAMM v2
    assert.equal(curve.migrationFeeOption, 6); // Customizable
    assert.deepEqual(curve.migrationFee, { feePercentage: 20, creatorFeePercentage: 0 });
    assert.equal(curve.partnerPermanentLockedLiquidityPercentage, 100);
    assert.equal(curve.partnerLiquidityPercentage, 0);
    assert.equal(curve.creatorTradingFeePercentage, 0);
    assert.equal(curve.tokenType, 0); // SPL
    assert.equal(curve.tokenUpdateAuthority, 1); // Immutable
  });

  test("flag overrides change the curve, defaults reproduce R1", () => {
    assert.deepEqual(r1FromFlags({}), R1);
    const p = r1FromFlags({ "price-end": "1.10", supply: "4000" });
    assert.equal(p.supply, 4000);
    assert.notEqual(buildR1Curve(p).curve.migrationQuoteThreshold.toString(), "2014035137");
    assert.throws(() => r1FromFlags({ "price-start": "1.05", "price-end": "1.00" }), UsageError);
    assert.throws(() => r1FromFlags({ supply: "12.5" }), UsageError);
    assert.throws(() => r1FromFlags({ "price-start": "abc" }), UsageError);
  });

  test("overrides of the R1 preset are named; equal values written differently are not", () => {
    assert.deepEqual(r1Overrides(R1), []);
    assert.deepEqual(r1Overrides(r1FromFlags({ "price-start": "1.0", supply: "3500" })), []);
    const o = r1Overrides(r1FromFlags({ "price-end": "1.10", "fee-bps": "50", "migration-fee-percent": "10", "migrated-fee-bps": "25" }));
    assert.equal(o.length, 4);
    assert.match(o.join(" "), /--price-end 1\.10 \(R1 1\.05\)/);
    assert.match(o.join(" "), /--fee-bps 50 \(R1 100\)/);
    assert.match(r1Overrides(r1FromFlags({ supply: "4000" }))[0], /--supply 4000 \(R1 3500\)/);
  });
});

describe("flag parsing", () => {
  const spec = { values: ["amount", "pool"], flags: ["print-only"] };

  test("values, flags and the common ones", () => {
    const a = parseArgs(["--cluster", "devnet", "--amount", "12.5", "--dry-run", "--print-only"], spec);
    assert.equal(a.values.cluster, "devnet");
    assert.equal(a.values.amount, "12.5");
    assert.ok(a.flags.has("dry-run") && a.flags.has("print-only"));
    assert.deepEqual(COMMON.values, ["cluster", "keypair", "as"]);
  });

  test("unknown flag, missing value, repeated flag and stray argument are errors", () => {
    assert.throws(() => parseArgs(["--nope", "1"], spec), /unknown flag --nope/);
    assert.throws(() => parseArgs(["--amount"], spec), /--amount needs a value/);
    assert.throws(() => parseArgs(["--amount", "--dry-run"], spec), /--amount needs a value/);
    assert.throws(() => parseArgs(["--pool", "a", "--pool", "b"], spec), /given twice/);
    assert.throws(() => parseArgs(["devnet"], spec), /unexpected argument/);
  });

  test("amounts", () => {
    assert.equal(parseAmount("--amount", "500"), 500_000_000n);
    assert.equal(parseAmount("--amount", "0.000001"), 1n);
    assert.equal(parseAmount("--amount", "1250.5"), 1_250_500_000n);
    for (const bad of ["0", "-1", "1.0000001", "1e3", "abc", ""]) assert.throws(() => parseAmount("--amount", bad), UsageError, bad);
  });
});

describe("cluster and mainnet refusal", () => {
  test("only devnet and local are accepted; any mainnet name is refused", () => {
    assert.equal(parseCluster("devnet"), "devnet");
    assert.equal(parseCluster("local"), "local");
    for (const m of ["mainnet", "mainnet-beta", "Mainnet", "MAINNET-BETA"]) assert.throws(() => parseCluster(m), /mainnet is refused/);
    assert.throws(() => parseCluster("testnet"), /devnet or local/);
    assert.throws(() => parseCluster(undefined), /--cluster is required/);
  });

  test("an RPC that answers with mainnet's genesis is refused whatever the cluster flag", () => {
    assert.throws(() => assertClusterGenesis("devnet", "https://api.devnet.solana.com", GENESIS.mainnet), /mainnet/);
    assert.throws(() => assertClusterGenesis("local", "http://127.0.0.1:8899", GENESIS.mainnet), /mainnet/);
    assert.throws(() => assertClusterGenesis("devnet", "https://example.org", "SomeOtherGenesis1111111111111111111111111111"), /not devnet/);
    assert.throws(() => assertClusterGenesis("local", "https://api.devnet.solana.com", GENESIS.devnet), /127\.0\.0\.1/);
    assert.doesNotThrow(() => assertClusterGenesis("devnet", "https://api.devnet.solana.com", GENESIS.devnet));
    assert.doesNotThrow(() => assertClusterGenesis("local", "http://127.0.0.1:8899", "LocalGenesis111111111111111111111111111111111"));
  });

  test("RPC defaults and ELOTE_RPC override", () => {
    assert.equal(rpcUrlFor("devnet", {}), "https://api.devnet.solana.com");
    assert.equal(rpcUrlFor("local", {}), "http://127.0.0.1:8899");
    assert.equal(rpcUrlFor("devnet", { ELOTE_RPC: "http://127.0.0.1:9999" }), "http://127.0.0.1:9999");
  });

  for (const script of ["fee-vault.ts", "dbc-config.ts", "dbc-pool.ts", "dbc-swap.ts", "dbc-migrate.ts", "fund-vault.ts", "treasury-deposit.ts", "status.ts"]) {
    test(`${script} refuses --cluster mainnet-beta before any RPC call`, () => {
      const r = spawnSync(process.execPath, ["--import", "tsx", script, "--cluster", "mainnet-beta"], { cwd: DIR, encoding: "utf8" });
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stderr, /mainnet is refused/);
      assert.equal(r.stdout, "");
    });
  }

  test("an unknown flag exits 2 with the usage", () => {
    const r = spawnSync(process.execPath, ["--import", "tsx", "dbc-swap.ts", "--cluster", "devnet", "--amonut", "5"], { cwd: DIR, encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown flag --amonut/);
    assert.match(r.stderr, /npx tsx dbc-swap\.ts/);
  });
});

describe("keys", () => {
  test("keypair errors never echo the file's content", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elote-keys-"));
    const bad = path.join(dir, "short.json");
    fs.writeFileSync(bad, JSON.stringify([7, 7, 7, 7]));
    assert.throws(() => readKeypair("treasury", bad), (e: Error) => /64 bytes/.test(e.message) && !e.message.includes("7,7"));
    assert.throws(() => readKeypair("treasury", path.join(dir, "missing.json")), /not found/);
    fs.rmSync(dir, { recursive: true });
  });
});

describe("sending", () => {
  test("every writer simulates unless --send is given; --dry-run stays accepted", () => {
    assert.ok(COMMON.flags.includes("send") && COMMON.flags.includes("dry-run"));
    assert.equal(parseArgs(["--cluster", "devnet"], { values: [], flags: [] }).flags.has("send"), false);
    assert.equal(parseArgs(["--cluster", "devnet", "--send"], { values: [], flags: [] }).flags.has("send"), true);
  });

  test("after a block height expiry: landed means done, failed means fail, absent means resend", () => {
    assert.equal(afterExpiry(null), "resend");
    assert.equal(afterExpiry({ err: null }), "confirmed");
    assert.equal(afterExpiry({ err: { InstructionError: [0, { Custom: 1 }] } }), "failed");
  });
});

describe("fee vault checks", () => {
  const token = Keypair.generate().publicKey;
  const admin = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  const vault = Keypair.generate().publicKey.toBase58();
  const dfs = DYNAMIC_FEE_SHARING_PROGRAM_ID.toBase58();
  const empty = { address: PublicKey.default, share: 0 };
  const good = { tokenMint: token, feeVaultType: 1, users: [{ address: treasury, share: 8000 }, { address: admin, share: 2000 }, empty, empty, empty] };

  test("the R1 vault passes", () => {
    assert.deepEqual(vaultProblems(vault, dfs, good, { token, admin, treasury }), []);
    assert.deepEqual(vaultProblems(vault, dfs, good, { token, admin }), []);
  });

  test("wrong owner, token, type, users or shares are refused, naming both addresses", () => {
    const other = Keypair.generate().publicKey;
    assert.match(vaultProblems(vault, TOKEN_PROGRAM.toBase58(), good, { token, admin }).join(), /not the Dynamic Fee Sharing program/);
    assert.match(vaultProblems(vault, dfs, good, { token: other, admin }).join(), new RegExp(`holds ${token.toBase58()}, the quote token is ${other.toBase58()}`));
    assert.match(vaultProblems(vault, dfs, { ...good, feeVaultType: 0 }, { token, admin }).join(), /not a PDA vault/);
    assert.match(vaultProblems(vault, dfs, good, { token, admin: other }).join(), /does not give the admin/);
    assert.match(vaultProblems(vault, dfs, good, { token, admin, treasury: other }).join(), new RegExp(`pays ${treasury.toBase58()}, not the treasury ${other.toBase58()}`));
    const split = { ...good, users: [{ address: treasury, share: 5000 }, { address: admin, share: 5000 }] };
    assert.ok(vaultProblems(vault, dfs, split, { token, admin }).length >= 2);
  });

  test("the migration fee guard wants flag 0 (partner) and the vault as sender", () => {
    const disc = [1, 2, 3, 4, 5, 6, 7, 8];
    const v = Keypair.generate().publicKey;
    const ix = (flag: number, sender: PublicKey) => {
      const data = Buffer.alloc(12 + 9);
      data.writeUInt32LE(9, 8);
      Buffer.from(disc).copy(data, 12);
      data[20] = flag;
      const keys = Array.from({ length: 16 }, (_, i) => ({ pubkey: i === 12 ? sender : Keypair.generate().publicKey, isSigner: false, isWritable: false }));
      return new TransactionInstruction({ programId: DYNAMIC_FEE_SHARING_PROGRAM_ID, keys, data });
    };
    assert.deepEqual(partnerMigrationFeeProblems([ix(0, v)], v, disc), []);
    assert.match(partnerMigrationFeeProblems([ix(1, v)], v, disc).join(), /flag is 1, not 0/);
    assert.match(partnerMigrationFeeProblems([ix(0, Keypair.generate().publicKey)], v, disc).join(), /not the vault/);
    assert.match(partnerMigrationFeeProblems([ix(0, v)], v, [9, 9, 9, 9, 9, 9, 9, 9]).join(), /not DBC withdraw_migration_fee/);
    assert.match(partnerMigrationFeeProblems([], v, disc).join(), /no Dynamic Fee Sharing instruction/);
  });
});

describe("progress and shares", () => {
  test("progress in basis points of the threshold", () => {
    assert.equal(progressBps(0n, 2_014_035_137n), 0n);
    assert.equal(progressBps(495_000_000n, 2_014_035_137n), 2457n);
    assert.equal(progressBps(2_014_035_138n, 2_014_035_137n), 10_000n);
  });

  test("min_shares_out sits 10 bps below the shares the NAV gives", () => {
    const { expected, minSharesOut } = sharesFor(337_405_362n, 1_048_000_000n, 1_000_000_000n, 1_000n);
    assert.equal(expected, (337_405_362n * 1_000_000_000n) / 1_048_000_000n);
    assert.equal(minSharesOut, (expected * 9_990n) / 10_000n);
    const first = sharesFor(1_000_000_000n, 0n, 0n, 1_000n);
    assert.equal(first.expected, 999_999_000n);
  });
});
