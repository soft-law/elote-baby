// Settles transactions an earlier visit left unresolved (signed or sent), on load and then every
// few seconds while any remain. Read-only towards the wallet: it never asks for a signature.
// Each check takes the "elote.tx" lock without waiting, so it never races a sendOp in progress
// (in this tab or another); signatures this tab is delivering are not shown as pending.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppConfig } from "../app/configContext";
import { getBrowserJournal, recoverJournal, TX_JOURNAL_KEY, TX_JOURNAL_QUARANTINE_KEY, type JournalEntry, type TxJournal } from "./journal";
import { useRpc } from "./RpcProvider";
import { inFlightSignatures, subscribeInFlight, withTxLock, type LockManagerLike } from "./write";

export const RECOVERY_INTERVAL_MS = 5_000;

export type JournalRecovery = {
  /** Unresolved entries of the configured pool, newest first, excluding this tab's in-flight one. */
  pending: JournalEntry[];
  /** Part of the record could not be read and was set aside: check the explorer before repeating. */
  unavailable: boolean;
  checking: boolean;
  checkNow: () => Promise<void>;
  /** Hides the set-aside notice. */
  dismissUnavailable: () => void;
};

type Snapshot = { pending: JournalEntry[]; unavailable: boolean };

export type JournalRecoveryOptions = {
  journal?: TxJournal | null;
  /** Defaults to navigator.locks (module mutex without it); injectable for tests. */
  locks?: LockManagerLike | null;
  intervalMs?: number;
};

export function useJournalRecovery(options: JournalRecoveryOptions = {}): JournalRecovery {
  const journal = options.journal === undefined ? getBrowserJournal() : options.journal;
  const intervalMs = options.intervalMs ?? RECOVERY_INTERVAL_MS;
  const locks = options.locks;
  const rpc = useRpc();
  const { poolAddress } = useAppConfig();
  const pool = poolAddress as string;

  const subscribe = useCallback(
    (notify: () => void) => {
      const unsubscribeJournal = journal?.subscribe(notify);
      const unsubscribeInFlight = subscribeInFlight(notify);
      const onStorage = (event: StorageEvent) => {
        if (event.key === TX_JOURNAL_KEY || event.key === TX_JOURNAL_QUARANTINE_KEY || event.key === null) notify();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        unsubscribeJournal?.();
        unsubscribeInFlight();
        window.removeEventListener("storage", onStorage);
      };
    },
    [journal],
  );

  // A string snapshot keeps useSyncExternalStore stable between identical reads.
  const snapshot = useCallback((): string => {
    if (!journal) return JSON.stringify({ pending: [], unavailable: false } satisfies Snapshot);
    try {
      const busy = inFlightSignatures();
      const pending = journal
        .unresolved({ pool })
        .filter((e) => !busy.has(e.signature))
        .sort((a, b) => b.createdAt - a.createdAt);
      return JSON.stringify({ pending, unavailable: journal.quarantined() !== null } satisfies Snapshot);
    } catch {
      // The store refuses even the set-aside copy: treat as unreadable.
      return JSON.stringify({ pending: [], unavailable: true } satisfies Snapshot);
    }
  }, [journal, pool]);

  const raw = useSyncExternalStore(subscribe, snapshot, () => JSON.stringify({ pending: [], unavailable: false }));
  const { pending, unavailable } = useMemo(() => JSON.parse(raw) as Snapshot, [raw]);

  const [checking, setChecking] = useState(false);
  const inFlightCheck = useRef(false);
  const checkNow = useCallback(async () => {
    if (!journal || inFlightCheck.current) return;
    inFlightCheck.current = true;
    setChecking(true);
    try {
      await withTxLock(() => recoverJournal(journal, rpc, { pool }), locks === undefined ? undefined : locks);
    } catch {
      // "busy": a transaction is being sent and owns its entry. RPC trouble: keep the notice.
      // Either way the next check tries again.
    } finally {
      inFlightCheck.current = false;
      setChecking(false);
    }
  }, [journal, rpc, pool, locks]);

  const dismissUnavailable = useCallback(() => journal?.clearQuarantine(), [journal]);

  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!hasPending) return;
    void checkNow();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkNow();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [hasPending, checkNow, intervalMs]);

  return { pending, unavailable, checking, checkNow, dismissUnavailable };
}
