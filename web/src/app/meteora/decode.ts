// Hand decoders for the four Meteora accounts the launch page reads. The web bundle carries no
// Meteora SDK, so each layout is read by offset. Offsets come from the Anchor IDLs shipped in
// @meteora-ag/dynamic-bonding-curve-sdk 1.5.13, dynamic-fee-sharing-sdk 1.1.0 and cp-amm-sdk 1.5.1
// (all four accounts are zero-copy, repr(C), with explicit padding fields, so the IDL field list
// is the byte layout). Every offset is checked against real devnet accounts in
// tests/meteoraDecode.test.ts. Each decoder refuses an account of another owner, a short account
// or one whose 8-byte discriminator differs: it returns null and the caller reports a mismatch.
import { getAddressDecoder, type Address, type ReadonlyUint8Array } from "@solana/kit";
import { UNIT } from "../../pool/math";
import { PRESET_PROGRAMS } from "./addresses";

/** What the decoders need from an account: kit's MaybeEncodedAccount fits. */
export type RawAccount = { exists: true; programAddress: Address; data: ReadonlyUint8Array } | { exists: false };

// Discriminators from the IDLs' `accounts` lists.
export const DBC_POOL_CONFIG_DISCRIMINATOR = new Uint8Array([26, 108, 14, 123, 116, 230, 129, 43]);
export const DBC_VIRTUAL_POOL_DISCRIMINATOR = new Uint8Array([213, 224, 5, 209, 98, 69, 119, 92]);
export const FEE_VAULT_DISCRIMINATOR = new Uint8Array([192, 178, 69, 232, 58, 149, 157, 132]);
export const DAMM_V2_POOL_DISCRIMINATOR = new Uint8Array([241, 154, 109, 4, 17, 177, 109, 188]);

/** Byte offsets, discriminator included. */
export const OFFSETS = {
  // DBC PoolConfig, 1048 bytes.
  poolConfig: { size: 1048, quoteMint: 8, feeClaimer: 40, migrationQuoteThreshold: 264 },
  // DBC VirtualPool (one PoolState field), 424 bytes.
  virtualPool: {
    size: 424,
    config: 72,
    baseMint: 136,
    quoteReserve: 240,
    partnerQuoteFee: 272,
    isMigrated: 305,
    migrationProgress: 308,
  },
  // Dynamic Fee Sharing FeeVault, 648 bytes; five UserFee slots of 80 bytes from byte 248.
  feeVault: {
    size: 648,
    tokenMint: 40,
    totalShare: 120,
    totalFundedFee: 128,
    users: 248,
    userSize: 80,
    userCount: 5,
    userAddress: 0,
    userShare: 32,
    userFeeClaimed: 40,
  },
  // DAMM v2 Pool, 1112 bytes.
  dammPool: { size: 1112, tokenAMint: 168, tokenBMint: 200, sqrtMinPrice: 424, sqrtMaxPrice: 440, sqrtPrice: 456 },
} as const;

export type DbcConfigView = { quoteMint: Address; feeClaimer: Address; migrationQuoteThreshold: bigint };

export type DbcPoolView = {
  config: Address;
  baseMint: Address;
  /** Quote tokens raised on the curve, base units. */
  quoteReserve: bigint;
  /** Partner trading fees not yet moved to the fee claimer (the vault), base units. */
  partnerQuoteFee: bigint;
  isMigrated: boolean;
  /** 0 pre-bonding curve, 1 post-bonding curve, 2 locked vesting, 3 created pool. */
  migrationProgress: number;
};

export type FeeVaultUser = { address: Address; share: number; feeClaimed: bigint };
export type FeeVaultView = { tokenMint: Address; totalShare: number; totalFundedFee: bigint; users: FeeVaultUser[] };

export type DammPoolView = { tokenAMint: Address; tokenBMint: Address; sqrtMinPrice: bigint; sqrtMaxPrice: bigint; sqrtPrice: bigint };

const addressDecoder = getAddressDecoder();

function startsWith(data: ReadonlyUint8Array, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (data[i] !== prefix[i]) return false;
  return true;
}

/** The account's bytes when it exists, belongs to `program`, is long enough and has the discriminator. */
function checked(account: RawAccount | undefined, program: string, discriminator: Uint8Array, size: number) {
  if (!account?.exists || account.programAddress !== program) return null;
  const data = account.data;
  if (data.length < size || !startsWith(data, discriminator)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    address: (offset: number) => addressDecoder.decode(data.slice(offset, offset + 32)),
    u8: (offset: number) => view.getUint8(offset),
    u32: (offset: number) => view.getUint32(offset, true),
    u64: (offset: number) => view.getBigUint64(offset, true),
    u128: (offset: number) => view.getBigUint64(offset, true) | (view.getBigUint64(offset + 8, true) << 64n),
  };
}

export function decodeDbcConfig(account: RawAccount | undefined): DbcConfigView | null {
  const o = OFFSETS.poolConfig;
  const r = checked(account, PRESET_PROGRAMS.dbc, DBC_POOL_CONFIG_DISCRIMINATOR, o.size);
  if (!r) return null;
  return { quoteMint: r.address(o.quoteMint), feeClaimer: r.address(o.feeClaimer), migrationQuoteThreshold: r.u64(o.migrationQuoteThreshold) };
}

export function decodeDbcPool(account: RawAccount | undefined): DbcPoolView | null {
  const o = OFFSETS.virtualPool;
  const r = checked(account, PRESET_PROGRAMS.dbc, DBC_VIRTUAL_POOL_DISCRIMINATOR, o.size);
  if (!r) return null;
  return {
    config: r.address(o.config),
    baseMint: r.address(o.baseMint),
    quoteReserve: r.u64(o.quoteReserve),
    partnerQuoteFee: r.u64(o.partnerQuoteFee),
    isMigrated: r.u8(o.isMigrated) !== 0,
    migrationProgress: r.u8(o.migrationProgress),
  };
}

export function decodeFeeVault(account: RawAccount | undefined): FeeVaultView | null {
  const o = OFFSETS.feeVault;
  const r = checked(account, PRESET_PROGRAMS.feeSharing, FEE_VAULT_DISCRIMINATOR, o.size);
  if (!r) return null;
  const users: FeeVaultUser[] = [];
  for (let i = 0; i < o.userCount; i++) {
    const base = o.users + i * o.userSize;
    users.push({ address: r.address(base + o.userAddress), share: r.u32(base + o.userShare), feeClaimed: r.u64(base + o.userFeeClaimed) });
  }
  return { tokenMint: r.address(o.tokenMint), totalShare: r.u32(o.totalShare), totalFundedFee: r.u64(o.totalFundedFee), users };
}

export function decodeDammPool(account: RawAccount | undefined): DammPoolView | null {
  const o = OFFSETS.dammPool;
  const r = checked(account, PRESET_PROGRAMS.dammV2, DAMM_V2_POOL_DISCRIMINATOR, o.size);
  if (!r) return null;
  return {
    tokenAMint: r.address(o.tokenAMint),
    tokenBMint: r.address(o.tokenBMint),
    sqrtMinPrice: r.u128(o.sqrtMinPrice),
    sqrtMaxPrice: r.u128(o.sqrtMaxPrice),
    sqrtPrice: r.u128(o.sqrtPrice),
  };
}

// ---- derived figures -------------------------------------------------------------------------

export type FeeUserBreakdown = { address: Address; share: number; totalFee: bigint; feeClaimed: bigint; feeUnclaimed: bigint };
export type FeeBreakdown = { totalFundedFee: bigint; totalClaimedFee: bigint; totalUnclaimedFee: bigint; users: FeeUserBreakdown[] };

/**
 * The fee vault's totals, ported from the Dynamic Fee Sharing SDK's getFeeBreakdown: claimed is
 * the sum of the users' claimed fees, a user's total is funded * share / totalShare (rounded
 * down) and what it can claim is that total minus what it claimed. Only users with a share count.
 * The SDK can return a negative claimable after rounding; this clamps it at 0.
 */
export function feeBreakdown(vault: FeeVaultView): FeeBreakdown {
  const totalClaimedFee = vault.users.reduce((sum, u) => sum + u.feeClaimed, 0n);
  const users = vault.users
    .filter((u) => u.share > 0)
    .map((u) => {
      const totalFee = vault.totalShare === 0 ? 0n : (vault.totalFundedFee * BigInt(u.share)) / BigInt(vault.totalShare);
      const left = totalFee - u.feeClaimed;
      return { address: u.address, share: u.share, totalFee, feeClaimed: u.feeClaimed, feeUnclaimed: left > 0n ? left : 0n };
    });
  return { totalFundedFee: vault.totalFundedFee, totalClaimedFee, totalUnclaimedFee: vault.totalFundedFee - totalClaimedFee, users };
}

export type CurveStage = "trading" | "thresholdReached" | "graduated";
export type CurveProgress = { stage: CurveStage; /** 0..10000, capped. */ bps: number };

/**
 * Where the curve stands. Graduated once the pool says it migrated; threshold reached when the
 * reserve met the threshold (or the program moved past the curve) but migration has not run.
 */
export function curveProgress(pool: Pick<DbcPoolView, "quoteReserve" | "isMigrated" | "migrationProgress">, threshold: bigint): CurveProgress {
  if (pool.isMigrated) return { stage: "graduated", bps: 10_000 };
  const reached = (threshold > 0n && pool.quoteReserve >= threshold) || pool.migrationProgress >= 1;
  if (reached) return { stage: "thresholdReached", bps: 10_000 };
  if (threshold <= 0n) return { stage: "trading", bps: 0 };
  const bps = Number((pool.quoteReserve * 10_000n) / threshold);
  return { stage: "trading", bps: Math.min(10_000, Math.max(0, bps)) };
}

/**
 * Price of one whole token A in base units of token B from a DAMM v2 sqrt price (Q64.64):
 * (sqrt / 2^64)^2, scaled by UNIT and rounded down. Valid when both tokens have the same decimals
 * (tELOTE and tMXN both have 6), which is the case the page uses it for.
 */
export function priceFromSqrt(sqrtPrice: bigint): bigint {
  return (sqrtPrice * sqrtPrice * UNIT) >> 128n;
}
