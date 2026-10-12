// The header wallet control when a connection fails: a wallet that shares no account, another
// error with the wallet's own words, Brave's built-in wallet hiding extension wallets, and a
// mainnet-only account.
import "./support/dom";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import type { Address } from "@solana/kit";
import type { UiWallet, UiWalletAccount } from "@wallet-standard/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { translations } from "../src/translations";
import { ConnectButton } from "../src/wallet/ConnectButton";
import { WalletContext, WalletNoAccountError, walletErrorDetail, type WalletState } from "../src/wallet/useWallet";

const en = translations.en;
const es = translations.es;
const ADDRESS = "BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM" as Address;

const phantom = { name: "Phantom", icon: "data:image/svg+xml;base64,PHN2Zy8+", chains: ["solana:devnet"], features: ["solana:signTransaction"], accounts: [] } as unknown as UiWallet;

function state(over: Partial<WalletState> = {}): WalletState {
  return {
    status: "absent",
    account: null,
    address: null,
    signer: null,
    connect: async () => undefined,
    disconnect: async () => undefined,
    wallets: [phantom],
    chain: "solana:devnet",
    ...over,
  };
}

let mounted: { root: Root; host: HTMLElement } | null = null;
afterEach(async () => {
  delete (window as unknown as { braveSolana?: unknown }).braveSolana;
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = null;
  await act(async () => root.unmount());
  host.remove();
});

async function mount(wallet: WalletState, t = en) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <WalletContext.Provider value={wallet}>
        <ConnectButton t={t} />
      </WalletContext.Provider>,
    );
  });
  mounted = { root, host };
  const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
  const click = async (el: Element | null) => {
    if (!el) throw new Error("nothing to click");
    await act(async () => {
      (el as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 5));
    });
  };
  return {
    q,
    text: () => host.textContent ?? "",
    open: () => click(host.querySelector("button")),
    pick: (name: string) => click([...host.querySelectorAll("li button")].find((b) => b.textContent?.includes(name)) ?? null),
  };
}

describe("connect failures", () => {
  test("a wallet that shares no account gets the specific message", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const page = await mount(state({ connect: async () => Promise.reject(new WalletNoAccountError()) }));
    await page.open();
    await page.pick("Phantom");
    expect(page.q('[data-testid="wallet-connect-failed"]')!.textContent).toBe(
      "The wallet shared no Solana account. Open the wallet, pick a Solana account for Devnet and try again.",
    );
    expect(page.q('[data-testid="wallet-connect-failed"]')!.getAttribute("role")).toBe("alert");
    expect(page.text()).not.toContain(en.app.wallet.connectFailed);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test("another failure shows the generic line and the wallet's own message, logged with console.warn", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const error = new Error(`Unexpected error\n\tfrom the provider ${"x".repeat(300)}`);
    const page = await mount(state({ connect: async () => Promise.reject(error) }));
    await page.open();
    await page.pick("Phantom");
    const box = page.q('[data-testid="wallet-connect-failed"]')!;
    expect(box.textContent).toContain(en.app.wallet.connectFailed);
    const detail = page.q('[data-testid="wallet-error-detail"]')!.textContent!;
    expect(detail.startsWith("The wallet said: Unexpected error from the provider x")).toBe(true);
    expect(detail.length).toBe("The wallet said: ".length + 160);
    expect(warn).toHaveBeenCalledWith("Wallet connection failed", error);
    warn.mockRestore();
  });

  test("declining in the wallet is not a failure", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const page = await mount(state({ connect: async () => Promise.reject(Object.assign(new Error("User rejected the request."), { code: 4001 })) }));
    await page.open();
    await page.pick("Phantom");
    expect(page.q('[data-testid="wallet-connect-failed"]')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("the detail is one line, without control characters, at most 160 characters", () => {
    expect(walletErrorDetail(new Error("a\u0000b\n\nc"))).toBe("a b c");
    expect(walletErrorDetail({ message: "plain object" })).toBe("plain object");
    expect(walletErrorDetail(42)).toBeNull();
    expect(walletErrorDetail(new Error("   "))).toBeNull();
    expect(walletErrorDetail("y".repeat(400))!.length).toBe(160);
  });
});

describe("Brave hint", () => {
  test("shown when Brave's wallet is present and no wallet is listed", async () => {
    (window as unknown as { braveSolana?: unknown }).braveSolana = {};
    const page = await mount(state({ wallets: [] }));
    await page.open();
    expect(page.q('[data-testid="wallet-brave-hint"]')!.textContent).toBe(en.app.wallet.braveHint);
    expect(page.text()).toContain(en.app.wallet.none);
  });

  test("not shown without Brave's wallet", async () => {
    const page = await mount(state({ wallets: [] }));
    await page.open();
    expect(page.q('[data-testid="wallet-brave-hint"]')).toBeNull();
  });

  test("not shown when Phantom is listed", async () => {
    (window as unknown as { braveSolana?: unknown }).braveSolana = {};
    const page = await mount(state());
    await page.open();
    expect(page.q('[data-testid="wallet-brave-hint"]')).toBeNull();
  });

  test("Spanish copy", async () => {
    (window as unknown as { braveSolana?: unknown }).braveSolana = {};
    const page = await mount(state({ wallets: [] }), es);
    await page.open();
    expect(page.q('[data-testid="wallet-brave-hint"]')!.textContent).toBe(es.app.wallet.braveHint);
  });
});

describe("mainnet-only account", () => {
  const account = (chains: string[]) => ({ address: ADDRESS, chains, features: [], publicKey: new Uint8Array(32) }) as unknown as UiWalletAccount;

  test("wrong chain, with the steps to switch the wallet", async () => {
    const page = await mount(state({ status: "wrong-chain", address: ADDRESS, account: account(["solana:mainnet"]) }));
    await page.open();
    expect(page.q('[role="alert"]')!.textContent).toBe(
      "This wallet is set to Solana Mainnet. Switch it to Devnet and connect again. In Phantom: Settings, Developer settings, Testnet mode.",
    );
  });

  test("another wrong chain keeps the general message", async () => {
    const page = await mount(state({ status: "wrong-chain", address: ADDRESS, account: account(["solana:testnet"]) }));
    await page.open();
    expect(page.q('[role="alert"]')!.textContent).toBe(en.app.wallet.wrongChain);
  });
});
