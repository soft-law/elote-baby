// Pure helpers around the R1 curve: flag overrides and the derived quantities the scripts print.
// No RPC, no keys; the unit tests pin these to the Step 0 numbers.
import BN from "bn.js";
import { MigrationOption, getBaseTokenForSwap, getMigrationBaseToken } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { R1, type R1Params, UsageError, parseNumber, type buildR1Curve } from "./lib.ts";

const PRICE = /^\d+(\.\d{1,9})?$/;

/** R1 with any of --price-start, --price-end, --supply, --fee-bps, --migration-fee-percent, --migrated-fee-bps. */
export function r1FromFlags(values: Record<string, string>): R1Params {
  const start = values["price-start"] ?? R1.prices[0];
  const end = values["price-end"] ?? R1.prices[1];
  if (!PRICE.test(start) || !PRICE.test(end)) throw new UsageError("--price-start and --price-end must be decimal prices");
  if (!(Number(end) > Number(start) && Number(start) > 0)) throw new UsageError("--price-end must be above --price-start, both above 0");
  const supply = parseNumber("--supply", values.supply ?? String(R1.supply), 1, 1e12);
  const feeBps = parseNumber("--fee-bps", values["fee-bps"] ?? String(R1.feeBps), 25, 9900);
  const migrationFeePercent = parseNumber("--migration-fee-percent", values["migration-fee-percent"] ?? String(R1.migrationFeePercent), 0, 99);
  const migratedPoolFeeBps = parseNumber("--migrated-fee-bps", values["migrated-fee-bps"] ?? String(R1.migratedPoolFeeBps), 10, 1000);
  for (const [k, v] of Object.entries({ supply, feeBps, migrationFeePercent, migratedPoolFeeBps })) {
    if (!Number.isInteger(v)) throw new UsageError(`${k} must be a whole number`);
  }
  return { prices: [start, end], supply, feeBps, migrationFeePercent, migratedPoolFeeBps };
}

type Curve = ReturnType<typeof buildR1Curve>["curve"];

/** Supply, tokens sold on the curve, tokens and tMXN that go to DAMM v2, and the partner's migration fee. */
export function describeCurve(curve: Curve, migrationFeePercent: number) {
  const supply = BigInt(curve.tokenSupply!.preMigrationTokenSupply.toString());
  const sqrtMigration = curve.curve[curve.curve.length - 1].sqrtPrice;
  const baseOnCurve = getBaseTokenForSwap(curve.sqrtStartPrice, sqrtMigration, curve.curve);
  const migrationQuote = curve.migrationQuoteThreshold.muln(100 - migrationFeePercent).divn(100);
  const migrationBase = getMigrationBaseToken(migrationQuote, sqrtMigration, MigrationOption.MET_DAMM_V2);
  const toBig = (x: BN) => BigInt(x.toString());
  return {
    supply,
    threshold: toBig(curve.migrationQuoteThreshold),
    baseOnCurve: toBig(baseOnCurve),
    migrationQuote: toBig(migrationQuote),
    migrationFee: toBig(curve.migrationQuoteThreshold.sub(migrationQuote)),
    migrationBase: toBig(migrationBase),
  };
}

/** Progress toward graduation in basis points of the threshold (10000 = graduated). */
export function progressBps(quoteReserve: bigint, threshold: bigint): bigint {
  if (threshold <= 0n) return 0n;
  return (quoteReserve * 10_000n) / threshold;
}

/** Elote pool shares for `assets` at the current NAV, and the floor at `toleranceBps` below it. */
export function sharesFor(assets: bigint, nav: bigint, supply: bigint, deadShares: bigint, toleranceBps = 10n) {
  const expected = supply === 0n ? assets - deadShares : (assets * supply) / nav;
  const minSharesOut = (expected * (10_000n - toleranceBps)) / 10_000n;
  return { expected, minSharesOut };
}
