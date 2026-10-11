import "./support/dom";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { AppConfig } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { createJournal, memoryStore, type TxJournal } from "../src/tx/journal";
import { RpcProvider } from "../src/tx/RpcProvider";
import { useJournalRecovery, type JournalRecovery } from "../src/tx/useJournalRecovery";
import { sendOp } from "../src/tx/write";
import { createRpc } from "../src/tx/rpc";
import { RPC_URL, countingSigner, healthyCluster, startRpc, testPool, type ChainState } from "./support/rpc";

const rpcServer = startRpc();
afterAll(() => rpcServer.close());
let state: ChainState;
beforeEach(async () => {
  rpcServer.reset();
  state = await healthyCluster(rpcServer);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mounts the hook the way the app does (RPC and config providers) and records every render. */
async function mountRecovery(journal: TxJournal, poolAddress: AppConfig["poolAddress"]) {
  const seen: JournalRecovery[] = [];
  function Probe() {
    seen.push(useJournalRecovery({ journal, intervalMs: 10 }));
    return null;
  }
  const config = { rpcUrl: RPC_URL, poolAddress, explorerCluster: "devnet" } as AppConfig;
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfigContext.Provider value={config}>
        <RpcProvider url={RPC_URL}>
          <Probe />
        </RpcProvider>
      </ConfigContext.Provider>,
    );
  });
  return { seen, unmount: () => act(async () => root.unmount()) };
}

describe("useJournalRecovery", () => {
  test("never races a send in progress: one broadcast, nothing shown as pending", async () => {
    const journal = createJournal(memoryStore());
    const { signer } = await countingSigner();
    const { config, accounts } = await testPool();
    // A slow node gives the hook every chance to re-broadcast the fresh "signed" entry.
    rpcServer.use({
      sendTransaction: async (params) => {
        await sleep(150);
        const wire = params[0] as string;
        state.sent.push(wire);
        const { signatureOfWire } = await import("./support/rpc");
        const sig = signatureOfWire(wire);
        state.statuses.set(sig, { err: null, confirmationStatus: "confirmed", slot: 9 });
        return sig;
      },
    });
    const { seen, unmount } = await mountRecovery(journal, config.poolAddress);
    let result: Awaited<ReturnType<typeof sendOp>> | undefined;
    await act(async () => {
      result = await sendOp(
        { kind: "deposit", assets: 2_000_000n, minSharesOut: 1n },
        { rpc: createRpc(RPC_URL), signer, config, accounts, journal, locks: null, pollMs: 5 },
      );
      await sleep(60);
    });
    expect(result?.signature).toBeDefined();
    expect(rpcServer.count("sendTransaction")).toBe(1);
    expect(seen.every((r) => r.pending.length === 0)).toBe(true);
    expect(journal.get(result!.signature)?.status).toBe("confirmed");
    await unmount();
  });

  test("settles an entry left by an earlier visit, re-sending its saved bytes once", async () => {
    const store = memoryStore();
    const { signer, count } = await countingSigner();
    const { config, accounts } = await testPool();
    // Earlier visit: signed, then the tab closed before sending.
    await sendOp(
      { kind: "draw", lineId: 0n },
      {
        rpc: createRpc(RPC_URL),
        signer,
        config,
        accounts,
        journal: createJournal(store),
        locks: null,
        onStep: (step) => {
          if (step === "sending") throw new Error("tab closed");
        },
      },
    ).catch(() => undefined);
    const journal = createJournal(store);
    const [left] = journal.unresolved();
    expect(left?.status).toBe("signed");

    const { seen, unmount } = await mountRecovery(journal, config.poolAddress);
    await act(async () => {
      await sleep(80);
    });
    expect(seen.some((r) => r.pending.length === 1)).toBe(true);
    expect(seen.at(-1)?.pending).toEqual([]);
    expect(state.sent).toEqual([left!.signedBase64]);
    expect(journal.get(left!.signature)?.status).toBe("confirmed");
    expect(count()).toBe(1);
    await unmount();
  });

  test("set-aside data is reported until dismissed", async () => {
    const store = memoryStore();
    store.setItem("elote.tx.v1", "not json");
    const journal = createJournal(store);
    const { config } = await testPool();
    const { seen, unmount } = await mountRecovery(journal, config.poolAddress);
    expect(seen.at(-1)?.unavailable).toBe(true);
    await act(async () => seen.at(-1)!.dismissUnavailable());
    expect(seen.at(-1)?.unavailable).toBe(false);
    await unmount();
  });
});
