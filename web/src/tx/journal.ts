// Durable per-browser record of every transaction this app signed. The entry is written right
// after the wallet signs and before anything reaches the network, so a closed tab or a crash can
// only ever re-check, or re-broadcast, the same signed bytes. Nothing here signs again.
import {
  isSolanaError,
  signature as toSignature,
  type Base64EncodedWireTransaction,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
} from "@solana/kit";
import type { PoolOpKind } from "./ops";
import type { EloteRpc } from "./rpc";

export const TX_JOURNAL_KEY = "elote.tx.v1";

export type JournalStatus = "signed" | "sent" | "confirmed" | "expired" | "failed";

export type JournalEntry = {
  id: string;
  signature: string;
  /** Decimal string: bigints do not survive JSON. */
  lastValidBlockHeight: string;
  status: JournalStatus;
  op: PoolOpKind;
  createdAt: number;
  /** Pool and fee payer, so recovery only touches entries of the configured pool. */
  pool: string;
  payer: string;
  /** The signed wire transaction. Public once sent; lets recovery re-broadcast without a new signature. */
  signedBase64: string;
  slot?: string;
};

export type JournalStore = Pick<Storage, "getItem" | "setItem">;

export class JournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JournalError";
  }
}

const RANK: Record<JournalStatus, number> = { signed: 0, sent: 1, confirmed: 2, expired: 2, failed: 2 };
const UNRESOLVED: readonly JournalStatus[] = ["signed", "sent"];
/** Settled entries kept for the notice and history; older ones are dropped. */
const KEEP_SETTLED = 50;

export function isUnresolved(entry: JournalEntry): boolean {
  return UNRESOLVED.includes(entry.status);
}

export type TxJournal = {
  subscribe(listener: () => void): () => void;
  get(signature: string): JournalEntry | undefined;
  all(): JournalEntry[];
  unresolved(scope?: { pool?: string; payer?: string }): JournalEntry[];
  persistSigned(entry: Omit<JournalEntry, "status" | "id"> & { id?: string }): JournalEntry;
  /** Moves an entry forward. A backwards move (another tab settled it first) is ignored. */
  setStatus(signature: string, status: JournalStatus, extra?: { slot?: bigint }): JournalEntry | undefined;
};

function newId(): string {
  const c = globalThis.crypto;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createJournal(store: JournalStore): TxJournal {
  const listeners = new Set<() => void>();

  function read(): Record<string, JournalEntry> {
    const raw = store.getItem(TX_JOURNAL_KEY);
    if (raw === null) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("shape");
      return parsed as Record<string, JournalEntry>;
    } catch {
      throw new JournalError("The transaction record in this browser cannot be read");
    }
  }

  function prune(entries: Record<string, JournalEntry>): Record<string, JournalEntry> {
    const settled = Object.values(entries)
      .filter((e) => !isUnresolved(e))
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const old of settled.slice(KEEP_SETTLED)) delete entries[old.signature];
    return entries;
  }

  function write(entries: Record<string, JournalEntry>): void {
    const value = JSON.stringify(prune(entries));
    try {
      store.setItem(TX_JOURNAL_KEY, value);
    } catch {
      throw new JournalError("The transaction record could not be saved");
    }
    if (store.getItem(TX_JOURNAL_KEY) !== value) throw new JournalError("The transaction record could not be saved");
    listeners.forEach((l) => l());
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: (signature) => read()[signature],
    all: () => Object.values(read()).sort((a, b) => b.createdAt - a.createdAt),
    unresolved: (scope) =>
      Object.values(read()).filter(
        (e) => isUnresolved(e) && (!scope?.pool || e.pool === scope.pool) && (!scope?.payer || e.payer === scope.payer),
      ),
    persistSigned(input) {
      const entries = read();
      if (entries[input.signature]) throw new JournalError("This transaction is already recorded");
      const entry: JournalEntry = { ...input, id: input.id ?? newId(), status: "signed" };
      entries[entry.signature] = entry;
      write(entries);
      return entry;
    },
    setStatus(signature, status, extra) {
      const entries = read();
      const current = entries[signature];
      if (!current) return undefined;
      if (RANK[status] < RANK[current.status] || (RANK[status] === RANK[current.status] && status !== current.status)) {
        return current;
      }
      const next: JournalEntry = { ...current, status, ...(extra?.slot !== undefined ? { slot: extra.slot.toString() } : {}) };
      entries[signature] = next;
      write(entries);
      return next;
    },
  };
}

class MemoryStore implements JournalStore {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

/** In-memory store for tests. */
export function memoryStore(): JournalStore {
  return new MemoryStore();
}

let browserJournal: TxJournal | null | undefined;

/** The journal over localStorage, or null when the browser offers no durable storage. */
export function getBrowserJournal(): TxJournal | null {
  if (browserJournal !== undefined) return browserJournal;
  try {
    const store = globalThis.localStorage;
    browserJournal = store ? createJournal(store) : null;
  } catch {
    browserJournal = null;
  }
  return browserJournal;
}

export type RecoveryOutcome = { signature: string; status: JournalStatus };

/**
 * Settles unresolved entries of one pool from chain state. Never signs. For an entry that was
 * signed but may never have reached the network, still inside its blockhash lifetime and unknown
 * to the cluster, it re-broadcasts the same signed bytes (same signature, so it can land at most
 * once). RPC failures leave entries as they are: they are not evidence of expiry.
 */
export async function recoverJournal(
  journal: TxJournal,
  rpc: EloteRpc,
  scope: { pool: string; payer?: string },
): Promise<RecoveryOutcome[]> {
  const out: RecoveryOutcome[] = [];
  for (const entry of journal.unresolved(scope)) {
    try {
      const next = await settle(entry, rpc);
      const updated = next ? journal.setStatus(entry.signature, next.status, next.slot !== undefined ? { slot: next.slot } : undefined) : undefined;
      out.push({ signature: entry.signature, status: updated?.status ?? journal.get(entry.signature)?.status ?? entry.status });
    } catch {
      out.push({ signature: entry.signature, status: entry.status });
    }
  }
  return out;
}

async function lookup(rpc: EloteRpc, signature: string) {
  const { value } = await rpc.getSignatureStatuses([toSignature(signature)], { searchTransactionHistory: true }).send();
  return value[0] ?? null;
}

async function settle(entry: JournalEntry, rpc: EloteRpc): Promise<{ status: JournalStatus; slot?: bigint } | null> {
  let status = await lookup(rpc, entry.signature);
  if (status) {
    if (status.err) return { status: "failed", slot: status.slot };
    if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
      return { status: "confirmed", slot: status.slot };
    }
    // Seen but not confirmed yet: it reached the network.
    return entry.status === "signed" ? { status: "sent" } : null;
  }
  const height = await rpc.getBlockHeight({ commitment: "confirmed" }).send();
  if (height > BigInt(entry.lastValidBlockHeight)) {
    // It may have landed while the height request was in flight: look once more.
    status = await lookup(rpc, entry.signature);
    if (!status) return { status: "expired" };
    if (status.err) return { status: "failed", slot: status.slot };
    return status.confirmationStatus === "processed" ? { status: "sent" } : { status: "confirmed", slot: status.slot };
  }
  if (entry.status !== "signed") return null;
  try {
    await rpc
      .sendTransaction(entry.signedBase64 as Base64EncodedWireTransaction, { encoding: "base64", preflightCommitment: "confirmed" })
      .send();
  } catch (error) {
    if (!isSolanaError(error, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) return null;
    // Preflight also rejects a transaction that landed a moment ago ("already processed").
    const landed = await lookup(rpc, entry.signature);
    if (landed?.err) return { status: "failed", slot: landed.slot };
    if (landed) return landed.confirmationStatus === "processed" ? { status: "sent" } : { status: "confirmed", slot: landed.slot };
    // Otherwise it was rejected before broadcast and never will land with these bytes.
    return { status: "failed" };
  }
  return { status: "sent" };
}
