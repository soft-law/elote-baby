// Typed transaction errors. Every failure the pipeline raises is one of these four, so the UI can
// tell a cancellation from an expiry, an unknown outcome or a real failure. Messages are internal;
// the UI shows describeTxError (errors.ts), never a provider payload.

/** The person declined in the wallet. A cancellation, not a failure. */
export class TxRejectedError extends Error {
  constructor() {
    super("The wallet request was declined");
    this.name = "TxRejectedError";
  }
}

/** The blockhash lifetime ran out before the transaction landed. Nothing happened on chain. */
export class TxExpiredError extends Error {
  constructor(readonly signature: string | null = null) {
    super("The transaction expired before it landed");
    this.name = "TxExpiredError";
  }
}

/**
 * The transaction was handed to the network but its outcome is not known yet, or an earlier
 * transaction from this browser is still unresolved. Never re-sign: recovery settles it.
 */
export class TxUncertainError extends Error {
  constructor(readonly signature: string) {
    super("The transaction outcome is not known yet");
    this.name = "TxUncertainError";
  }
}

export type TxFailureReason =
  /** The pool program rejected the operation (code 6000 and up). */
  | "program"
  /** Not enough SOL for the network fee or account rent. */
  | "insufficient-sol"
  /** The token account does not hold enough test tokens. */
  | "insufficient-tokens"
  /** The wallet returned a different transaction or an invalid signature; nothing was sent. */
  | "guard"
  /** Another transaction from this browser is in progress. */
  | "busy"
  /** The browser could not keep the transaction record; nothing was sent. */
  | "journal"
  /** The RPC could not be reached. */
  | "network"
  /** No wallet is connected. */
  | "no-wallet"
  /** Simulation or the chain rejected it for another reason. */
  | "unknown";

export class TxFailedError extends Error {
  readonly reason: TxFailureReason;
  /** Program error code when reason is "program" (6000..6018). */
  readonly programCode?: number;
  /** Program error name from the generated client, when the installed client knows the code. */
  readonly programErrorName?: string;
  /** Set when the failure happened on chain after the transaction was sent. */
  readonly signature?: string;

  constructor(
    reason: TxFailureReason,
    detail: { programCode?: number; programErrorName?: string; signature?: string; cause?: unknown } = {},
  ) {
    super(detail.programErrorName ? `Transaction failed: ${detail.programErrorName}` : `Transaction failed: ${reason}`, {
      cause: detail.cause,
    });
    this.name = "TxFailedError";
    this.reason = reason;
    if (detail.programCode !== undefined) this.programCode = detail.programCode;
    if (detail.programErrorName !== undefined) this.programErrorName = detail.programErrorName;
    if (detail.signature !== undefined) this.signature = detail.signature;
  }
}

export type TxError = TxRejectedError | TxExpiredError | TxUncertainError | TxFailedError;

export function isTxError(error: unknown): error is TxError {
  return (
    error instanceof TxRejectedError ||
    error instanceof TxExpiredError ||
    error instanceof TxUncertainError ||
    error instanceof TxFailedError
  );
}

export type TxResult = { signature: string; slot?: bigint };
