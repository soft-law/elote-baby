// Sends one pool op, never a hidden second one:
//   simulate -> fresh blockhash -> wallet signs -> guard -> journal "signed" -> send -> journal
//   "sent" -> poll until confirmed or the blockhash expires -> journal "confirmed".
// One transaction at a time per browser profile (Web Locks "elote.tx", a module mutex when the
// browser has no Web Locks). An unresolved earlier transaction blocks a new one until recovery
// settles it, so a person never signs twice for one intent.
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isSolanaError,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signature as toSignature,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  type Base64EncodedWireTransaction,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import type { AppConfig, PoolAccounts } from "../app/config";
import {
  computeUnitsWithHeadroom,
  MAX_COMPUTE_UNITS,
  PRIORITY_FEE_MICROLAMPORTS,
  setComputeUnitLimitInstruction,
  setComputeUnitPriceInstruction,
} from "./computeBudget";
import { toTxError, txErrorFromChain, type MessageLike } from "./errors";
import { getBrowserJournal, JournalError, recoverJournal, type JournalEntry, type TxJournal } from "./journal";
import { buildOpInstructions, type PoolOp } from "./ops";
import type { EloteRpc } from "./rpc";
import { assertSignOnly, signWithGuard } from "./signing";
import { TxExpiredError, TxFailedError, TxUncertainError, type TxResult } from "./tx";

export const TX_LOCK_NAME = "elote.tx";

export type SendStep = "simulating" | "signing" | "sending" | "confirming";

/** The part of the Web Locks API the pipeline uses; injectable for tests. */
export type LockManagerLike = {
  request<T>(name: string, options: { ifAvailable: true }, callback: (lock: unknown) => Promise<T>): Promise<T>;
};

export type SendContext = {
  rpc: EloteRpc;
  signer: TransactionSigner;
  config: Pick<AppConfig, "assetMint" | "poolAddress">;
  accounts: PoolAccounts;
  /** Defaults to the localStorage journal. Without durable storage nothing is sent. */
  journal?: TxJournal | null;
  /** Defaults to navigator.locks; null forces the module mutex. */
  locks?: LockManagerLike | null;
  /** Progress, with the signature as soon as there is one. */
  onStep?: (step: SendStep, signature?: string) => void;
  /** Delay between status polls. */
  pollMs?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_POLL_RPC_FAILURES = 5;
/** Upper bound for polling a transaction the cluster reports as processed but never confirms. */
const MAX_POLLS = 200;

let moduleLockHeld = false;

// Signatures this tab is delivering right now. Journal recovery and the pending notice leave them
// alone: the running sendOp owns them.
const inFlight = new Set<string>();
const inFlightListeners = new Set<() => void>();
function setInFlight(signature: string, on: boolean): void {
  if (on) inFlight.add(signature);
  else inFlight.delete(signature);
  inFlightListeners.forEach((l) => l());
}
export function inFlightSignatures(): ReadonlySet<string> {
  return inFlight;
}
export function subscribeInFlight(listener: () => void): () => void {
  inFlightListeners.add(listener);
  return () => {
    inFlightListeners.delete(listener);
  };
}

function browserLocks(): LockManagerLike | null {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return nav?.locks ?? null;
}

/** Runs `fn` holding the transaction lock, or fails with reason "busy" when another one holds it. */
export async function withTxLock<T>(fn: () => Promise<T>, locks: LockManagerLike | null = browserLocks()): Promise<T> {
  if (locks) {
    return locks.request(TX_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new TxFailedError("busy");
      return fn();
    });
  }
  if (moduleLockHeld) throw new TxFailedError("busy");
  moduleLockHeld = true;
  try {
    return await fn();
  } finally {
    moduleLockHeld = false;
  }
}

type Lifetime = Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0];

function buildMessage(signer: TransactionSigner, lifetime: Lifetime, instructions: Instruction[]) {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
}

async function latestLifetime(rpc: EloteRpc): Promise<Lifetime> {
  const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  return value;
}

/** Unsigned simulation; returns the compute units used, or throws the typed failure. */
async function simulate(rpc: EloteRpc, signer: TransactionSigner, instructions: Instruction[]): Promise<bigint | undefined> {
  const probe = [
    setComputeUnitLimitInstruction(MAX_COMPUTE_UNITS),
    setComputeUnitPriceInstruction(PRIORITY_FEE_MICROLAMPORTS),
    ...instructions,
  ];
  const message = buildMessage(signer, await latestLifetime(rpc), probe);
  const wire = getBase64EncodedWireTransaction(compileTransaction(message));
  const { value } = await rpc
    .simulateTransaction(wire, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" })
    .send();
  if (value.err) throw txErrorFromChain(value.err, message);
  return value.unitsConsumed ?? undefined;
}

export async function sendOp(op: PoolOp, ctx: SendContext): Promise<TxResult> {
  assertSignOnly(ctx.signer);
  const locks = ctx.locks === undefined ? browserLocks() : ctx.locks;
  return withTxLock(() => run(op, ctx), locks);
}

async function run(op: PoolOp, ctx: SendContext): Promise<TxResult> {
  const { rpc, signer, onStep } = ctx;
  const pollMs = ctx.pollMs ?? 1_500;
  const journal = ctx.journal === undefined ? getBrowserJournal() : ctx.journal;
  if (!journal) throw new TxFailedError("journal");
  const scope = { pool: ctx.config.poolAddress as string, payer: signer.address as string };

  // Settle what an earlier visit left behind; an entry still unresolved blocks a new prompt.
  try {
    await recoverJournal(journal, rpc, scope);
    const pending = journal.unresolved(scope)[0];
    if (pending) throw new TxUncertainError(pending.signature);
  } catch (error) {
    if (error instanceof JournalError) throw new TxFailedError("journal", { cause: error });
    throw toTxError(error);
  }

  onStep?.("simulating");
  let message: ReturnType<typeof buildMessage>;
  try {
    const instructions = await buildOpInstructions(op, { signer, config: ctx.config, accounts: ctx.accounts });
    const units = await simulate(rpc, signer, instructions);
    const budget = [
      ...(units !== undefined ? [setComputeUnitLimitInstruction(computeUnitsWithHeadroom(units))] : []),
      setComputeUnitPriceInstruction(PRIORITY_FEE_MICROLAMPORTS),
    ];
    // A fresh blockhash right before the wallet prompt.
    message = buildMessage(signer, await latestLifetime(rpc), [...budget, ...instructions]);
  } catch (error) {
    throw toTxError(error);
  }
  const lastValidBlockHeight = message.lifetimeConstraint.lastValidBlockHeight;

  onStep?.("signing");
  const signed = await signWithGuard(message);
  const signature = getSignatureFromTransaction(signed);
  const wire = getBase64EncodedWireTransaction(signed);

  try {
    journal.persistSigned({
      signature,
      lastValidBlockHeight: lastValidBlockHeight.toString(),
      op: op.kind,
      createdAt: Date.now(),
      pool: scope.pool,
      payer: scope.payer,
      signedBase64: wire,
    });
  } catch (error) {
    // Same signer, same blockhash, same instructions: the very transaction already recorded, which
    // the cluster runs at most once. Its outcome is this op's outcome.
    const earlier = journal.get(signature);
    if (earlier) return earlierOutcome(earlier);
    // Without a durable record a closed tab could lose track of it: do not send.
    throw new TxFailedError("journal", { cause: error });
  }

  setInFlight(signature, true);
  try {
    onStep?.("sending", signature);
    return await deliver({ rpc, journal, onStep, pollMs, message, signature, wire, lastValidBlockHeight });
  } finally {
    setInFlight(signature, false);
  }
}

function earlierOutcome(entry: JournalEntry): TxResult {
  switch (entry.status) {
    case "confirmed":
      return { signature: entry.signature, ...(entry.slot !== undefined ? { slot: BigInt(entry.slot) } : {}) };
    case "failed":
      throw new TxFailedError("unknown", { signature: entry.signature });
    case "expired":
      throw new TxExpiredError(entry.signature);
    default:
      throw new TxUncertainError(entry.signature);
  }
}

type Delivery = {
  rpc: EloteRpc;
  journal: TxJournal;
  onStep: SendContext["onStep"];
  pollMs: number;
  message: MessageLike;
  signature: string;
  wire: string;
  lastValidBlockHeight: bigint;
};

async function lookup(rpc: EloteRpc, signature: string) {
  const { value } = await rpc.getSignatureStatuses([toSignature(signature)], { searchTransactionHistory: true }).send();
  return value[0] ?? null;
}

async function deliver({ rpc, journal, onStep, pollMs, message, signature, wire, lastValidBlockHeight }: Delivery): Promise<TxResult> {

  try {
    // The person may have taken longer than the lifetime to approve.
    if ((await rpc.getBlockHeight({ commitment: "confirmed" }).send()) > lastValidBlockHeight) {
      journal.setStatus(signature, "expired");
      throw new TxExpiredError(signature);
    }
  } catch (error) {
    if (error instanceof TxExpiredError) throw error;
    // Height unknown: sending is still safe, the cluster rejects an expired blockhash.
  }

  try {
    await rpc
      .sendTransaction(wire as Base64EncodedWireTransaction, { encoding: "base64", preflightCommitment: "confirmed" })
      .send();
  } catch (error) {
    if (isSolanaError(error, SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE)) {
      // Preflight also rejects a transaction that already landed ("already processed"): if the
      // cluster knows the signature, polling settles it.
      const known = await lookup(rpc, signature).catch(() => null);
      if (!known) {
        // Rejected in preflight: never broadcast, these bytes are void.
        const typed = toTxError(error, message);
        journal.setStatus(signature, typed instanceof TxExpiredError ? "expired" : "failed");
        throw typed;
      }
    }
    // Network trouble: it may or may not have been broadcast. Polling decides.
  }
  journal.setStatus(signature, "sent");

  onStep?.("confirming", signature);
  let rpcFailures = 0;
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    try {
      const { value } = await rpc.getSignatureStatuses([toSignature(signature)]).send();
      let status = value[0] ?? null;
      if (!status && (await rpc.getBlockHeight({ commitment: "confirmed" }).send()) > lastValidBlockHeight) {
        // Past the lifetime and not in the recent cache: one history lookup decides.
        const history = await rpc.getSignatureStatuses([toSignature(signature)], { searchTransactionHistory: true }).send();
        status = history.value[0] ?? null;
        if (!status) {
          journal.setStatus(signature, "expired");
          throw new TxExpiredError(signature);
        }
      }
      rpcFailures = 0;
      if (status?.err) {
        journal.setStatus(signature, "failed", { slot: status.slot });
        throw txErrorFromChain(status.err, message, signature);
      }
      if (status && (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized")) {
        journal.setStatus(signature, "confirmed", { slot: status.slot });
        return { signature, slot: status.slot };
      }
    } catch (error) {
      if (error instanceof TxExpiredError || error instanceof TxFailedError) throw error;
      if (++rpcFailures >= MAX_POLL_RPC_FAILURES) throw new TxUncertainError(signature);
    }
    await sleep(pollMs);
  }
  throw new TxUncertainError(signature);
}
