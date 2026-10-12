// One pool op from a component: progress, error and signature as state, and the queries the op
// changes refreshed once it is confirmed.
// When the network has the transaction but its outcome is not known yet (TxUncertainError for this
// run's own signature), the step is "pending", not "error": the person must not send it again.
// Journal recovery (useJournalRecovery, in this tab or another) settles the entry; this hook then
// refreshes the same queries and moves to "done", or to "error" with the expiry or the failure.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { derivePoolAccounts, type PoolAccounts } from "../app/config";
import { useAppConfig } from "../app/configContext";
import { useWallet } from "../wallet/useWallet";
import { toTxError } from "./errors";
import { getBrowserJournal, isUnresolved, settledFailure, TX_JOURNAL_KEY, type JournalEntry, type TxJournal } from "./journal";
import type { PoolOp } from "./ops";
import { useRpc } from "./RpcProvider";
import { TxExpiredError, TxFailedError, TxUncertainError, type TxError, type TxResult } from "./tx";
import { sendOp } from "./write";

/** "pending": sent, outcome not known yet; the journal entry is unresolved and recovery settles it. */
export type TxStep = "idle" | "simulating" | "signing" | "sending" | "confirming" | "pending" | "done" | "error";

export type UseTx = {
  /** Resolves with the confirmed result; rejects with a TxError (also kept in `error`). */
  run: (op: PoolOp) => Promise<TxResult>;
  step: TxStep;
  error: TxError | null;
  /** Known from the moment the wallet signs, before confirmation. */
  signature: string | null;
  reset: () => void;
};

/** Query keys a confirmed op makes stale (prefix match). */
export const TX_INVALIDATES = [["pool"], ["balances"], ["lines"], ["history"]] as const;

// Signatures a mounted useTx is following while their result is pending. That hook refreshes the
// reads once its entry settles; PendingTransactionNotice skips them so the refresh happens once.
const followed = new Map<string, number>();
function follow(signature: string): () => void {
  followed.set(signature, (followed.get(signature) ?? 0) + 1);
  return () => {
    const left = (followed.get(signature) ?? 1) - 1;
    if (left > 0) followed.set(signature, left);
    else followed.delete(signature);
  };
}
/** True while a mounted useTx follows this pending signature and will refresh the reads itself. */
export function isFollowedByTx(signature: string): boolean {
  return followed.has(signature);
}

const accountsCache = new Map<string, Promise<PoolAccounts>>();
function poolAccounts(pool: string): Promise<PoolAccounts> {
  let cached = accountsCache.get(pool);
  if (!cached) {
    cached = derivePoolAccounts(pool as PoolAccounts["pool"]);
    accountsCache.set(pool, cached);
  }
  return cached;
}

export type UseTxOptions = {
  /** Defaults to the localStorage journal sendOp uses. */
  journal?: TxJournal | null;
  /** Delay between status polls (tests). */
  pollMs?: number;
};

export function useTx(options: UseTxOptions = {}): UseTx {
  const journal = options.journal === undefined ? getBrowserJournal() : options.journal;
  const pollMs = options.pollMs;
  const rpc = useRpc();
  const config = useAppConfig();
  const { signer } = useWallet();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<TxStep>("idle");
  const [error, setError] = useState<TxError | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  // Ignore progress from a run the caller has reset away from.
  const runId = useRef(0);
  const refresh = useCallback(
    () =>
      Promise.all(
        TX_INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] }).catch(() => undefined)),
      ),
    [queryClient],
  );

  const reset = useCallback(() => {
    runId.current += 1;
    setStep("idle");
    setError(null);
    setSignature(null);
  }, []);

  const run = useCallback(
    async (op: PoolOp): Promise<TxResult> => {
      const id = ++runId.current;
      const current = () => id === runId.current;
      // The signature this run handed to the network, if it got that far.
      let sent: string | null = null;
      setError(null);
      setSignature(null);
      setStep("simulating");
      try {
        if (!signer) throw new TxFailedError("no-wallet");
        const accounts = await poolAccounts(config.poolAddress);
        const result = await sendOp(op, {
          rpc,
          signer,
          config,
          accounts,
          ...(journal !== undefined ? { journal } : {}),
          ...(pollMs !== undefined ? { pollMs } : {}),
          onStep: (next, sig) => {
            if (sig) sent = sig;
            if (!current()) return;
            setStep(next);
            if (sig) setSignature(sig);
          },
        });
        // "Updated" once the affected reads have refetched; a failed refetch does not undo the op.
        await refresh();
        if (current()) {
          setSignature(result.signature);
          setStep("done");
        }
        return result;
      } catch (thrown) {
        const typed = toTxError(thrown);
        // Only this run's own transaction is pending. An earlier unresolved one (the precheck in
        // sendOp) means this op was never sent: that is an error for this run, shown as such.
        const pending = typed instanceof TxUncertainError && sent !== null && typed.signature === sent;
        if (current()) {
          setError(typed);
          setStep(pending ? "pending" : "error");
          const sig = "signature" in typed ? typed.signature : undefined;
          if (sig) setSignature(sig);
        }
        throw typed;
      }
    },
    [rpc, signer, config, journal, pollMs, refresh],
  );

  // While pending, follow the journal entry until recovery settles it.
  useEffect(() => {
    if (step !== "pending" || !signature || !journal) return;
    // Registered until the step moves on (after the refresh) or the component unmounts; from then
    // on the notice refreshes for an entry that settles.
    const unfollow = follow(signature);
    const id = runId.current;
    const current = () => id === runId.current;
    let settled = false;
    const settle = async (entry: JournalEntry) => {
      settled = true;
      const failure = entry.status === "failed" ? await settledFailure(rpc, entry) : null;
      await refresh();
      if (!current()) return;
      if (entry.status === "confirmed") {
        setError(null);
        setStep("done");
      } else {
        setError(failure ?? new TxExpiredError(entry.signature));
        setStep("error");
      }
    };
    const check = () => {
      if (settled) return;
      let entry: JournalEntry | undefined;
      try {
        entry = journal.get(signature);
      } catch {
        return;
      }
      if (entry && !isUnresolved(entry)) void settle(entry);
    };
    const unsubscribe = journal.subscribe(check);
    // Recovery in another tab writes the same storage key.
    const onStorage = (event: StorageEvent) => {
      if (event.key === TX_JOURNAL_KEY || event.key === null) check();
    };
    window.addEventListener("storage", onStorage);
    check();
    return () => {
      settled = true;
      unfollow();
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [step, signature, journal, rpc, refresh]);

  return { run, step, error, signature, reset };
}
