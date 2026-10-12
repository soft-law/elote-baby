// Mirrors one useTx() run in a toast. The steps follow `tx.step`:
//   simulating, signing   Sign in wallet (active)
//   sending, confirming   Sign in wallet (done), Confirming (active)
//   pending               sent, result not known yet: Confirming (active), "Result pending", the
//                         explorer link and no "Try again"; it stays until recovery settles it
//   done                  all three done, "Updated", then the toast goes away
//   error                 the mapped message and "Try again"; a cancellation in the wallet is a
//                         short neutral note instead, with no retry; an expiry after "pending"
//                         says nothing went through and the form is open again
// The explorer link appears as soon as a signature exists.
import { useEffect, useRef } from "react";
import type { Copy } from "../../translations";
import { describeTxError } from "../../tx/errors";
import type { PoolOpKind } from "../../tx/ops";
import { TxExpiredError, TxRejectedError } from "../../tx/tx";
import type { TxStep, UseTx } from "../../tx/useTx";
import { fillText } from "../fill";
import { useToast, type ToastStep, type ToastStepStatus } from "./useToast";

export const TX_TOAST_DONE_MS = 8_000;
export const TX_TOAST_CANCELLED_MS = 6_000;

/** The three visible steps for a pipeline step. */
export function toastSteps(step: TxStep, t: Copy, failedAt: TxStep | null = null): ToastStep[] {
  const c = t.app.toast;
  const phase = (s: TxStep): number => (s === "simulating" || s === "signing" ? 0 : s === "sending" || s === "confirming" || s === "pending" ? 1 : 2);
  const labels = [c.sign, c.confirming, c.updated];
  if (step === "done") return labels.map((label) => ({ label, status: "done" }));
  const current = step === "error" ? (failedAt && failedAt !== "idle" && failedAt !== "error" ? phase(failedAt) : 0) : phase(step);
  return labels.map((label, i) => {
    let status: ToastStepStatus = "waiting";
    if (i < current) status = "done";
    else if (i === current) status = step === "error" ? "error" : "active";
    return { label, status };
  });
}

export type TxToastOptions = {
  op: PoolOpKind;
  t: Copy;
  /** "Try again": return the person to the form. Never resubmits on its own. */
  onRetry: () => void;
  /** False when a longer-lived parent shows this run's toast instead (default true). */
  enabled?: boolean;
};

export function useTxToast(tx: Pick<UseTx, "step" | "signature" | "error">, { op, t, onRetry, enabled = true }: TxToastOptions): void {
  const { show, update, dismiss } = useToast();
  const idRef = useRef<string | null>(null);
  const lastActive = useRef<TxStep | null>(null);
  // Set once a run has reached done or error, so a re-render does not report it twice.
  const settled = useRef(false);
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;
  const { step, signature, error } = tx;

  useEffect(() => {
    if (!enabled) return;
    const c = t.app.toast;
    const opLabel = t.app.tx.ops[op];
    if (step === "idle") {
      lastActive.current = null;
      settled.current = false;
      return;
    }
    if ((step === "done" || step === "error") && settled.current) return;
    const steps = toastSteps(step, t, lastActive.current);
    if (step === "simulating" || step === "signing" || step === "sending" || step === "confirming") {
      lastActive.current = step;
      settled.current = false;
      const patch = { tone: "info" as const, title: fillText(c.progress, { op: opLabel }), steps, signature, message: undefined, action: undefined, autoDismissMs: undefined };
      // A new run after a finished one gets a fresh toast.
      if (idRef.current === null) idRef.current = show(patch);
      else update(idRef.current, patch);
      return;
    }
    if (step === "pending") {
      // Not settled: the done or error patch that follows lands on this same toast.
      lastActive.current = "pending";
      settled.current = false;
      const patch = {
        tone: "info" as const,
        title: fillText(c.pending, { op: opLabel }),
        message: c.pendingBody,
        steps,
        signature,
        action: undefined,
        autoDismissMs: undefined,
      };
      if (idRef.current === null) idRef.current = show(patch);
      else update(idRef.current, patch);
      return;
    }
    if (idRef.current === null) idRef.current = show({ tone: "info", title: fillText(c.progress, { op: opLabel }) });
    const id = idRef.current;
    if (step === "done") {
      update(id, {
        tone: "success",
        title: fillText(c.done, { op: opLabel }),
        steps,
        signature,
        message: undefined,
        autoDismissMs: TX_TOAST_DONE_MS,
        action: undefined,
      });
      idRef.current = null;
      settled.current = true;
      return;
    }
    // step === "error"
    if (error instanceof TxExpiredError && lastActive.current === "pending") {
      update(id, {
        tone: "info",
        title: fillText(c.expired, { op: opLabel }),
        message: c.expiredBody,
        steps: undefined,
        signature,
        action: undefined,
        autoDismissMs: undefined,
      });
    } else if (error instanceof TxRejectedError) {
      update(id, {
        tone: "info",
        title: fillText(c.cancelled, { op: opLabel }),
        message: t.app.tx.errors.rejected,
        steps: undefined,
        signature: null,
        action: undefined,
        autoDismissMs: TX_TOAST_CANCELLED_MS,
      });
    } else {
      update(id, {
        tone: "error",
        title: fillText(c.failed, { op: opLabel }),
        message: describeTxError(error, t),
        steps,
        signature,
        autoDismissMs: undefined,
        action: {
          label: c.retry,
          onClick: () => {
            dismiss(id);
            retryRef.current();
          },
        },
      });
    }
    idRef.current = null;
    settled.current = true;
  }, [enabled, step, signature, error, op, t, show, update, dismiss]);
}
