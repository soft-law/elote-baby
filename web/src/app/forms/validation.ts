// Client-side checks for the deposit and redeem forms, and the preview they send. Pure: the floor a
// form shows is the floor it passes to useTx().run, because both come from one call here.
//   deposit  amount > 0, at most 6 decimals, first deposit >= 1 tMXN (the program's
//            FirstDepositTooSmall), <= balance, and enough to receive at least one share
//   repay    amount > 0, at most 6 decimals, <= balance, <= what the line still owes (plus late
//            interest on a scheduled line), and on a scheduled line >= the late interest due
//   redeem   shares > 0, at most 6 decimals, <= shares held, <= the liquidity cap
//            floor(vault * supply / nav), and enough to receive at least one base unit
// Both refuse an amount whose floor (minSharesOut / minAssetsOut) would round down to 0, so a
// transaction never goes out without a real minimum.
import {
  MIN_FIRST_DEPOSIT,
  assetsForRedeem,
  maxRedeemableShares,
  parseAmount,
  sharesForDeposit,
  withTolerance,
} from "../../pool/math";

export type FieldError =
  | { code: "required" }
  | { code: "invalid" }
  | { code: "tooManyDecimals" }
  | { code: "tooLarge" }
  | { code: "zero" }
  | { code: "firstDepositTooSmall" }
  | { code: "aboveBalance" }
  | { code: "zeroShares" }
  | { code: "aboveShares" }
  | { code: "aboveLiquidity"; max: bigint }
  | { code: "tooSmall" }
  /** The floor sent with the transaction would be 0: too small to be worth sending. */
  | { code: "dust" }
  /** More than the line still owes (repay). */
  | { code: "aboveDue"; max: bigint }
  /** Less than the late interest a scheduled line must settle first (repay). */
  | { code: "belowLateInterest"; min: bigint };

/** A checked amount: what is sent (`units`), what is expected back, and the floor sent with it. */
export type Checked = { ok: true; units: bigint; expected: bigint; min: bigint } | { ok: false; error: FieldError };

export type PoolFigures = { vaultAmount: bigint; nav: bigint; supply: bigint };

function parse(input: string): { ok: true; units: bigint } | { ok: false; error: FieldError } {
  const parsed = parseAmount(input);
  if (!parsed.ok) return { ok: false, error: { code: parsed.reason === "empty" ? "required" : parsed.reason } };
  if (parsed.units === 0n) return { ok: false, error: { code: "zero" } };
  return parsed;
}

/** Deposit of `input` test tokens against the pool as last read. */
export function checkDeposit(input: string, pool: PoolFigures, balance: bigint): Checked {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  const assets = parsed.units;
  if (pool.supply === 0n && assets < MIN_FIRST_DEPOSIT) return { ok: false, error: { code: "firstDepositTooSmall" } };
  if (assets > balance) return { ok: false, error: { code: "aboveBalance" } };
  const expected = sharesForDeposit(assets, pool.nav, pool.supply);
  if (expected === 0n) return { ok: false, error: { code: "zeroShares" } };
  const min = withTolerance(expected);
  if (min === 0n) return { ok: false, error: { code: "dust" } };
  return { ok: true, units: assets, expected, min };
}

/** The redeem Max: the shares held, or fewer when the vault cannot pay them all right now. */
export function redeemLimit(pool: PoolFigures, shares: bigint): { max: bigint; cap: bigint; capped: boolean } {
  const cap = maxRedeemableShares(pool.vaultAmount, pool.nav, pool.supply);
  return { max: shares < cap ? shares : cap, cap, capped: cap < shares };
}

/** Redemption of `input` shares against the pool as last read. */
export function checkRedeem(input: string, pool: PoolFigures, shares: bigint): Checked {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  const amount = parsed.units;
  if (amount > shares) return { ok: false, error: { code: "aboveShares" } };
  const { cap } = redeemLimit(pool, shares);
  if (amount > cap) return { ok: false, error: { code: "aboveLiquidity", max: cap } };
  const expected = assetsForRedeem(amount, pool.nav, pool.supply);
  if (expected === 0n) return { ok: false, error: { code: "tooSmall" } };
  const min = withTolerance(expected);
  if (min === 0n) return { ok: false, error: { code: "dust" } };
  return { ok: true, units: amount, expected, min };
}

/** Repayment limits of one line: at least `minimum` (late interest on a scheduled line), at most `owed`. */
export type RepayLimits = { owed: bigint; minimum: bigint };

/**
 * Repayment of `input` test tokens. Partial repayments are allowed; there is no slippage floor, so
 * `expected` and `min` are the amount itself.
 */
export function checkRepay(input: string, limits: RepayLimits, balance: bigint): Checked {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  const amount = parsed.units;
  if (amount > limits.owed) return { ok: false, error: { code: "aboveDue", max: limits.owed } };
  if (amount > balance) return { ok: false, error: { code: "aboveBalance" } };
  if (amount < limits.minimum) return { ok: false, error: { code: "belowLateInterest", min: limits.minimum } };
  return { ok: true, units: amount, expected: amount, min: amount };
}
