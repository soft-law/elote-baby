// Steps of a useTx() run during which a second submit must wait: the button reads "Signing…".
import type { TxStep } from "../tx/useTx";

export const BUSY_STEPS: ReadonlySet<TxStep> = new Set<TxStep>(["simulating", "signing", "sending", "confirming"]);

export function isTxBusy(step: TxStep): boolean {
  return BUSY_STEPS.has(step);
}
