// Activity history: the last signatures of an account (the wallet's share account on the investor
// page, a line address on the borrower page), each transaction decoded into pool events by
// pool/history.ts. One getSignaturesForAddress plus at most `limit` getTransaction calls per
// refresh, at most `concurrency` in flight, because the public RPC rate-limits. Failed
// transactions are not fetched: the signature list already says they failed.
//
// No polling: a confirmed transaction invalidates ["history"] (tx/useTx.ts), which is enough.
import type { Address, Signature } from "@solana/kit";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { decodeTransactionEvents, type HistoryEntry, type PoolEvent, type TransactionLike } from "../pool/history";
import type { EloteRpc } from "../tx/rpc";
import { useRpc } from "../tx/RpcProvider";

export type HistoryKind = "shares" | "line";

export const HISTORY_LIMIT = 20;
export const HISTORY_CONCURRENCY = 3;
export const HISTORY_STALE_MS = 60_000;

export const historyQueryKey = (kind: HistoryKind, address: Address | null) => ["history", kind, address] as const;

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

/**
 * Maps `items` through `fn` with at most `limit` calls in flight, keeping the input order in the
 * result. Once `signal` aborts no further call starts and the promise rejects with its reason.
 */
export function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return signal?.aborted ? Promise.reject(abortError(signal)) : Promise.resolve(results);
  return new Promise<R[]>((resolve, reject) => {
    let next = 0;
    let done = 0;
    let failed = false;
    const fail = (error: unknown) => {
      if (failed) return;
      failed = true;
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    };
    const onAbort = () => fail(abortError(signal!));
    const launch = () => {
      if (failed) return;
      if (signal?.aborted) return fail(abortError(signal));
      const index = next++;
      fn(items[index]!, index).then(
        (value) => {
          results[index] = value;
          done += 1;
          if (done === items.length) {
            signal?.removeEventListener("abort", onAbort);
            if (!failed) resolve(results);
          } else if (next < items.length) launch();
        },
        fail,
      );
    };
    if (signal?.aborted) return fail(abortError(signal));
    signal?.addEventListener("abort", onAbort, { once: true });
    for (let i = 0; i < Math.min(Math.max(1, limit), items.length); i++) launch();
  });
}

/** The last `limit` signatures of `address`, newest first, decoded. */
export async function readHistory(
  rpc: EloteRpc,
  address: Address,
  opts: { limit?: number; concurrency?: number } = {},
  abortSignal?: AbortSignal,
): Promise<HistoryEntry[]> {
  const limit = opts.limit ?? HISTORY_LIMIT;
  const concurrency = opts.concurrency ?? HISTORY_CONCURRENCY;
  const signatures = await rpc.getSignaturesForAddress(address, { limit, commitment: "confirmed" }).send({ abortSignal });
  return mapLimit(
    signatures,
    concurrency,
    async (info): Promise<HistoryEntry> => {
      const entry = {
        signature: info.signature as string,
        blockTime: info.blockTime === null ? null : Number(info.blockTime),
        failed: info.err !== null,
      };
      if (entry.failed) return { ...entry, events: [] };
      try {
        const tx = await rpc
          .getTransaction(info.signature as Signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
          .send({ abortSignal });
        // A transaction the node no longer has (or not yet) is still a row, without events.
        const events = tx ? decodeTransactionEvents(tx as unknown as TransactionLike) : [];
        return { ...entry, failed: tx?.meta?.err ? true : false, events };
      } catch (error) {
        // Abort cancels the whole read; any other failure costs only this row, which then reads
        // "Pool transaction" with its explorer link.
        if (abortSignal?.aborted) throw error;
        return { ...entry, events: [], unreadable: true };
      }
    },
    abortSignal,
  );
}

/**
 * History of a share account or a line address. Disabled until `address` is known and `enabled`
 * is true (the borrower page fetches a line's history only when it is opened).
 */
export function useHistoryQuery(
  kind: HistoryKind,
  address: Address | null,
  { enabled = true }: { enabled?: boolean } = {},
): UseQueryResult<HistoryEntry[]> {
  const rpc = useRpc();
  return useQuery({
    queryKey: historyQueryKey(kind, address),
    queryFn: ({ signal }) => {
      if (!address) throw new Error("no address");
      return readHistory(rpc, address, { limit: HISTORY_LIMIT, concurrency: HISTORY_CONCURRENCY }, signal);
    },
    enabled: enabled && address !== null,
    staleTime: HISTORY_STALE_MS,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
}

/** What a history row is about: the investor's own deposits and redemptions, or one line's events. */
export type HistoryScope =
  | { kind: "shares"; pool: Address; owner: Address }
  | { kind: "line"; pool: Address; lineId: bigint };

export type HistoryRow =
  | { kind: "failed"; signature: string; blockTime: number | null }
  | { kind: "other"; signature: string; blockTime: number | null }
  | { kind: "events"; signature: string; blockTime: number | null; events: PoolEvent[] };

const LINE_KINDS = new Set<PoolEvent["kind"]>(["LineOpened", "LineScheduled", "LineDrawn", "LateInterestCollected", "LineRepaid", "LineInCollection", "LineWrittenOff"]);

/** The events of `event` that belong on this list; everything else in the transaction is ignored. */
export function inScope(event: PoolEvent, scope: HistoryScope): boolean {
  if (event.data.pool !== scope.pool) return false;
  if (scope.kind === "shares") {
    if (event.kind === "Deposited") return event.data.depositor === scope.owner;
    if (event.kind === "Redeemed") return event.data.holder === scope.owner;
    return false;
  }
  return LINE_KINDS.has(event.kind) && "lineId" in event.data && event.data.lineId === scope.lineId;
}

/** One row per transaction: failed first, then its events in scope, else "Pool transaction". */
export function historyRow(entry: HistoryEntry, scope: HistoryScope): HistoryRow {
  const { signature, blockTime } = entry;
  if (entry.failed) return { kind: "failed", signature, blockTime };
  const events = entry.events.filter((e) => inScope(e, scope));
  return events.length > 0 ? { kind: "events", signature, blockTime, events } : { kind: "other", signature, blockTime };
}
