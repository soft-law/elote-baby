import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { generateKeyPairSigner, getBase58Decoder } from "@solana/kit";
import {
  JournalError,
  TX_JOURNAL_KEY,
  createJournal,
  memoryStore,
  recoverJournal,
  type JournalStore,
} from "../src/tx/journal";
import { createRpc } from "../src/tx/rpc";
import { TxExpiredError } from "../src/tx/tx";
import { sendOp, type SendContext } from "../src/tx/write";
import { RPC_URL, countingSigner, healthyCluster, startRpc, testPool, type ChainState } from "./support/rpc";

const rpcServer = startRpc();
afterAll(() => rpcServer.close());
let state: ChainState;
beforeEach(async () => {
  rpcServer.reset();
  state = await healthyCluster(rpcServer);
});

const randomSignature = () => getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(64)));

const entry = (over: Partial<Parameters<ReturnType<typeof createJournal>["persistSigned"]>[0]> = {}) => ({
  signature: randomSignature(),
  lastValidBlockHeight: "1000",
  op: "deposit" as const,
  createdAt: Date.now(),
  pool: "pool",
  payer: "payer",
  signedBase64: "",
  ...over,
});

describe("journal store", () => {
  test("uses the elote.tx.v1 key and moves only forward", () => {
    const store = memoryStore();
    const journal = createJournal(store);
    const e = journal.persistSigned(entry());
    expect(e.status).toBe("signed");
    expect(e.id).toBeTruthy();
    expect(JSON.parse(store.getItem(TX_JOURNAL_KEY)!)[e.signature].status).toBe("signed");
    journal.setStatus(e.signature, "sent");
    journal.setStatus(e.signature, "confirmed");
    // Another tab settling late cannot move it back.
    journal.setStatus(e.signature, "sent");
    journal.setStatus(e.signature, "expired");
    expect(journal.get(e.signature)?.status).toBe("confirmed");
    expect(journal.unresolved()).toHaveLength(0);
  });

  test("a second record of the same signature is refused", () => {
    const journal = createJournal(memoryStore());
    const e = entry();
    journal.persistSigned(e);
    expect(() => journal.persistSigned(e)).toThrow(JournalError);
  });

  test("an unreadable record is an error, never silently replaced", () => {
    const store = memoryStore();
    store.setItem(TX_JOURNAL_KEY, "{not json");
    expect(() => createJournal(store).unresolved()).toThrow(JournalError);
  });

  test("storage that does not keep the write is an error", () => {
    const leaky: JournalStore = { getItem: () => null, setItem: () => undefined };
    expect(() => createJournal(leaky).persistSigned(entry())).toThrow(JournalError);
  });

  test("keeps at most 50 settled entries, never drops unresolved ones", () => {
    const journal = createJournal(memoryStore());
    const pending = journal.persistSigned(entry({ createdAt: 0 }));
    for (let i = 1; i <= 60; i++) {
      const e = journal.persistSigned(entry({ createdAt: i }));
      journal.setStatus(e.signature, "confirmed");
    }
    expect(journal.all().filter((e) => e.status === "confirmed")).toHaveLength(50);
    expect(journal.get(pending.signature)?.status).toBe("signed");
  });
});

// Review Focus 4: closing the tab between signing and sending leaves a journal entry that
// resolves on return (sent, confirmed or expired) without a second signature.
describe("interrupted transaction", () => {
  /** Runs a deposit and "closes the tab" right after the signature is recorded, before sending. */
  async function signThenCloseTab() {
    const store = memoryStore();
    const { signer, count } = await countingSigner();
    const { config, accounts } = await testPool();
    const ctx: SendContext = {
      rpc: createRpc(RPC_URL),
      signer,
      config,
      accounts,
      journal: createJournal(store),
      locks: null,
      pollMs: 1,
      onStep: (step) => {
        if (step === "sending") throw new Error("tab closed");
      },
    };
    await expect(sendOp({ kind: "deposit", assets: 3_000_000n, minSharesOut: 1n }, ctx)).rejects.toThrow("tab closed");
    expect(rpcServer.count("sendTransaction")).toBe(0);
    // A fresh page load: new journal instance over the same storage, same RPC, no wallet prompt.
    const journal = createJournal(store);
    const [pending] = journal.unresolved();
    expect(pending?.status).toBe("signed");
    expect(count()).toBe(1);
    return { journal, pending: pending!, scope: { pool: config.poolAddress, payer: signer.address }, signCount: count, ctx, store };
  }

  test("inside the lifetime and unknown to the cluster: the same bytes are sent, then confirmed", async () => {
    const { journal, pending, scope, signCount } = await signThenCloseTab();
    state.confirmOnSend = null;
    const rpc = createRpc(RPC_URL);

    expect(await recoverJournal(journal, rpc, scope)).toEqual([{ signature: pending.signature, status: "sent" }]);
    expect(state.sent).toEqual([pending.signedBase64]);

    // Next check: the cluster has it.
    state.statuses.set(pending.signature, { err: null, confirmationStatus: "confirmed", slot: 77 });
    expect(await recoverJournal(journal, rpc, scope)).toEqual([{ signature: pending.signature, status: "confirmed" }]);
    expect(journal.get(pending.signature)).toMatchObject({ status: "confirmed", slot: "77" });
    expect(state.sent).toHaveLength(1);
    expect(signCount()).toBe(1);
  });

  test("past the lifetime and unknown: expired, nothing sent", async () => {
    const { journal, pending, scope, signCount } = await signThenCloseTab();
    state.height = 1_001;
    expect(await recoverJournal(journal, createRpc(RPC_URL), scope)).toEqual([{ signature: pending.signature, status: "expired" }]);
    expect(state.sent).toHaveLength(0);
    expect(signCount()).toBe(1);
  });

  test("it landed before the tab closed (another path sent it): confirmed", async () => {
    const { journal, pending, scope } = await signThenCloseTab();
    state.statuses.set(pending.signature, { err: null, confirmationStatus: "finalized", slot: 12 });
    expect(await recoverJournal(journal, createRpc(RPC_URL), scope)).toEqual([{ signature: pending.signature, status: "confirmed" }]);
    expect(state.sent).toHaveLength(0);
  });

  test("an RPC outage is not evidence of anything: the entry stays as it was", async () => {
    const { journal, pending, scope } = await signThenCloseTab();
    rpcServer.use({
      getSignatureStatuses: () => {
        throw new Response("down", { status: 503 });
      },
    });
    expect(await recoverJournal(journal, createRpc(RPC_URL), scope)).toEqual([{ signature: pending.signature, status: "signed" }]);
  });

  test("a new send from the returning tab settles the old entry first and never re-prompts for it", async () => {
    const { ctx, store, pending, signCount } = await signThenCloseTab();
    state.statuses.set(pending.signature, { err: null, confirmationStatus: "confirmed", slot: 5 });
    const journal = createJournal(store);
    state.blockhash = (await generateKeyPairSigner()).address;
    const result = await sendOp({ kind: "deposit", assets: 3_000_000n, minSharesOut: 1n }, { ...ctx, journal, onStep: undefined });
    expect(journal.get(pending.signature)?.status).toBe("confirmed");
    expect(journal.get(result.signature)?.status).toBe("confirmed");
    // One signature for the interrupted intent, one for the new one.
    expect(signCount()).toBe(2);
  });

  test("the identical transaction signed again is not sent twice", async () => {
    const { ctx, store, pending } = await signThenCloseTab();
    state.statuses.set(pending.signature, { err: null, confirmationStatus: "confirmed", slot: 5 });
    // Same blockhash, same op, same signer: the same signature.
    const error = await sendOp({ kind: "deposit", assets: 3_000_000n, minSharesOut: 1n }, { ...ctx, journal: createJournal(store), onStep: undefined }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TxExpiredError);
    expect(state.sent).toHaveLength(0);
  });

  test("a sent entry is only looked up, never re-sent", async () => {
    const journal = createJournal(memoryStore());
    const e = journal.persistSigned(entry({ signedBase64: "AAAA" }));
    journal.setStatus(e.signature, "sent");
    expect(await recoverJournal(journal, createRpc(RPC_URL), { pool: "pool" })).toEqual([{ signature: e.signature, status: "sent" }]);
    expect(rpcServer.count("sendTransaction")).toBe(0);
  });

  test("entries of another pool are left alone", async () => {
    const journal = createJournal(memoryStore());
    journal.persistSigned(entry({ pool: "other" }));
    expect(await recoverJournal(journal, createRpc(RPC_URL), { pool: "pool" })).toEqual([]);
    expect(rpcServer.calls).toHaveLength(0);
  });
});
