// Steps of a useTx() run during which a second submit must wait: the button reads "Signing…", or
// "Waiting for the result" while a sent transaction's outcome is not known yet.
import type { TxStep } from "../tx/useTx";

export const BUSY_STEPS: ReadonlySet<TxStep> = new Set<TxStep>(["simulating", "signing", "sending", "confirming", "pending"]);

export function isTxBusy(step: TxStep): boolean {
  return BUSY_STEPS.has(step);
}
