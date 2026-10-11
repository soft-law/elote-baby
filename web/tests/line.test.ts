import { describe, expect, test } from "bun:test";
import { LineStatus, getCreditLineDecoder, getCreditLineEncoder, type CreditLineArgs } from "@elote/pool-client";
import { address, none, some } from "@solana/kit";
import { decodeLineView, statusFromIndex, toLineView, type LineView } from "../src/pool/line";

const POOL = address("BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM");
const BORROWER = address("11111111111111111111111111111111");
const SPONSOR = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const UNIT = 1_000_000n;

function lineArgs(overrides: Partial<CreditLineArgs> = {}): CreditLineArgs {
  return {
    version: 1,
    pool: POOL,
    lineId: 0n,
    borrower: BORROWER,
    sponsor: none(),
    agreementHash: Uint8Array.from({ length: 32 }, (_, i) => i),
    principal: 6_000n * UNIT,
    rateBps: 1_200,
    interestDue: 720n * UNIT,
    termEnd: 1_800_000_000n,
    principalRepaid: 0n,
    interestRepaid: 0n,
    status: LineStatus.Active,
    openedAt: 1_700_000_000n,
    drawnAt: 1_700_000_100n,
    closedAt: 0n,
    reserved: new Uint8Array(32),
    bump: 254,
    ...overrides,
  };
}

function encode(overrides: Partial<CreditLineArgs> = {}): Uint8Array {
  return new Uint8Array(getCreditLineEncoder().encode(lineArgs(overrides)));
}

// Byte offset of `status` with sponsor = None (8 + 1 + 32 + 8 + 32 + 1 + 32 + 8 + 2 + 8 + 8 + 8 + 8).
const STATUS_OFFSET_NO_SPONSOR = 156;

function readable(view: ReturnType<typeof decodeLineView>): LineView {
  if (!view.readable) throw new Error("expected a readable line");
  return view;
}

describe("line adapter, version 1", () => {
  test("maps the generated CreditLine", () => {
    const line = getCreditLineDecoder().decode(encode());
    const view = toLineView(line);
    expect(view.status).toBe("active");
    expect(view.version).toBe(1);
    expect(view.sponsor).toBeNull();
    expect(view.principal).toBe(6_000n * UNIT);
    expect(view.remaining).toBe(6_720n * UNIT);
    expect(view.termEnd).toBe(1_800_000_000);
    expect(view.closedAt).toBeNull();
    expect(view.agreementHashHex).toBe("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    expect(view.agreementHashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(view.schedule).toBeUndefined();
    expect(view.lateInterest).toBeUndefined();
  });

  test("every known status", () => {
    const expected = ["approved", "active", "repaid", "writtenOff"] as const;
    for (const status of [LineStatus.Approved, LineStatus.Active, LineStatus.Repaid, LineStatus.WrittenOff]) {
      expect(readable(decodeLineView(encode({ status }))).status).toBe(expected[status]);
    }
  });

  test("the tolerant decoder agrees with the generated one", () => {
    const bytes = encode({ sponsor: some(SPONSOR), principalRepaid: 1_000n * UNIT, interestRepaid: 20n * UNIT });
    const fromGenerated = toLineView(getCreditLineDecoder().decode(bytes));
    const fromBytes = readable(decodeLineView(bytes));
    expect(fromBytes).toEqual(fromGenerated);
    expect(fromBytes.sponsor).toBe(SPONSOR);
    expect(fromBytes.remaining).toBe(5_700n * UNIT);
  });
});

describe("line adapter, unknown and future layouts", () => {
  test("the generated decoder throws on a new status, the adapter does not", () => {
    const bytes = encode();
    expect(bytes[STATUS_OFFSET_NO_SPONSOR]).toBe(LineStatus.Active);
    bytes[STATUS_OFFSET_NO_SPONSOR] = 9;
    expect(() => getCreditLineDecoder().decode(bytes)).toThrow();
    const view = readable(decodeLineView(bytes));
    expect(view.status).toBe("unknown");
    expect(view.statusIndex).toBe(9);
    expect(view.principal).toBe(6_000n * UNIT);
  });

  test("status 4 is InCollection", () => {
    const bytes = encode({ version: 2 });
    bytes[STATUS_OFFSET_NO_SPONSOR] = 4;
    expect(readable(decodeLineView(bytes)).status).toBe("inCollection");
  });

  test("status 4 on a version-1 line is unknown", () => {
    const bytes = encode({ version: 1 });
    bytes[STATUS_OFFSET_NO_SPONSOR] = 4;
    expect(readable(decodeLineView(bytes)).status).toBe("unknown");
    expect(statusFromIndex(4, 1)).toBe("unknown");
    expect(statusFromIndex(3, 1)).toBe("writtenOff");
    expect(statusFromIndex(4, 2)).toBe("inCollection");
    expect(statusFromIndex(5, 2)).toBe("unknown");
  });

  test("an unknown version renders unknown whatever its status", () => {
    expect(readable(decodeLineView(encode({ version: 3, status: LineStatus.Active }))).status).toBe("unknown");
    expect(statusFromIndex(1, 0)).toBe("unknown");
    expect(statusFromIndex(1, 1)).toBe("active");
  });

  test("version 2 unpacks the schedule and late interest from reserved", () => {
    const reserved = new Uint8Array(32);
    const v = new DataView(reserved.buffer);
    v.setBigInt64(0, 2_592_000n, true); // 30 days
    v.setUint16(8, 6, true);
    v.setUint16(10, 3_600, true);
    v.setUint8(12, 2);
    v.setBigUint64(14, 12_345n, true);
    v.setBigInt64(22, 1_700_100_000n, true);
    const view = readable(decodeLineView(encode({ version: 2, reserved })));
    expect(view.status).toBe("active");
    expect(view.schedule).toEqual({ intervalSeconds: 2_592_000n, installments: 6, maxMissed: 2 });
    expect(view.lateInterest).toEqual({ lateBps: 3_600, collected: 12_345n, paidUntil: 1_700_100_000 });
  });

  test("version 2 with nothing collected yet has no paidUntil", () => {
    const view = readable(decodeLineView(encode({ version: 2 })));
    expect(view.lateInterest).toEqual({ lateBps: 0, collected: 0n, paidUntil: null });
  });

  test("bytes that are not a line, or are cut short, are unreadable but never throw", () => {
    expect(decodeLineView(new Uint8Array(0))).toEqual({ readable: false, status: "unknown" });
    expect(decodeLineView(new Uint8Array(214))).toEqual({ readable: false, status: "unknown" });
    expect(decodeLineView(encode().slice(0, 100))).toEqual({ readable: false, status: "unknown" });
  });
});
