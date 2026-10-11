import { describe, expect, test } from "bun:test";
import {
  DEAD_SHARES,
  MIN_FIRST_DEPOSIT,
  UNIT,
  assetsForRedeem,
  format,
  maxRedeemableShares,
  nav,
  parseAmount,
  perShare,
  sharesForDeposit,
  withTolerance,
} from "../src/pool/math";

// The reference run is scripts/demo-pool.ts: A deposits 10,000, B deposits 5,000, a 6,000 line at
// 12% is drawn and repaid with 720 of interest, then A redeems 4,000 shares for 4,192.
describe("pool math reproduces the demo", () => {
  test("constants match the program", () => {
    expect(UNIT).toBe(1_000_000n);
    expect(MIN_FIRST_DEPOSIT).toBe(1_000_000n);
    expect(DEAD_SHARES).toBe(1_000n);
  });

  test("full demo flow", () => {
    let vault = 0n;
    let outstanding = 0n;
    let supply = 0n;

    // A: first deposit; 1,000 base units of shares are locked as dead shares.
    const a = 10_000n * UNIT;
    const aShares = sharesForDeposit(a, nav(vault, outstanding), supply);
    expect(aShares).toBe(a - DEAD_SHARES);
    expect(aShares).toBe(9_999_999_000n);
    vault += a;
    supply += aShares + DEAD_SHARES;
    expect(supply).toBe(10_000n * UNIT);
    expect(perShare(nav(vault, outstanding), supply)).toBe(UNIT);

    // B at 1.000 per share.
    const b = 5_000n * UNIT;
    const bShares = sharesForDeposit(b, nav(vault, outstanding), supply);
    expect(bShares).toBe(5_000n * UNIT);
    vault += b;
    supply += bShares;
    expect(nav(vault, outstanding)).toBe(15_000n * UNIT);

    // Draw 6,000: NAV unchanged, liquidity caps redemptions.
    vault -= 6_000n * UNIT;
    outstanding += 6_000n * UNIT;
    expect(nav(vault, outstanding)).toBe(15_000n * UNIT);
    expect(perShare(nav(vault, outstanding), supply)).toBe(UNIT);
    expect(maxRedeemableShares(vault, nav(vault, outstanding), supply)).toBe(9_000n * UNIT);

    // Repay 6,000 principal and 720 interest: value per share 1.000 to 1.048.
    vault += 6_000n * UNIT;
    outstanding -= 6_000n * UNIT;
    vault += 720n * UNIT;
    const navRepaid = nav(vault, outstanding);
    expect(navRepaid).toBe(15_720n * UNIT);
    expect(perShare(navRepaid, supply)).toBe(1_048_000n);
    expect(format(perShare(navRepaid, supply))).toBe("1.048");

    // A redeems 4,000 shares for 4,192.
    const out = assetsForRedeem(4_000n * UNIT, navRepaid, supply);
    expect(out).toBe(4_192n * UNIT);
    expect(format(out)).toBe("4192");
  });
});

describe("deposit and redeem edges", () => {
  test("first deposit below 1 tMXN gives zero shares", () => {
    expect(sharesForDeposit(MIN_FIRST_DEPOSIT - 1n, 0n, 0n)).toBe(0n);
    expect(sharesForDeposit(MIN_FIRST_DEPOSIT, 0n, 0n)).toBe(MIN_FIRST_DEPOSIT - DEAD_SHARES);
  });

  test("divisions round down, in favour of the pool", () => {
    // NAV 3, supply 2: 1 unit buys floor(2/3) = 0 shares; 1 share redeems floor(3/2) = 1.
    expect(sharesForDeposit(1n, 3n, 2n)).toBe(0n);
    expect(assetsForRedeem(1n, 3n, 2n)).toBe(1n);
  });

  test("empty pool value or supply never divides by zero", () => {
    expect(sharesForDeposit(10n, 0n, 5n)).toBe(0n);
    expect(assetsForRedeem(10n, 5n, 0n)).toBe(0n);
    expect(perShare(5n, 0n)).toBe(0n);
    expect(maxRedeemableShares(5n, 0n, 5n)).toBe(0n);
  });

  test("redeem cap when the vault holds less than NAV", () => {
    const vault = 9_000n * UNIT;
    const navValue = 15_720n * UNIT;
    const supply = 15_000n * UNIT;
    const cap = maxRedeemableShares(vault, navValue, supply);
    expect(cap).toBe((vault * supply) / navValue);
    // Redeeming the cap pays at most the vault; one more share would pay more than the vault.
    expect(assetsForRedeem(cap, navValue, supply) <= vault).toBe(true);
    expect(assetsForRedeem(cap + 1n, navValue, supply) <= vault).toBe(true);
    expect(assetsForRedeem(cap + 2n, navValue, supply) > vault).toBe(true);
  });

  test("withTolerance takes 10 bps off by default and rounds down", () => {
    expect(withTolerance(4_192n * UNIT)).toBe(4_187_808_000n);
    expect(withTolerance(9_999n, 10)).toBe(9_989n);
    expect(withTolerance(1_000n, 0)).toBe(1_000n);
    expect(withTolerance(0n)).toBe(0n);
    expect(() => withTolerance(1n, -1)).toThrow();
    expect(() => withTolerance(1n, 1.5)).toThrow();
  });
});

describe("format and parseAmount", () => {
  test("format", () => {
    expect(format(0n)).toBe("0");
    expect(format(1n)).toBe("0.000001");
    expect(format(1_500_000n)).toBe("1.5");
    expect(format(-2_000_000n)).toBe("-2");
  });

  test("parseAmount accepts plain and grouped amounts", () => {
    expect(parseAmount("1")).toEqual({ ok: true, units: UNIT });
    expect(parseAmount(" 1.5 ")).toEqual({ ok: true, units: 1_500_000n });
    expect(parseAmount(".5")).toEqual({ ok: true, units: 500_000n });
    expect(parseAmount("10,000.25")).toEqual({ ok: true, units: 10_000_250_000n });
    expect(parseAmount("0.000001")).toEqual({ ok: true, units: 1n });
    expect(parseAmount("1.")).toEqual({ ok: true, units: UNIT });
  });

  test("parseAmount rejects what it cannot read exactly", () => {
    expect(parseAmount("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAmount("1.0000001")).toEqual({ ok: false, reason: "tooManyDecimals" });
    for (const bad of [".", "-1", "+1", "1e3", "1 000", "1,00", "abc", "1.2.3", "0x10"]) {
      expect(parseAmount(bad)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(parseAmount("18446744073709.551616")).toEqual({ ok: false, reason: "tooLarge" });
    expect(parseAmount("18446744073709.551615")).toEqual({ ok: true, units: 2n ** 64n - 1n });
  });

  test("format and parseAmount round-trip", () => {
    for (const units of [0n, 1n, 999_999n, 1_048_000n, 4_192n * UNIT]) {
      expect(parseAmount(format(units))).toEqual({ ok: true, units });
    }
  });
});
