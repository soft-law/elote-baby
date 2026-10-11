// Share accounting for the pool, in bigint base units. Mirrors programs/elote_pool/src/math.rs:
// products before divisions and every division rounds down, so a preview never promises more
// than the program pays.

/** Decimals of the test asset (tMXN) and of the share token. */
export const DECIMALS = 6;
/** One whole token in base units. */
export const UNIT = 10n ** BigInt(DECIMALS);
/** Smallest first deposit (1 tMXN), as the program enforces (`FirstDepositTooSmall`). */
export const MIN_FIRST_DEPOSIT = 1_000_000n;
/** Shares the first deposit locks forever in the pool's own share account. */
export const DEAD_SHARES = 1_000n;
export const BPS = 10_000n;
/** Default slippage tolerance for the floors sent with deposit and redeem: 0.10%. */
export const DEFAULT_TOLERANCE_BPS = 10;

const U64_MAX = 2n ** 64n - 1n;

/** Net asset value: vault balance plus principal lent out and not yet repaid or written off. */
export function nav(vaultAmount: bigint, outstandingPrincipal: bigint): bigint {
  return vaultAmount + outstandingPrincipal;
}

/** Value of one whole share in base units of the asset (UNIT means 1.000). Zero while there are no shares. */
export function perShare(navValue: bigint, supply: bigint): bigint {
  if (supply === 0n) return 0n;
  return (navValue * UNIT) / supply;
}

/**
 * Shares the depositor receives for `assets`. On the first deposit (supply 0) the program creates
 * `assets` shares and locks `DEAD_SHARES` of them, so the depositor gets `assets - DEAD_SHARES`.
 * Returns 0 when the program would refuse the deposit (first deposit below the minimum, empty
 * pool value, or a deposit too small to create a share).
 */
export function sharesForDeposit(assets: bigint, navValue: bigint, supply: bigint): bigint {
  if (assets <= 0n) return 0n;
  if (supply === 0n) return assets >= MIN_FIRST_DEPOSIT ? assets - DEAD_SHARES : 0n;
  if (navValue === 0n) return 0n;
  return (assets * supply) / navValue;
}

/** Assets paid out for burning `shares` against the pre-burn supply. */
export function assetsForRedeem(shares: bigint, navValue: bigint, supply: bigint): bigint {
  if (shares <= 0n || supply === 0n) return 0n;
  return (shares * navValue) / supply;
}

/** The floor sent with a transaction: `expected` less `bps` basis points, rounded down. */
export function withTolerance(expected: bigint, bps: number = DEFAULT_TOLERANCE_BPS): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError("bps must be an integer from 0 to 10000");
  if (expected <= 0n) return 0n;
  return (expected * (BPS - BigInt(bps))) / BPS;
}

/**
 * Most shares the vault can pay out right now: `floor(vault * supply / nav)`. Redeeming this many
 * pays at most `vault`, because both divisions round down. Zero when the pool has no value.
 */
export function maxRedeemableShares(vaultAmount: bigint, navValue: bigint, supply: bigint): bigint {
  if (navValue === 0n || supply === 0n) return 0n;
  return (vaultAmount * supply) / navValue;
}

/** Base units as a plain decimal string with up to 6 decimals and no grouping: 1048000n gives "1.048". */
export function format(units: bigint, decimals: number = DECIMALS): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export type ParseResult =
  | { ok: true; units: bigint }
  | { ok: false; reason: "empty" | "invalid" | "tooManyDecimals" | "tooLarge" };

/**
 * Parses what a person typed into base units. Accepts "1", "1.5", ".5" and "1,000.25" (commas as
 * thousands separators only). Rejects signs, exponents, inner spaces and more than `decimals`
 * decimals; never rounds.
 */
export function parseAmount(input: string, decimals: number = DECIMALS): ParseResult {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "empty" };
  if (text === "." || !/^(\d{1,3}(,\d{3})+|\d+)?(\.\d*)?$/.test(text)) return { ok: false, reason: "invalid" };
  const [wholeRaw = "", frac = ""] = text.replace(/,/g, "").split(".");
  if (frac.length > decimals) return { ok: false, reason: "tooManyDecimals" };
  const units = BigInt(wholeRaw || "0") * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
  if (units > U64_MAX) return { ok: false, reason: "tooLarge" };
  return { ok: true, units };
}
