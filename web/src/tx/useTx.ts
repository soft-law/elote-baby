// One pool op from a component: progress, error and signature as state, and the queries the op
// changes refreshed once it is confirmed.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { derivePoolAccounts, type PoolAccounts } from "../app/config";
import { useAppConfig } from "../app/configContext";
import { useWallet } from "../wallet/useWallet";
import { toTxError } from "./errors";
import type { PoolOp } from "./ops";
import { useRpc } from "./RpcProvider";
import { TxFailedError, type TxError, type TxResult } from "./tx";
import { sendOp } from "./write";

export type TxStep = "idle" | "simulating" | "signing" | "sending" | "confirming" | "done" | "error";

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

const accountsCache = new Map<string, Promise<PoolAccounts>>();
function poolAccounts(pool: string): Promise<PoolAccounts> {
  let cached = accountsCache.get(pool);
  if (!cached) {
    cached = derivePoolAccounts(pool as PoolAccounts["pool"]);
    accountsCache.set(pool, cached);
  }
  return cached;
}

export function useTx(): UseTx {
  const rpc = useRpc();
  const config = useAppConfig();
  const { signer } = useWallet();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<TxStep>("idle");
  const [error, setError] = useState<TxError | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  // Ignore progress from a run the caller has reset away from.
  const runId = useRef(0);

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
          onStep: (next, sig) => {
            if (!current()) return;
            setStep(next);
            if (sig) setSignature(sig);
          },
        });
        // "Updated" once the affected reads have refetched; a failed refetch does not undo the op.
        await Promise.all(
          TX_INVALIDATES.map((queryKey) => queryClient.invalidateQueries({ queryKey: [...queryKey] }).catch(() => undefined)),
        );
        if (current()) {
          setSignature(result.signature);
          setStep("done");
        }
        return result;
      } catch (thrown) {
        const typed = toTxError(thrown);
        if (current()) {
          setError(typed);
          setStep("error");
          const sig = "signature" in typed ? typed.signature : undefined;
          if (sig) setSignature(sig);
        }
        throw typed;
      }
    },
    [rpc, signer, config, queryClient],
  );

  return { run, step, error, signature, reset };
}
