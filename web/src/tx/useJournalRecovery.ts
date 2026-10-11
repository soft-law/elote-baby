// Settles transactions an earlier visit left unresolved (signed or sent), on load and then every
// few seconds while any remain. Read-only towards the wallet: it never asks for a signature.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAppConfig } from "../app/configContext";
import { getBrowserJournal, recoverJournal, TX_JOURNAL_KEY, type JournalEntry, type TxJournal } from "./journal";
import { useRpc } from "./RpcProvider";

export const RECOVERY_INTERVAL_MS = 5_000;

export type JournalRecovery = {
  /** Unresolved entries of the configured pool, newest first. */
  pending: JournalEntry[];
  /** The record exists but cannot be read; the person must not repeat transactions blindly. */
  unavailable: boolean;
  checking: boolean;
  checkNow: () => Promise<void>;
};

const UNAVAILABLE = "unavailable";

export function useJournalRecovery(journal: TxJournal | null = getBrowserJournal()): JournalRecovery {
  const rpc = useRpc();
  const { poolAddress } = useAppConfig();
  const pool = poolAddress as string;

  const subscribe = useCallback(
    (notify: () => void) => {
      const unsubscribe = journal?.subscribe(notify);
      const onStorage = (event: StorageEvent) => {
        if (event.key === TX_JOURNAL_KEY || event.key === null) notify();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        unsubscribe?.();
        window.removeEventListener("storage", onStorage);
      };
    },
    [journal],
  );

  // A string snapshot keeps useSyncExternalStore stable between identical reads.
  const snapshot = useCallback(() => {
    if (!journal) return "[]";
    try {
      return JSON.stringify(journal.unresolved({ pool }).sort((a, b) => b.createdAt - a.createdAt));
    } catch {
      return UNAVAILABLE;
    }
  }, [journal, pool]);

  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const unavailable = raw === UNAVAILABLE;
  const pending = useMemo<JournalEntry[]>(() => (unavailable ? [] : (JSON.parse(raw) as JournalEntry[])), [raw, unavailable]);

  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const checkNow = useCallback(async () => {
    if (!journal || inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      await recoverJournal(journal, rpc, { pool });
    } catch {
      // Keep the notice; the next check tries again.
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [journal, rpc, pool]);

  const hasPending = pending.length > 0;
  useEffect(() => {
    if (!hasPending) return;
    void checkNow();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkNow();
    }, RECOVERY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasPending, checkNow]);

  return { pending, unavailable, checking, checkNow };
}
