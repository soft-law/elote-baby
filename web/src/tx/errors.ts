// Turns whatever the RPC, the wallet or the chain throws into one of the four typed errors
// (tx.ts), and a typed error into copy. Program codes are matched with the generated client;
// the copy comes from translations.ts because the generated messages are stripped from
// production bundles. Provider messages never reach the UI: they may carry signed bytes.
import {
  ELOTE_POOL_ERROR__FIRST_DEPOSIT_TOO_SMALL,
  ELOTE_POOL_ERROR__INVALID_SCHEDULE,
  ELOTE_POOL_ERROR__LATE_INTEREST_UNPAID,
  ELOTE_POOL_ERROR__NOT_ENOUGH_MISSED,
  ELOTE_POOL_ERROR__NOT_SCHEDULED,
  ELOTE_POOL_ERROR__SCHEDULE_ENDS_AFTER_TERM,
  ELOTE_POOL_ERROR__WRITE_OFF_TOO_EARLY,
  ELOTE_POOL_ERROR__INSUFFICIENT_LIQUIDITY,
  ELOTE_POOL_ERROR__LINE_STATUS,
  ELOTE_POOL_ERROR__OVERFLOW,
  ELOTE_POOL_ERROR__PAUSED,
  ELOTE_POOL_ERROR__SLIPPAGE_EXCEEDED,
  ELOTE_POOL_ERROR__SPONSOR_REQUIRED,
  ELOTE_POOL_ERROR__TERM_ENDED,
  ELOTE_POOL_ERROR__TERM_NOT_ENDED,
  ELOTE_POOL_ERROR__UNAUTHORIZED,
  ELOTE_POOL_ERROR__WRONG_ACCOUNT,
  ELOTE_POOL_ERROR__WRONG_AMOUNT,
  ELOTE_POOL_ERROR__ZERO_SHARES,
  isElotePoolError,
} from "@elote/pool-client";
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getSolanaErrorFromTransactionError,
  getTransactionDecoder,
  isSolanaError,
  type Address,
  SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  SOLANA_ERROR__INSTRUCTION_ERROR__INSUFFICIENT_FUNDS,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
  SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT,
} from "@solana/kit";
import type { Copy } from "../translations";
import { TxExpiredError, TxFailedError, TxRejectedError, TxUncertainError, isTxError, type TxError } from "./tx";

export type ProgramErrorName =
  | "Paused"
  | "Unauthorized"
  | "WrongAmount"
  | "InsufficientLiquidity"
  | "LineStatus"
  | "TermNotEnded"
  | "Overflow"
  | "SponsorRequired"
  | "ZeroShares"
  | "FirstDepositTooSmall"
  | "WrongAccount"
  | "SlippageExceeded"
  | "TermEnded"
  | "InvalidSchedule"
  | "ScheduleEndsAfterTerm"
  | "NotScheduled"
  | "NotEnoughMissed"
  | "LateInterestUnpaid"
  | "WriteOffTooEarly";

/**
 * Program error names by code (6000..6018), keyed by the generated client's constants. A code
 * the installed client does not know falls back to the generic program message.
 */
export const PROGRAM_ERROR_NAMES: Readonly<Partial<Record<number, ProgramErrorName>>> = {
  [ELOTE_POOL_ERROR__PAUSED]: "Paused",
  [ELOTE_POOL_ERROR__UNAUTHORIZED]: "Unauthorized",
  [ELOTE_POOL_ERROR__WRONG_AMOUNT]: "WrongAmount",
  [ELOTE_POOL_ERROR__INSUFFICIENT_LIQUIDITY]: "InsufficientLiquidity",
  [ELOTE_POOL_ERROR__LINE_STATUS]: "LineStatus",
  [ELOTE_POOL_ERROR__TERM_NOT_ENDED]: "TermNotEnded",
  [ELOTE_POOL_ERROR__OVERFLOW]: "Overflow",
  [ELOTE_POOL_ERROR__SPONSOR_REQUIRED]: "SponsorRequired",
  [ELOTE_POOL_ERROR__ZERO_SHARES]: "ZeroShares",
  [ELOTE_POOL_ERROR__FIRST_DEPOSIT_TOO_SMALL]: "FirstDepositTooSmall",
  [ELOTE_POOL_ERROR__WRONG_ACCOUNT]: "WrongAccount",
  [ELOTE_POOL_ERROR__SLIPPAGE_EXCEEDED]: "SlippageExceeded",
  [ELOTE_POOL_ERROR__TERM_ENDED]: "TermEnded",
  [ELOTE_POOL_ERROR__INVALID_SCHEDULE]: "InvalidSchedule",
  [ELOTE_POOL_ERROR__SCHEDULE_ENDS_AFTER_TERM]: "ScheduleEndsAfterTerm",
  [ELOTE_POOL_ERROR__NOT_SCHEDULED]: "NotScheduled",
  [ELOTE_POOL_ERROR__NOT_ENOUGH_MISSED]: "NotEnoughMissed",
  [ELOTE_POOL_ERROR__LATE_INTEREST_UNPAID]: "LateInterestUnpaid",
  [ELOTE_POOL_ERROR__WRITE_OFF_TOO_EARLY]: "WriteOffTooEarly",
};

type ProgramCopyKey = keyof Copy["app"]["tx"]["errors"]["program"];

const PROGRAM_COPY_KEY: Record<ProgramErrorName, ProgramCopyKey> = {
  Paused: "paused",
  Unauthorized: "unauthorized",
  WrongAmount: "wrongAmount",
  InsufficientLiquidity: "insufficientLiquidity",
  LineStatus: "lineStatus",
  TermNotEnded: "termNotEnded",
  Overflow: "overflow",
  SponsorRequired: "sponsorRequired",
  ZeroShares: "zeroShares",
  FirstDepositTooSmall: "firstDepositTooSmall",
  WrongAccount: "wrongAccount",
  SlippageExceeded: "slippageExceeded",
  TermEnded: "termEnded",
  InvalidSchedule: "invalidSchedule",
  ScheduleEndsAfterTerm: "scheduleEndsAfterTerm",
  NotScheduled: "notScheduled",
  NotEnoughMissed: "notEnoughMissed",
  LateInterestUnpaid: "lateInterestUnpaid",
  WriteOffTooEarly: "writeOffTooEarly",
};

/** SPL Token InsufficientFunds, surfaced through the pool's transfer CPI. */
const TOKEN_INSUFFICIENT_FUNDS = 1;
/** Anchor AccountNotInitialized: the payer has no token account for the test token yet. */
const ANCHOR_ACCOUNT_NOT_INITIALIZED = 3012;
/** System program "insufficient lamports", raised inside the token account creation. */
const SYSTEM_INSUFFICIENT_LAMPORTS = 1;

const REJECTION = /user (rejected|denied|declined|cancel)|request (was )?(rejected|declined|cancelled|canceled)/i;

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | undefined => (typeof v === "object" && v !== null ? (v as Rec) : undefined);

/** The instruction list of the message that was simulated or sent, to attribute custom codes. */
export type MessageLike = { instructions: Record<number, { programAddress: Address }> };

/**
 * The instruction list of a signed wire transaction (base64), for attributing a chain error found
 * later, for example by journal recovery. Null when the bytes cannot be read.
 */
export function messageFromWire(signedBase64: string): MessageLike | null {
  try {
    const transaction = getTransactionDecoder().decode(getBase64Encoder().encode(signedBase64));
    // Legacy and v0 messages (what sendOp builds) carry the program index on each instruction.
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes) as unknown as {
      staticAccounts: Address[];
      instructions?: Array<{ programAddressIndex: number }>;
    };
    if (!Array.isArray(compiled.instructions)) return null;
    const instructions: MessageLike["instructions"] = {};
    compiled.instructions.forEach((ix, i) => {
      const programAddress = compiled.staticAccounts[ix.programAddressIndex];
      if (programAddress) instructions[i] = { programAddress };
    });
    return { instructions };
  } catch {
    return null;
  }
}

/** The error and its causes, bounded. Kit nests the transaction error of a preflight failure as cause. */
function causes(error: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  let next: unknown = error;
  while (next != null && !seen.has(next) && out.length < 16) {
    seen.add(next);
    out.push(next);
    next = rec(next)?.cause;
  }
  return out;
}

function walletCode(error: unknown): unknown {
  const r = rec(error);
  return r?.code ?? rec(r?.context)?.code;
}

function classifyKnown(node: unknown, message: MessageLike | null, signature?: string): TxError | null {
  if (!isSolanaError(node)) return null;
  const code = node.context.__code;
  if (code === SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED || code === SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND) {
    return new TxExpiredError(signature ?? null);
  }
  if (
    code === SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE ||
    code === SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT ||
    code === SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND ||
    code === SOLANA_ERROR__INSTRUCTION_ERROR__INSUFFICIENT_FUNDS
  ) {
    return new TxFailedError("insufficient-sol", { signature, cause: node });
  }
  if (isSolanaError(node, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM)) {
    const custom = Number(node.context.code);
    const fromPool = message !== null && isElotePoolError(node, message);
    if (fromPool && custom >= 6000) {
      const name = PROGRAM_ERROR_NAMES[custom];
      return new TxFailedError("program", { programCode: custom, signature, cause: node, ...(name ? { programErrorName: name } : {}) });
    }
    if (fromPool && (custom === TOKEN_INSUFFICIENT_FUNDS || custom === ANCHOR_ACCOUNT_NOT_INITIALIZED)) {
      return new TxFailedError("insufficient-tokens", { signature, cause: node });
    }
    if (message !== null && !fromPool && custom === SYSTEM_INSUFFICIENT_LAMPORTS) {
      return new TxFailedError("insufficient-sol", { signature, cause: node });
    }
    return new TxFailedError("unknown", { signature, cause: node });
  }
  if (code === SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) return new TxFailedError("network", { cause: node });
  return null;
}

/** A transaction error object from simulateTransaction or getSignatureStatuses, typed. */
export function txErrorFromChain(err: unknown, message: MessageLike | null, signature?: string): TxError {
  if (typeof err !== "string" && !rec(err)) return new TxFailedError("unknown", { signature });
  let solanaError: unknown;
  try {
    solanaError = getSolanaErrorFromTransactionError(err as string | Rec);
  } catch {
    return new TxFailedError("unknown", { signature });
  }
  return classifyKnown(solanaError, message, signature) ?? new TxFailedError("unknown", { signature, cause: solanaError });
}

/**
 * Any thrown value as a typed error. `message` attributes custom program codes to the instruction
 * that raised them, so a token or system program code is never read as a pool code.
 */
export function toTxError(error: unknown, message: MessageLike | null = null): TxError {
  if (isTxError(error)) return error;
  const nodes = causes(error);
  for (const node of nodes) {
    if (isTxError(node)) return node;
    // Wallet codes only on non-kit errors: a kit Custom error's context.code is a program code.
    const wc = isSolanaError(node) ? undefined : walletCode(node);
    if (wc === 4001 || wc === "ACTION_REJECTED") return new TxRejectedError();
    if (isSolanaError(node, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) continue;
    const known = classifyKnown(node, message);
    if (known) return known;
  }
  for (const node of nodes) {
    const text = node instanceof Error ? node.message : typeof node === "string" ? node : "";
    if (REJECTION.test(text)) return new TxRejectedError();
  }
  const network = nodes.some(
    (n) => n instanceof TypeError || (n instanceof Error && (n.name === "TimeoutError" || n.name === "AbortError")),
  );
  return new TxFailedError(network ? "network" : "unknown", { cause: error });
}

/** True when the person cancelled: the UI resets quietly instead of showing a failure. */
export function isTxCancelled(error: unknown): boolean {
  return toTxError(error) instanceof TxRejectedError;
}

/** Copy for a transaction error, in the current language. Accepts any thrown value. */
export function describeTxError(error: unknown, t: Copy): string {
  const e = t.app.tx.errors;
  const typed = toTxError(error);
  if (typed instanceof TxRejectedError) return e.rejected;
  if (typed instanceof TxExpiredError) return e.expired;
  if (typed instanceof TxUncertainError) return e.uncertain;
  switch (typed.reason) {
    case "program": {
      const name = typed.programErrorName as ProgramErrorName | undefined;
      return name && name in PROGRAM_COPY_KEY ? e.program[PROGRAM_COPY_KEY[name]] : e.programGeneric;
    }
    case "insufficient-sol":
      return e.insufficientSol;
    case "insufficient-tokens":
      return e.insufficientTokens;
    case "guard":
      return e.guard;
    case "busy":
      return e.busy;
    case "journal":
      return e.journal;
    case "network":
      return e.network;
    case "no-wallet":
      return e.noWallet;
    default:
      return e.generic;
  }
}
