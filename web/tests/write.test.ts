import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { ELOTE_POOL_PROGRAM_ADDRESS } from "@elote/pool-client";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getBase58Decoder, getBase64Encoder, getCompiledTransactionMessageDecoder, getTransactionDecoder } from "@solana/kit";
import { COMPUTE_BUDGET_PROGRAM, PRIORITY_FEE_MICROLAMPORTS } from "../src/tx/computeBudget";
import { describeTxError } from "../src/tx/errors";
import { createJournal, memoryStore, type TxJournal } from "../src/tx/journal";
import { createRpc } from "../src/tx/rpc";
import { TxExpiredError, TxFailedError, TxUncertainError } from "../src/tx/tx";
import { sendOp, withTxLock, type LockManagerLike, type SendContext, type SendStep } from "../src/tx/write";
import { translations } from "../src/translations";
import {
  RPC_URL,
  RpcErrorReply,
  countingSigner,
  healthyCluster,
  signatureOfWire,
  startRpc,
  testPool,
  type ChainState,
} from "./support/rpc";

const rpcServer = startRpc();
afterAll(() => rpcServer.close());

let state: ChainState;
let journal: TxJournal;
beforeEach(async () => {
  rpcServer.reset();
  state = await healthyCluster(rpcServer);
  journal = createJournal(memoryStore());
});

async function context(overrides: Partial<SendContext> = {}) {
  const { signer, count } = await countingSigner();
  const { config, accounts } = await testPool();
  const steps: Array<[SendStep, string | undefined]> = [];
  const ctx: SendContext = {
    rpc: createRpc(RPC_URL),
    signer,
    config,
    accounts,
    journal,
    locks: null,
    pollMs: 1,
    onStep: (step, sig) => steps.push([step, sig]),
    ...overrides,
  };
  return { ctx, steps, signCount: count };
}

function programsOf(base64: string): string[] {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(base64));
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes) as unknown as {
    staticAccounts: string[];
    instructions: Array<{ programAddressIndex: number }>;
  };
  return message.instructions.map((ix) => message.staticAccounts[ix.programAddressIndex]!);
}

function randomSignature(): string {
  return getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(64)));
}

const deposit = { kind: "deposit", assets: 5_000_000n, minSharesOut: 4_990_000n } as const;

describe("sendOp", () => {
  test("happy path: simulate, fresh blockhash, sign, send, confirm", async () => {
    const { ctx, steps, signCount } = await context();
    const result = await sendOp(deposit, ctx);

    expect(state.sent).toHaveLength(1);
    expect(result.signature.length).toBeGreaterThan(80);
    expect(result.slot).toBe(4242n);
    expect(signCount()).toBe(1);
    expect(steps.map(([s]) => s)).toEqual(["simulating", "signing", "sending", "confirming"]);
    expect(steps[2]?.[1]).toBe(result.signature);

    const methods = rpcServer.methods();
    expect(methods.indexOf("simulateTransaction")).toBeLessThan(methods.lastIndexOf("getLatestBlockhash"));
    expect(methods.filter((m) => m === "getLatestBlockhash")).toHaveLength(2);
    expect(methods.indexOf("sendTransaction")).toBeGreaterThan(methods.lastIndexOf("getLatestBlockhash"));

    // Simulation is unsigned: no signature spent before the wallet prompt.
    const simulate = rpcServer.calls.find((c) => c.method === "simulateTransaction")!;
    expect(simulate.params[1]).toMatchObject({ sigVerify: false, replaceRecentBlockhash: true, encoding: "base64" });

    // Compute unit limit (from the simulation) and price, the idempotent token account, the pool call.
    expect(programsOf(state.sent[0]!)).toEqual([COMPUTE_BUDGET_PROGRAM, COMPUTE_BUDGET_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ADDRESS, ELOTE_POOL_PROGRAM_ADDRESS]);

    const entry = journal.get(result.signature);
    expect(entry).toMatchObject({ status: "confirmed", op: "deposit", slot: "4242", lastValidBlockHeight: "1000" });
    expect(entry?.pool).toBe(ctx.config.poolAddress);
  });

  test("each op writes its own token account before the pool call", async () => {
    for (const op of [
      { kind: "redeem", shares: 1_000_000n, minAssetsOut: 990_000n },
      { kind: "draw", lineId: 0n },
      { kind: "repay", lineId: 3n, amount: 250_000n },
    ] as const) {
      const { ctx } = await context();
      await sendOp(op, ctx);
      expect(programsOf(state.sent.at(-1)!)).toEqual([COMPUTE_BUDGET_PROGRAM, COMPUTE_BUDGET_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ADDRESS, ELOTE_POOL_PROGRAM_ADDRESS]);
    }
  });

  test("simulation failure maps to TxFailedError with the program error name; nothing signed", async () => {
    // Indexes 0 and 1 are the compute budget (limit, price), 2 the token account, 3 the pool deposit.
    state.simulateErr = { InstructionError: [3, { Custom: 6011 }] };
    const { ctx, signCount } = await context();
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxFailedError);
    expect(error).toMatchObject({ reason: "program", programCode: 6011, programErrorName: "SlippageExceeded" });
    expect(describeTxError(error, translations.en)).toBe(translations.en.app.tx.errors.program.slippageExceeded);
    expect(signCount()).toBe(0);
    expect(state.sent).toHaveLength(0);
    expect(journal.all()).toHaveLength(0);
  });

  test("a custom code from the token account instruction is not read as a pool error", async () => {
    state.simulateErr = { InstructionError: [2, { Custom: 1 }] };
    const { ctx } = await context();
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "insufficient-sol" });
  });

  test("not enough SOL for the fee", async () => {
    state.simulateErr = "InsufficientFundsForFee";
    const { ctx } = await context();
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "insufficient-sol" });
    expect(describeTxError(error, translations.es)).toBe(translations.es.app.tx.errors.insufficientSol);
  });

  test("blockhash expiry while confirming: TxExpiredError, journal expired", async () => {
    state.confirmOnSend = null;
    let polls = 0;
    rpcServer.use({
      getBlockHeight: () => (++polls > 1 ? 1_001 : 900),
    });
    const { ctx } = await context();
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxExpiredError);
    const sig = (error as TxExpiredError).signature!;
    expect(journal.get(sig)?.status).toBe("expired");
    // One history lookup before declaring it expired.
    const lookups = rpcServer.calls.filter((c) => c.method === "getSignatureStatuses");
    expect(lookups.at(-1)?.params[1]).toMatchObject({ searchTransactionHistory: true });
  });

  test("lifetime gone before sending (slow approval): expired, never sent", async () => {
    state.height = 1_001;
    const { ctx } = await context();
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxExpiredError);
    expect(rpcServer.count("sendTransaction")).toBe(0);
    expect(journal.all()[0]?.status).toBe("expired");
  });

  test("preflight rejection on send: failed, typed, journal failed", async () => {
    rpcServer.use({
      sendTransaction: () => {
        throw new RpcErrorReply(-32002, "Transaction simulation failed", {
          err: { InstructionError: [3, { Custom: 6000 }] },
          logs: [],
          accounts: null,
          unitsConsumed: 1000,
          returnData: null,
        });
      },
    });
    const { ctx } = await context();
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "program", programErrorName: "Paused" });
    expect(journal.all()[0]?.status).toBe("failed");
  });

  test("a 429 on send is retried with the same bytes; the journal stays signed until a node takes them", async () => {
    const statusAtSend: Array<string | undefined> = [];
    rpcServer.use({
      sendTransaction: (params, call) => {
        const wire = params[0] as string;
        const sig = signatureOfWire(wire);
        statusAtSend.push(journal.get(sig)?.status);
        state.sent.push(wire);
        if (call === 0) throw new Response("rate limited", { status: 429 });
        state.statuses.set(sig, { err: null, confirmationStatus: "confirmed", slot: 64 });
        return sig;
      },
    });
    const { ctx, signCount } = await context({ sendRetryMs: [5, 5] });
    const result = await sendOp(deposit, ctx);
    expect(result).toEqual({ signature: signatureOfWire(state.sent[0]!), slot: 64n });
    expect(state.sent).toHaveLength(2);
    expect(state.sent[1]).toBe(state.sent[0]!);
    expect(statusAtSend).toEqual(["signed", "signed"]);
    expect(journal.get(result.signature)?.status).toBe("confirmed");
    expect(signCount()).toBe(1);
  });

  test("send retries stop at the attempt limit; polling then decides", async () => {
    state.confirmOnSend = null;
    rpcServer.use({
      sendTransaction: (params) => {
        state.sent.push(params[0] as string);
        throw new Response("unavailable", { status: 503 });
      },
    });
    let polls = 0;
    rpcServer.use({ getBlockHeight: () => (++polls > 4 ? 1_001 : 900) });
    const { ctx } = await context({ sendRetryMs: [1, 1] });
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(state.sent).toHaveLength(3);
    expect(new Set(state.sent).size).toBe(1);
    expect(error).toBeInstanceOf(TxExpiredError);
  });

  test("a preflight rejection is never retried", async () => {
    rpcServer.use({
      sendTransaction: () => {
        throw new RpcErrorReply(-32002, "Transaction simulation failed", {
          err: { InstructionError: [3, { Custom: 6000 }] },
          logs: [],
          accounts: null,
          unitsConsumed: 1000,
          returnData: null,
        });
      },
    });
    const { ctx } = await context({ sendRetryMs: [1, 1] });
    await sendOp(deposit, ctx).catch(() => undefined);
    expect(rpcServer.count("sendTransaction")).toBe(1);
  });

  test("failure on chain after sending maps the program error", async () => {
    state.confirmOnSend = null;
    rpcServer.use({
      sendTransaction: (params) => {
        const sig = signatureOfWire(params[0] as string);
        state.statuses.set(sig, { err: { InstructionError: [3, { Custom: 6003 }] }, confirmationStatus: "confirmed", slot: 7 });
        return sig;
      },
    });
    const { ctx } = await context();
    const error = await sendOp({ kind: "redeem", shares: 10n, minAssetsOut: 9n }, ctx).catch((e: unknown) => e);
    expect(error).toMatchObject({ reason: "program", programErrorName: "InsufficientLiquidity" });
    expect((error as TxFailedError).signature).toBeDefined();
    expect(journal.all()[0]?.status).toBe("failed");
  });

  test("sent but never confirmed (status lookups keep failing): TxUncertainError, journal stays sent", async () => {
    state.confirmOnSend = null;
    rpcServer.use({
      getSignatureStatuses: () => {
        throw new Response("unavailable", { status: 503 });
      },
    });
    const { ctx } = await context();
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxUncertainError);
    const sig = (error as TxUncertainError).signature;
    expect(state.sent).toHaveLength(1);
    expect(signatureOfWire(state.sent[0]!)).toBe(sig);
    expect(journal.get(sig)?.status).toBe("sent");
    expect(rpcServer.count("getSignatureStatuses")).toBe(5);
  });

  test("preflight 'already processed' for a transaction that landed is a confirmation, not a failure", async () => {
    rpcServer.use({
      sendTransaction: (params) => {
        // Landed a moment ago (for instance re-broadcast by another tab), so preflight refuses it.
        state.statuses.set(signatureOfWire(params[0] as string), { err: null, confirmationStatus: "confirmed", slot: 31 });
        throw new RpcErrorReply(-32002, "Transaction simulation failed: This transaction has already been processed", {
          err: "AlreadyProcessed",
          logs: [],
          accounts: null,
          unitsConsumed: 0,
          returnData: null,
        });
      },
    });
    const { ctx } = await context();
    const result = await sendOp(deposit, ctx);
    expect(result.slot).toBe(31n);
    expect(journal.get(result.signature)?.status).toBe("confirmed");
  });

  test("a compute unit price is part of the message the wallet signs", async () => {
    const { ctx } = await context();
    await sendOp(deposit, ctx);
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(state.sent[0]!));
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes) as unknown as {
      instructions: Array<{ data?: Uint8Array }>;
    };
    const price = message.instructions[1]!.data!;
    expect(price[0]).toBe(3);
    expect(new DataView(price.buffer, price.byteOffset, price.byteLength).getBigUint64(1, true)).toBe(PRIORITY_FEE_MICROLAMPORTS);
  });

  test("an unresolved earlier transaction blocks a new prompt", async () => {
    const { ctx, signCount } = await context();
    const earlier = randomSignature();
    journal.persistSigned({
      signature: earlier,
      lastValidBlockHeight: "1000",
      op: "deposit",
      createdAt: 1,
      pool: ctx.config.poolAddress,
      payer: ctx.signer.address,
      signedBase64: "",
    });
    journal.setStatus(earlier, "sent");
    const error = await sendOp(deposit, ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TxUncertainError);
    expect(signCount()).toBe(0);
    expect(rpcServer.count("simulateTransaction")).toBe(0);
    // Recovery looked it up instead of re-sending a "sent" entry.
    expect(rpcServer.count("getSignatureStatuses")).toBe(1);
    expect(rpcServer.count("sendTransaction")).toBe(0);
    expect(journal.get(earlier)?.status).toBe("sent");
  });
});

describe("one transaction at a time", () => {
  test("module mutex: a second concurrent send is refused as busy", async () => {
    const a = await context();
    const b = await context();
    const [first, second] = await Promise.allSettled([sendOp(deposit, a.ctx), sendOp(deposit, b.ctx)]);
    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("rejected");
    expect((second as PromiseRejectedResult).reason).toMatchObject({ reason: "busy" });
    expect(b.signCount()).toBe(0);
    // Released afterwards.
    await expect(sendOp(deposit, b.ctx)).resolves.toBeDefined();
  });

  test("Web Locks: a second user send is busy; the transaction lock is awaited, not skipped", async () => {
    const calls: Array<[string, boolean]> = [];
    const held = new Set<string>();
    const queues = new Map<string, Array<() => void>>();
    const locks: LockManagerLike = {
      async request(name, options, callback) {
        calls.push([name, options.ifAvailable === true]);
        if (held.has(name)) {
          if (options.ifAvailable) return callback(null);
          await new Promise<void>((resolve) => queues.set(name, [...(queues.get(name) ?? []), resolve]));
        }
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          const next = queues.get(name)?.shift();
          if (next) next();
          else held.delete(name);
        }
      },
    };
    const a = await context({ locks });
    const b = await context({ locks });
    const [first, second] = await Promise.allSettled([sendOp(deposit, a.ctx), sendOp(deposit, b.ctx)]);
    expect(first.status).toBe("fulfilled");
    expect((second as PromiseRejectedResult).reason).toMatchObject({ reason: "busy" });
    expect(calls).toContainEqual(["elote.tx.send", true]);
    expect(calls).toContainEqual(["elote.tx", false]);
    expect(b.signCount()).toBe(0);
  });

  test("a send pressed while a recovery check holds the transaction lock waits for it", async () => {
    let release!: () => void;
    const recovery = withTxLock(() => new Promise<void>((resolve) => (release = resolve)), null);
    const { ctx, signCount } = await context();
    let settled = false;
    const send = sendOp(deposit, ctx).finally(() => (settled = true));
    await new Promise((r) => setTimeout(r, 30));
    // Still waiting: nothing simulated or signed, and not failed as busy.
    expect(settled).toBe(false);
    expect(rpcServer.count("simulateTransaction")).toBe(0);
    release();
    await recovery;
    await expect(send).resolves.toMatchObject({ slot: 4242n });
    expect(signCount()).toBe(1);
  });

  test("a recovery check while a send runs skips (busy) instead of waiting", async () => {
    const { ctx } = await context();
    const send = sendOp(deposit, ctx);
    await expect(withTxLock(async () => "ran", null)).rejects.toMatchObject({ reason: "busy" });
    await send;
    await expect(withTxLock(async () => "ran", null)).resolves.toBe("ran");
  });
});
