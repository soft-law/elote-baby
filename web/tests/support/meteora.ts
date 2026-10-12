// Devnet Meteora account fixtures (tests/fixtures/meteora) as the decoders and the stub node use them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getBase64Encoder, type Address } from "@solana/kit";
import type { RawAccount } from "../../src/app/meteora/decode";

export type FixtureAccount = { address: string; owner: string; lamports: number; base64: string };

export function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(import.meta.dir, "..", "fixtures", "meteora", name), "utf8")) as T;
}

export function rawAccount(a: FixtureAccount, patch?: (bytes: Uint8Array) => void): RawAccount {
  const data = new Uint8Array(getBase64Encoder().encode(a.base64));
  patch?.(data);
  return { exists: true, programAddress: a.owner as Address, data };
}

export type DbcFixture = {
  pool: FixtureAccount;
  config: FixtureAccount;
  expected: {
    config: string;
    quoteReserve: string;
    isMigrated: number;
    migrationProgress: number;
    partnerQuoteFee: string;
    baseMint: string;
    migrationQuoteThreshold: string;
    quoteMint: string;
    feeClaimer: string;
  };
};
export type FeeVaultFixture = {
  account: FixtureAccount;
  expected: {
    tokenMint: string;
    totalShare: number;
    totalFundedFee: string;
    totalClaimedFee: string;
    totalUnclaimedFee: string;
    users: Array<{ address: string; share: number; feeClaimed: string }>;
    userFees: Array<{ address: string; totalFee: string; feeClaimed: string; feeUnclaimed: string }>;
  };
};
export type DammFixture = {
  account: FixtureAccount;
  expected: { sqrtPrice: string; sqrtMinPrice: string; sqrtMaxPrice: string; tokenAMint: string; tokenBMint: string };
};

