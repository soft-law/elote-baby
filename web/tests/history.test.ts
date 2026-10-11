import { describe, expect, test } from "bun:test";
import { ELOTE_POOL_PROGRAM_ADDRESS, getDepositedEventEncoder, getRedeemedEventEncoder } from "@elote/pool-client";
import { address, getBase58Decoder } from "@solana/kit";
import { EVENT_IX_TAG, decodeEventInstructionData, decodeTransactionEvents } from "../src/pool/history";

const POOL = address("BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM");
const WHO = address("11111111111111111111111111111111");
const UNIT = 1_000_000n;

function withTag(payload: ArrayLike<number>): Uint8Array {
  return Uint8Array.from([...EVENT_IX_TAG, ...Array.from(payload)]);
}

const deposited = withTag(
  getDepositedEventEncoder().encode({ pool: POOL, depositor: WHO, assets: 10_000n * UNIT, shares: 9_999_999_000n, navAfter: 10_000n * UNIT, supplyAfter: 10_000n * UNIT }),
);
const redeemed = withTag(
  getRedeemedEventEncoder().encode({ pool: POOL, holder: WHO, shares: 4_000n * UNIT, assets: 4_192n * UNIT, navAfter: 11_528n * UNIT, supplyAfter: 11_000n * UNIT }),
);

describe("event decoding", () => {
  test("decodes a tagged event payload", () => {
    const e = decodeEventInstructionData(deposited);
    expect(e?.kind).toBe("Deposited");
    if (e?.kind === "Deposited") expect(e.data.shares).toBe(9_999_999_000n);
  });

  test("ignores untagged or unknown data", () => {
    expect(decodeEventInstructionData(deposited.slice(8))).toBeNull();
    expect(decodeEventInstructionData(withTag([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBeNull();
    expect(decodeEventInstructionData(new Uint8Array(0))).toBeNull();
  });

  test("walks inner instructions of the pool program only", () => {
    const b58 = getBase58Decoder();
    const other = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const events = decodeTransactionEvents({
      transaction: { message: { accountKeys: [WHO, ELOTE_POOL_PROGRAM_ADDRESS, other] } },
      meta: {
        err: null,
        innerInstructions: [
          {
            instructions: [
              { programIdIndex: 2, data: b58.decode(deposited) },
              { programIdIndex: 1, data: b58.decode(redeemed) },
              { programIdIndex: 1, data: "not base58 0OIl" },
              { programIdIndex: 1, data: b58.decode(Uint8Array.from([9, 9, 9])) },
            ],
          },
        ],
      },
    });
    expect(events.map((e) => e.kind)).toEqual(["Redeemed"]);
  });

  test("a transaction without meta has no events", () => {
    expect(decodeTransactionEvents({ transaction: { message: { accountKeys: [] } }, meta: null })).toEqual([]);
  });
});
