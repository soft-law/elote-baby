// The Meteora decoders against real devnet accounts. The fixtures hold account bytes fetched from
// devnet on 2026-10-12; the expected values beside them were decoded from the same bytes with the
// Meteora SDKs (dynamic-bonding-curve-sdk 1.5.13, dynamic-fee-sharing-sdk 1.1.0, cp-amm-sdk 1.5.1)
// in a one-off script outside web/, so every offset here is checked by an independent decoder.
import { describe, expect, test } from "bun:test";
import type { Address } from "@solana/kit";
import { PRESET, PRESET_PROGRAMS } from "../src/app/meteora/addresses";
import {
  curveProgress,
  decodeDammPool,
  decodeDbcConfig,
  decodeDbcPool,
  decodeFeeVault,
  feeBreakdown,
  priceFromSqrt,
} from "../src/app/meteora/decode";
import { loadFixture, rawAccount, type DammFixture, type DbcFixture, type FeeVaultFixture } from "./support/meteora";

const partial = loadFixture<DbcFixture>("dbc-partial.json");
const migrated = loadFixture<DbcFixture>("dbc-migrated.json");
const vaultFx = loadFixture<FeeVaultFixture>("fee-vault.json");
const damm = loadFixture<DammFixture>("damm-pool.json");

describe("committed preset addresses", () => {
  test("not launched on any cluster until the owner fills them", () => {
    expect(PRESET.devnet).toBeNull();
    expect(PRESET.localnet).toBeNull();
  });

  test("the fixtures belong to the programs the page reads", () => {
    expect(partial.pool.owner).toBe(PRESET_PROGRAMS.dbc);
    expect(partial.config.owner).toBe(PRESET_PROGRAMS.dbc);
    expect(vaultFx.account.owner).toBe(PRESET_PROGRAMS.feeSharing);
    expect(damm.account.owner).toBe(PRESET_PROGRAMS.dammV2);
  });
});

describe("DBC accounts", () => {
  for (const [name, fx] of [
    ["partial", partial],
    ["migrated", migrated],
  ] as const) {
    test(`${name} pool ${fx.pool.address} decodes as the SDK does`, () => {
      const pool = decodeDbcPool(rawAccount(fx.pool));
      expect(pool).toEqual({
        config: fx.expected.config as Address,
        baseMint: fx.expected.baseMint as Address,
        quoteReserve: BigInt(fx.expected.quoteReserve),
        partnerQuoteFee: BigInt(fx.expected.partnerQuoteFee),
        isMigrated: fx.expected.isMigrated !== 0,
        migrationProgress: fx.expected.migrationProgress,
      });
    });

    test(`${name} config ${fx.config.address} decodes as the SDK does`, () => {
      expect(fx.config.address).toBe(fx.expected.config);
      expect(decodeDbcConfig(rawAccount(fx.config))).toEqual({
        quoteMint: fx.expected.quoteMint as Address,
        feeClaimer: fx.expected.feeClaimer as Address,
        migrationQuoteThreshold: BigInt(fx.expected.migrationQuoteThreshold),
      });
    });
  }

  test("the literal values, so a fixture edit cannot pass silently", () => {
    const p = decodeDbcPool(rawAccount(partial.pool))!;
    const c = decodeDbcConfig(rawAccount(partial.config))!;
    expect([p.quoteReserve, c.migrationQuoteThreshold, p.partnerQuoteFee, p.migrationProgress, p.isMigrated]).toEqual([
      1_077_000_001n,
      1_077_000_000n,
      403_282_699n,
      2,
      false,
    ]);
    const m = decodeDbcPool(rawAccount(migrated.pool))!;
    const mc = decodeDbcConfig(rawAccount(migrated.config))!;
    expect([m.quoteReserve, mc.migrationQuoteThreshold, m.migrationProgress, m.isMigrated]).toEqual([85_140_000_000n, 85_000_000_000n, 3, true]);
  });

  test("decoders refuse other owners, other discriminators, short data and missing accounts", () => {
    const flipFirst = (b: Uint8Array) => {
      b[0] = b[0]! ^ 0xff;
    };
    expect(decodeDbcPool(rawAccount(partial.pool, flipFirst))).toBeNull();
    expect(decodeDbcConfig(rawAccount(partial.config, flipFirst))).toBeNull();
    const pool = rawAccount(partial.pool);
    if (!pool.exists) throw new Error("unreachable");
    expect(decodeDbcPool({ ...pool, programAddress: PRESET_PROGRAMS.dammV2 as Address })).toBeNull();
    expect(decodeDbcPool({ ...pool, data: pool.data.slice(0, 300) })).toBeNull();
    expect(decodeDbcPool({ exists: false })).toBeNull();
    expect(decodeDbcPool(undefined)).toBeNull();
    // A config is not a pool and a pool is not a config.
    expect(decodeDbcPool(rawAccount(partial.config))).toBeNull();
    expect(decodeDbcConfig(rawAccount(partial.pool))).toBeNull();
    expect(decodeFeeVault(rawAccount(partial.pool))).toBeNull();
    expect(decodeDammPool(rawAccount(vaultFx.account))).toBeNull();
  });
});

describe("fee vault", () => {
  const view = decodeFeeVault(rawAccount(vaultFx.account))!;

  test(`vault ${vaultFx.account.address} decodes as the SDK does`, () => {
    expect(view.tokenMint).toBe(vaultFx.expected.tokenMint as Address);
    expect(view.totalShare).toBe(vaultFx.expected.totalShare);
    expect(view.totalFundedFee).toBe(BigInt(vaultFx.expected.totalFundedFee));
    expect(view.users).toEqual(
      vaultFx.expected.users.map((u) => ({ address: u.address as Address, share: u.share, feeClaimed: BigInt(u.feeClaimed) })),
    );
  });

  test("the totals match the SDK's getFeeBreakdown", () => {
    const b = feeBreakdown(view);
    expect(b.totalFundedFee).toBe(12_819_353n);
    expect(b.totalClaimedFee).toBe(BigInt(vaultFx.expected.totalClaimedFee));
    expect(b.totalUnclaimedFee).toBe(BigInt(vaultFx.expected.totalUnclaimedFee));
    expect(b.users.map((u) => ({ address: u.address, totalFee: u.totalFee, feeClaimed: u.feeClaimed, feeUnclaimed: u.feeUnclaimed }))).toEqual(
      vaultFx.expected.userFees.map((u) => ({
        address: u.address as Address,
        totalFee: BigInt(u.totalFee),
        feeClaimed: BigInt(u.feeClaimed),
        feeUnclaimed: BigInt(u.feeUnclaimed),
      })),
    );
    expect(b.users.map((u) => u.feeUnclaimed)).toEqual([0n, 481_935n]);
  });

  test("claimable never goes below zero; an empty vault has no claims", () => {
    const over = feeBreakdown({ ...view, users: [{ address: view.users[0]!.address, share: 1, feeClaimed: 10n }], totalShare: 1, totalFundedFee: 5n });
    expect(over.users[0]!.feeUnclaimed).toBe(0n);
    const empty = feeBreakdown({ ...view, totalShare: 0, totalFundedFee: 0n, users: [] });
    expect(empty).toEqual({ totalFundedFee: 0n, totalClaimedFee: 0n, totalUnclaimedFee: 0n, users: [] });
  });
});

describe("DAMM v2 pool", () => {
  const view = decodeDammPool(rawAccount(damm.account))!;

  test(`pool ${damm.account.address} decodes as the SDK does, price inside its range`, () => {
    expect(view).toEqual({
      tokenAMint: damm.expected.tokenAMint as Address,
      tokenBMint: damm.expected.tokenBMint as Address,
      sqrtMinPrice: BigInt(damm.expected.sqrtMinPrice),
      sqrtMaxPrice: BigInt(damm.expected.sqrtMaxPrice),
      sqrtPrice: BigInt(damm.expected.sqrtPrice),
    });
    expect(view.sqrtMinPrice <= view.sqrtPrice && view.sqrtPrice <= view.sqrtMaxPrice).toBe(true);
    // The migrated DBC pool graduated into this pool: same base token.
    expect(view.tokenAMint).toBe(decodeDbcPool(rawAccount(migrated.pool))!.baseMint);
  });

  test("price is (sqrt / 2^64)^2, scaled to 6 decimals", () => {
    const float = (Number(view.sqrtPrice) / 2 ** 64) ** 2;
    const units = priceFromSqrt(view.sqrtPrice);
    expect(Math.abs(Number(units) / 1e6 - float)).toBeLessThan(1e-6);
    expect(priceFromSqrt(1n << 64n)).toBe(1_000_000n);
    expect(priceFromSqrt(3n << 63n)).toBe(2_250_000n);
    expect(priceFromSqrt(0n)).toBe(0n);
  });
});

describe("curve progress", () => {
  const T = 1_000_000_000n;
  const at = (quoteReserve: bigint, isMigrated = false, migrationProgress = 0) => curveProgress({ quoteReserve, isMigrated, migrationProgress }, T);

  test("0, partial, threshold reached, migrated", () => {
    expect(at(0n)).toEqual({ stage: "trading", bps: 0 });
    expect(at(T / 4n)).toEqual({ stage: "trading", bps: 2_500 });
    expect(at(T - 1n)).toEqual({ stage: "trading", bps: 9_999 });
    expect(at(T)).toEqual({ stage: "thresholdReached", bps: 10_000 });
    expect(at(T / 2n, false, 1)).toEqual({ stage: "thresholdReached", bps: 10_000 });
    expect(at(T * 2n, true, 3)).toEqual({ stage: "graduated", bps: 10_000 });
  });

  test("a zero threshold never divides", () => {
    expect(curveProgress({ quoteReserve: 5n, isMigrated: false, migrationProgress: 0 }, 0n)).toEqual({ stage: "trading", bps: 0 });
  });

  test("the fixtures: threshold reached awaiting graduation, and graduated", () => {
    const p = decodeDbcPool(rawAccount(partial.pool))!;
    expect(curveProgress(p, decodeDbcConfig(rawAccount(partial.config))!.migrationQuoteThreshold).stage).toBe("thresholdReached");
    const m = decodeDbcPool(rawAccount(migrated.pool))!;
    expect(curveProgress(m, decodeDbcConfig(rawAccount(migrated.config))!.migrationQuoteThreshold).stage).toBe("graduated");
  });
});
