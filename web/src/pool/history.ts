// Activity history from transactions. The program emits every event with Anchor's `emit_cpi!`:
// a self-invocation whose instruction data is EVENT_IX_TAG (8 bytes) followed by the event
// discriminator and fields. This module tries each generated event parser on that payload and
// ignores anything it does not recognise (other programs, newer events, malformed data).
//
// Fetching signatures and transactions lives in app/history.ts (`["history", kind, address]`).
import {
  ELOTE_POOL_PROGRAM_ADDRESS,
  parseDepositedEvent,
  parseLateInterestCollectedEvent,
  parseLineDrawnEvent,
  parseLineInCollectionEvent,
  parseLineOpenedEvent,
  parseLineRepaidEvent,
  parseLineScheduledEvent,
  parseLineWrittenOffEvent,
  parsePoolConfiguredEvent,
  parsePoolInitializedEvent,
  parsePoolPausedEvent,
  parseRedeemedEvent,
  type DepositedEvent,
  type LateInterestCollectedEvent,
  type LineDrawnEvent,
  type LineInCollectionEvent,
  type LineOpenedEvent,
  type LineRepaidEvent,
  type LineScheduledEvent,
  type LineWrittenOffEvent,
  type PoolConfiguredEvent,
  type PoolInitializedEvent,
  type PoolPausedEvent,
  type RedeemedEvent,
} from "@elote/pool-client";
import { getBase58Encoder, type Address, type ReadonlyUint8Array } from "@solana/kit";

/** Anchor's `EVENT_IX_TAG` (0x1d9acb512ea545e4) in little-endian bytes. */
export const EVENT_IX_TAG: ReadonlyUint8Array = new Uint8Array([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);

export type PoolEvent =
  | { kind: "PoolInitialized"; data: PoolInitializedEvent }
  | { kind: "Deposited"; data: DepositedEvent }
  | { kind: "Redeemed"; data: RedeemedEvent }
  | { kind: "PoolPaused"; data: PoolPausedEvent }
  | { kind: "LineOpened"; data: LineOpenedEvent }
  | { kind: "LineDrawn"; data: LineDrawnEvent }
  | { kind: "LineRepaid"; data: LineRepaidEvent }
  | { kind: "LineWrittenOff"; data: LineWrittenOffEvent }
  | { kind: "PoolConfigured"; data: PoolConfiguredEvent }
  | { kind: "LineScheduled"; data: LineScheduledEvent }
  | { kind: "LateInterestCollected"; data: LateInterestCollectedEvent }
  | { kind: "LineInCollection"; data: LineInCollectionEvent };

export type PoolEventKind = PoolEvent["kind"];

/** One activity row: a confirmed signature and the pool events it carried. */
export type HistoryEntry = {
  signature: string;
  /** Unix seconds; null when the node does not report it. */
  blockTime: number | null;
  failed: boolean;
  events: PoolEvent[];
};

type Parser = (data: ReadonlyUint8Array) => PoolEvent;

const PARSERS: readonly Parser[] = [
  (d) => ({ kind: "PoolInitialized", data: parsePoolInitializedEvent(d) }),
  (d) => ({ kind: "Deposited", data: parseDepositedEvent(d) }),
  (d) => ({ kind: "Redeemed", data: parseRedeemedEvent(d) }),
  (d) => ({ kind: "PoolPaused", data: parsePoolPausedEvent(d) }),
  (d) => ({ kind: "LineOpened", data: parseLineOpenedEvent(d) }),
  (d) => ({ kind: "LineDrawn", data: parseLineDrawnEvent(d) }),
  (d) => ({ kind: "LineRepaid", data: parseLineRepaidEvent(d) }),
  (d) => ({ kind: "LineWrittenOff", data: parseLineWrittenOffEvent(d) }),
  (d) => ({ kind: "PoolConfigured", data: parsePoolConfiguredEvent(d) }),
  (d) => ({ kind: "LineScheduled", data: parseLineScheduledEvent(d) }),
  (d) => ({ kind: "LateInterestCollected", data: parseLateInterestCollectedEvent(d) }),
  (d) => ({ kind: "LineInCollection", data: parseLineInCollectionEvent(d) }),
];

function startsWith(data: ReadonlyUint8Array, prefix: ReadonlyUint8Array): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (data[i] !== prefix[i]) return false;
  return true;
}

/** Decodes the data of one self-CPI event instruction (tag included). Null when not a known event. */
export function decodeEventInstructionData(data: ReadonlyUint8Array): PoolEvent | null {
  if (!startsWith(data, EVENT_IX_TAG)) return null;
  const payload = data.slice(EVENT_IX_TAG.length);
  for (const parse of PARSERS) {
    try {
      return parse(payload);
    } catch {
      // Not this event: try the next parser.
    }
  }
  return null;
}

/** The parts of a `getTransaction` (json encoding, version 0) result this decoder reads. */
export type TransactionLike = {
  transaction: { message: { accountKeys: readonly string[] } };
  meta: {
    err: unknown;
    loadedAddresses?: { writable: readonly string[]; readonly: readonly string[] } | null;
    innerInstructions?: ReadonlyArray<{
      instructions: ReadonlyArray<{ programIdIndex: number; data: string }>;
    }> | null;
  } | null;
};

/** Every pool event in a transaction's inner instructions, in order. Unknown data is skipped. */
export function decodeTransactionEvents(
  tx: TransactionLike,
  programAddress: Address = ELOTE_POOL_PROGRAM_ADDRESS,
): PoolEvent[] {
  const meta = tx.meta;
  if (!meta?.innerInstructions) return [];
  const keys = [
    ...tx.transaction.message.accountKeys,
    ...(meta.loadedAddresses?.writable ?? []),
    ...(meta.loadedAddresses?.readonly ?? []),
  ];
  const base58 = getBase58Encoder();
  const events: PoolEvent[] = [];
  for (const group of meta.innerInstructions) {
    for (const ix of group.instructions) {
      if (keys[ix.programIdIndex] !== programAddress) continue;
      let bytes: ReadonlyUint8Array;
      try {
        bytes = base58.encode(ix.data);
      } catch {
        continue;
      }
      const event = decodeEventInstructionData(bytes);
      if (event) events.push(event);
    }
  }
  return events;
}
