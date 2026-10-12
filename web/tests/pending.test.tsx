// A sent transaction whose outcome is not known yet (TxUncertainError) is "pending", not failed:
// no "Try again", the form stays closed for that op, and when journal recovery settles the entry
// the affected queries are refreshed and the toast tells the real outcome.
import "./support/dom";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getBase58Decoder, type Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AppConfig } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { DepositForm } from "../src/app/forms/DepositForm";
import { ToastProvider } from "../src/app/toast/Toast";
import { createJournal, memoryStore, type TxJournal } from "../src/tx/journal";
import { PendingTransactionNotice } from "../src/tx/PendingTransactionNotice";
import { RpcProvider } from "../src/tx/RpcProvider";
import { useJournalRecovery } from "../src/tx/useJournalRecovery";
import { TX_INVALIDATES, useTx } from "../src/tx/useTx";
import { translations } from "../src/translations";
import { WalletContext, type WalletState } from "../src/wallet/useWallet";
import { RPC_URL, countingSigner, healthyCluster, startRpc, testPool, type ChainState } from "./support/rpc";

const UNIT = 1_000_000n;
const en = translations.en;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const POOL = { vaultAmount: 10_000n * UNIT, nav: 16_000n * UNIT, supply: 15_000n * UNIT, paused: false };

const rpcServer = startRpc();
afterAll(() => rpcServer.close());
let state: ChainState;
/** While true, every status lookup fails: the send cannot be confirmed. */
let statusesDown: boolean;
beforeEach(async () => {
  rpcServer.reset();
  state = await healthyCluster(rpcServer);
  state.confirmOnSend = null;
  statusesDown = true;
  const lookup = (params: unknown[]) => {
    if (statusesDown) throw new Response("unavailable", { status: 503 });
    const sigs = params[0] as string[];
    return {
      context: { slot: 100 },
      value: sigs.map((s) => {
        const st = state.statuses.get(s);
        return st ? { slot: st.slot, confirmations: 1, err: st.err, confirmationStatus: st.confirmationStatus, status: st.err ? { Err: st.err } : { Ok: null } } : null;
      }),
    };
  };
  rpcServer.use({ getSignatureStatuses: lookup });
});

let mounted: { root: Root; host: HTMLElement; client: QueryClient } | null = null;
/** Unmounts inside act. Tests call it last, so recovery polling never updates state between tests. */
async function unmount() {
  if (!mounted) return;
  const { root, host, client } = mounted;
  mounted = null;
  await act(async () => root.unmount());
  host.remove();
  client.clear();
}
afterEach(unmount);

function Harness({ journal }: { journal: TxJournal }) {
  const tx = useTx({ journal, pollMs: 1 });
  // What the Shell's pending notice runs in the app.
  useJournalRecovery({ journal, intervalMs: 10 });
  return <DepositForm pool={POOL} balance={5_000n * UNIT} tx={tx} t={en} lang="en" />;
}

async function mount(opts: { journal?: TxJournal } = {}) {
  const journal = opts.journal ?? createJournal(memoryStore());
  const { signer } = await countingSigner();
  const { config: base } = await testPool();
  const config: AppConfig = { rpcUrl: RPC_URL, poolAddress: base.poolAddress, assetMint: base.assetMint, apiUrl: "http://api.test", explorerCluster: "devnet", testWallet: false };
  const wallet: WalletState = {
    status: "connected",
    account: null,
    address: signer.address,
    signer,
    connect: async () => undefined,
    disconnect: async () => undefined,
    wallets: [],
    chain: "solana:devnet",
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  // Cached reads the op changes; nothing observes them, so invalidation only marks them.
  for (const [key] of TX_INVALIDATES) client.setQueryData([key, "seed"], 1);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfigContext.Provider value={config}>
        <QueryClientProvider client={client}>
          <RpcProvider url={RPC_URL}>
            <WalletContext.Provider value={wallet}>
              <ToastProvider t={en}>
                <Harness journal={journal} />
              </ToastProvider>
            </WalletContext.Provider>
          </RpcProvider>
        </QueryClientProvider>
      </ConfigContext.Provider>,
    );
  });
  mounted = { root, host, client };
  const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
  return {
    journal,
    signer,
    config,
    client,
    q,
    submitButton: () => q<HTMLButtonElement>('[data-testid="deposit-submit"]')!,
    toast: () => q('[data-testid="toast"]'),
    toastText: () => q('[data-testid="toast"]')?.textContent ?? "",
    hasRetry: () => [...host.querySelectorAll('[data-testid="toast"] button')].some((b) => b.textContent === en.app.toast.retry),
    invalidated: () => TX_INVALIDATES.map(([key]) => client.getQueryState([key, "seed"])?.isInvalidated ?? false),
    async deposit(amount: string) {
      const input = q<HTMLInputElement>('[data-testid="deposit-form"] input')!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
        setter.call(input, amount);
        input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
      });
      await act(async () => {
        q<HTMLButtonElement>('[data-testid="deposit-submit"]')!.click();
        await sleep(5);
      });
    },
    input: () => q<HTMLInputElement>('[data-testid="deposit-form"] input')!,
    async until(check: () => boolean, label: string) {
      for (let i = 0; i < 400; i++) {
        if (check()) return;
        await act(async () => sleep(5));
      }
      throw new Error(`timed out waiting for ${label}: ${host.textContent}`);
    },
  };
}

type Page = Awaited<ReturnType<typeof mount>>;

/** Submits a deposit whose status lookups fail until the pipeline gives up: the result is pending. */
async function pendingDeposit(page: Page): Promise<string> {
  await page.deposit("10");
  await page.until(() => page.toast()?.textContent?.includes("result pending") ?? false, "pending toast");
  const [entry] = page.journal.unresolved();
  expect(entry?.status).toBe("sent");
  return entry!.signature;
}

describe("a transaction whose result is pending", () => {
  test("the toast says the result is pending, keeps the explorer link, offers no Try again; submit stays disabled with a note", async () => {
    const page = await mount();
    const sig = await pendingDeposit(page);
    expect(page.toast()!.getAttribute("data-tone")).toBe("info");
    expect(page.toastText()).toContain("Deposit: result pending");
    expect(page.q('[data-testid="toast-message"]')!.textContent).toBe(en.app.toast.pendingBody);
    expect(page.q('[data-testid="toast-explorer"]')!.getAttribute("href")).toBe(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
    expect(page.hasRetry()).toBe(false);
    expect(page.toastText()).not.toContain(en.app.toast.failed.replace("{op}", "Deposit"));
    expect(page.submitButton().disabled).toBe(true);
    expect(page.submitButton().textContent).toBe(en.app.tx.pendingButton);
    const note = page.q('[data-testid="deposit-pending-note"]')!;
    expect(note.textContent).toBe(en.app.tx.pendingNote);
    expect(page.submitButton().getAttribute("aria-describedby")).toBe(note.id);
    // A click does nothing: one transaction, sent once.
    await page.deposit("10");
    expect(rpcServer.count("sendTransaction")).toBe(1);
    expect(page.invalidated()).toEqual([false, false, false, false]);
    await unmount();
  });

  test("recovery confirms it: the affected queries are invalidated, the toast reaches Updated, the form clears", async () => {
    const page = await mount();
    const sig = await pendingDeposit(page);
    state.statuses.set(sig, { err: null, confirmationStatus: "confirmed", slot: 321 });
    statusesDown = false;
    await page.until(() => page.toast()?.getAttribute("data-tone") === "success", "success toast");
    expect(page.journal.get(sig)?.status).toBe("confirmed");
    expect(page.invalidated()).toEqual([true, true, true, true]);
    expect(page.toastText()).toContain(en.app.toast.done.replace("{op}", "Deposit"));
    expect(page.toastText()).toContain(en.app.toast.updated);
    expect(page.q('[data-testid="toast-message"]')).toBeNull();
    // The same toast, not a second one.
    expect(mounted!.host.querySelectorAll('[data-testid="toast"]')).toHaveLength(1);
    expect(page.input().value).toBe("");
    expect(page.submitButton().textContent).toBe(en.app.invest.deposit.submit);
  });

  test("recovery finds it expired: an info toast says nothing changed, and the form is open again", async () => {
    const page = await mount();
    const sig = await pendingDeposit(page);
    state.height = 1_001;
    statusesDown = false;
    await page.until(() => page.journal.get(sig)?.status === "expired" && !page.submitButton().disabled, "form re-enabled");
    expect(page.toast()!.getAttribute("data-tone")).toBe("info");
    expect(page.toastText()).toContain(en.app.toast.expired.replace("{op}", "Deposit"));
    expect(page.q('[data-testid="toast-message"]')!.textContent).toBe(en.app.toast.expiredBody);
    expect(page.hasRetry()).toBe(false);
    expect(page.submitButton().textContent).toBe(en.app.invest.deposit.submit);
    expect(page.q('[data-testid="deposit-pending-note"]')).toBeNull();
    expect(page.invalidated()).toEqual([true, true, true, true]);
    // The amount is still there to send again.
    expect(page.input().value).toBe("10");
  });

  test("recovery finds it failed on chain: the mapped program message and Try again", async () => {
    const page = await mount();
    const sig = await pendingDeposit(page);
    // Instruction 3 is the pool's deposit: code 6011 is SlippageExceeded.
    state.statuses.set(sig, { err: { InstructionError: [3, { Custom: 6011 }] }, confirmationStatus: "confirmed", slot: 322 });
    statusesDown = false;
    await page.until(() => page.toast()?.getAttribute("data-tone") === "error", "error toast");
    expect(page.journal.get(sig)?.status).toBe("failed");
    expect(page.q('[data-testid="toast-message"]')!.textContent).toBe(en.app.tx.errors.program.slippageExceeded);
    expect(page.hasRetry()).toBe(true);
    expect(page.submitButton().disabled).toBe(false);
    expect(page.invalidated()).toEqual([true, true, true, true]);
  });

  test("the pending notice refreshes the affected queries when an entry settles, with no form on screen", async () => {
    const journal = createJournal(memoryStore());
    const { config: base } = await testPool();
    const config: AppConfig = { rpcUrl: RPC_URL, poolAddress: base.poolAddress, assetMint: base.assetMint, apiUrl: "http://api.test", explorerCluster: "devnet", testWallet: false };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
    for (const [key] of TX_INVALIDATES) client.setQueryData([key, "seed"], 1);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted = { root, host, client };
    const sig = getBase58Decoder().decode(new Uint8Array(64).fill(4));
    await act(async () => {
      journal.persistSigned({ signature: sig, lastValidBlockHeight: "100000", op: "deposit", createdAt: Date.now(), pool: config.poolAddress, payer: "payer", signedBase64: "AAAA" });
      journal.setStatus(sig, "sent");
      root.render(
        <ConfigContext.Provider value={config}>
          <QueryClientProvider client={client}>
            <RpcProvider url={RPC_URL}>
              <PendingTransactionNotice t={en} recovery={{ journal, intervalMs: 10 }} />
            </RpcProvider>
          </QueryClientProvider>
        </ConfigContext.Provider>,
      );
    });
    const invalidated = () => TX_INVALIDATES.map(([key]) => client.getQueryState([key, "seed"])?.isInvalidated ?? false);
    expect(host.textContent).toContain(en.app.tx.pending.title);
    expect(invalidated()).toEqual([false, false, false, false]);
    state.statuses.set(sig, { err: null, confirmationStatus: "confirmed", slot: 400 });
    statusesDown = false;
    for (let i = 0; i < 200 && journal.get(sig)?.status !== "confirmed"; i++) await act(async () => sleep(5));
    await act(async () => sleep(5));
    expect(journal.get(sig)?.status).toBe("confirmed");
    expect(host.textContent).toBe("");
    expect(invalidated()).toEqual([true, true, true, true]);
    await unmount();
  });

  test("an earlier unresolved transaction blocks a new one as an error for this op, never as its pending result", async () => {
    const journal = createJournal(memoryStore());
    const page = await mount({ journal });
    // Recorded by an earlier visit for this pool and wallet; still unknown to the cluster.
    const earlier = getBase58Decoder().decode(new Uint8Array(64).fill(9));
    await act(async () => {
      journal.persistSigned({
        signature: earlier,
        lastValidBlockHeight: "100000",
        op: "redeem",
        createdAt: Date.now() - 1_000,
        pool: page.config.poolAddress,
        payer: page.signer.address as Address,
        signedBase64: "AAAA",
      });
      journal.setStatus(earlier, "sent");
    });
    statusesDown = false;
    await page.deposit("10");
    await page.until(() => page.toast()?.getAttribute("data-tone") === "error", "error toast");
    expect(page.q('[data-testid="toast-message"]')!.textContent).toBe(en.app.tx.errors.uncertain);
    expect(rpcServer.count("sendTransaction")).toBe(0);
    // The earlier one confirms: this op's toast does not turn into "Deposit confirmed".
    state.statuses.set(earlier, { err: null, confirmationStatus: "confirmed", slot: 5 });
    await page.until(() => journal.get(earlier)?.status === "confirmed", "earlier confirmed");
    await act(async () => sleep(20));
    expect(page.toast()?.getAttribute("data-tone")).toBe("error");
    expect(page.toastText()).not.toContain(en.app.toast.done.replace("{op}", "Deposit"));
    await unmount();
  });
});
