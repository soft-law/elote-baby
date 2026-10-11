// Test support for activity history: getSignaturesForAddress and getTransaction results as a node
// returns them (json encoding, version 0), with the pool's self-CPI event data built from the
// generated event encoders. Never a real signature or account.
import { ELOTE_POOL_PROGRAM_ADDRESS } from "@elote/pool-client";
import { getBase58Decoder, type Address } from "@solana/kit";
import { EVENT_IX_TAG } from "../../src/pool/history";

/** A made-up 64-byte signature in base58. */
export function fakeSignature(seed: number): string {
  const bytes = new Uint8Array(64);
  for (let i = 0; i < 64; i++) bytes[i] = (seed * 31 + i * 7 + 1) & 0xff;
  return getBase58Decoder().decode(bytes);
}

/** An event payload (discriminator + fields) wrapped as the self-CPI instruction data. */
export function eventIxData(payload: ArrayLike<number>): string {
  return getBase58Decoder().decode(Uint8Array.from([...EVENT_IX_TAG, ...Array.from(payload)]));
}

export type SignatureInfo = { signature: string; slot: number; err: unknown; memo: null; blockTime: number | null; confirmationStatus: "confirmed" };

export function signatureInfo(signature: string, blockTime: number | null, err: unknown = null): SignatureInfo {
  return { signature, slot: 1_000, err, memo: null, blockTime, confirmationStatus: "confirmed" };
}

/** A confirmed transaction whose pool program inner instructions carry `eventData` (base58 each). */
export function transactionResult(signature: string, payer: Address, eventData: string[], blockTime: number | null = 1_760_000_000) {
  return {
    slot: 1_000,
    blockTime,
    version: 0,
    transaction: {
      signatures: [signature],
      message: {
        accountKeys: [payer, ELOTE_POOL_PROGRAM_ADDRESS],
        header: { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 1 },
        recentBlockhash: "11111111111111111111111111111111",
        instructions: [{ programIdIndex: 1, accounts: [0], data: "" }],
      },
    },
    meta: {
      err: null,
      fee: 5_000,
      preBalances: [1_000_000_000, 1],
      postBalances: [999_995_000, 1],
      innerInstructions: [{ index: 0, instructions: eventData.map((data) => ({ programIdIndex: 1, accounts: [], data, stackHeight: 2 })) }],
      loadedAddresses: { writable: [], readonly: [] },
      logMessages: [],
      status: { Ok: null },
    },
  };
}
