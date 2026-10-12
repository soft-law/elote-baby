// App shell: the index redirect, the header controls, the section tabs with live sub-lines and the
// one-line footer.
import "./support/dom";
import { afterEach, describe, expect, test } from "bun:test";
import type { Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { balancesQueryKey } from "../src/app/balances";
import { AppFooter, AppHeader } from "../src/app/chrome/AppChrome";
import type { AppConfig } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { linesQueryKey, poolQueryKey } from "../src/app/queries";
import { IndexRedirect } from "../src/app/routes";
import { SectionNav } from "../src/app/Shell";
import { translations } from "../src/translations";
import { RpcProvider } from "../src/tx/RpcProvider";
import { WalletContext, type WalletState } from "../src/wallet/useWallet";

const POOL = "5bndQsto8p3rXEcG2Crz2zRSk2KN2fKwBsk5S2k2ndET" as Address;
const MINT = "5RyA7YFdhqHz4CLSAyep2w3fJMFvjg4i3s2UmgRUrmYb" as Address;
const ME = "4mPaQ6xjXx1nG9n4Lz8QjXq7VsH2cT3bKkYwR5dLz8Qa" as Address;
const OTHER = "Hs3kQ6xjXx1nG9n4Lz8QjXq7VsH2cT3bKkYwR5d9pTdA" as Address;
const config: AppConfig = {
  rpcUrl: "http://rpc.invalid",
  poolAddress: POOL,
  assetMint: MINT,
  apiUrl: "http://api.invalid",
  explorerCluster: "devnet",
  testWallet: false,
};

let mounted: { root: Root; host: HTMLElement } | null = null;
afterEach(async () => {
  if (!mounted) return;
  const { root, host } = mounted;
  mounted = null;
  await act(async () => root.unmount());
  host.remove();
});

async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  mounted = { root, host };
  return host;
}

function wallet(address: Address | null): WalletState {
  return {
    status: address ? "connected" : "absent",
    account: null,
    address,
    signer: null,
    connect: async () => undefined,
    disconnect: async () => undefined,
    wallets: [],
    chain: "solana:devnet",
  } as unknown as WalletState;
}

/** Reads already in the cache, never refetched: the tabs render from them with no RPC. */
function seeded(opts: { lineCount?: bigint; shares?: bigint; lines?: Array<{ borrower: Address; status: string }> }) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, refetchInterval: false } } });
  if (opts.lineCount !== undefined) {
    client.setQueryData(poolQueryKey(POOL), { kind: "ok", pool: { lineCount: opts.lineCount } });
    client.setQueryData(
      linesQueryKey(POOL, opts.lineCount),
      (opts.lines ?? []).map((l, i) => ({ lineId: BigInt(i), address: POOL, view: { readable: true, ...l } })),
    );
  }
  if (opts.shares !== undefined) client.setQueryData(balancesQueryKey(ME), { owner: ME, shares: opts.shares, asset: 0n, lamports: 0n });
  return client;
}

function Nav({ client, address, path, placement = "top" }: { client: QueryClient; address: Address | null; path: string; placement?: "top" | "bottom" }) {
  return (
    <ConfigContext.Provider value={config}>
      <QueryClientProvider client={client}>
        <RpcProvider url={config.rpcUrl}>
          <WalletContext.Provider value={wallet(address)}>
            <MemoryRouter initialEntries={[path]}>
              <SectionNav placement={placement} />
            </MemoryRouter>
          </WalletContext.Provider>
        </RpcProvider>
      </QueryClientProvider>
    </ConfigContext.Provider>
  );
}

const subs = (host: HTMLElement) => [...host.querySelectorAll("a small")].map((s) => s.textContent);

describe("index route", () => {
  test("/ goes to the pool and keeps ?lang", async () => {
    function Where() {
      const l = useLocation();
      return <p data-testid="where">{l.pathname + l.search}</p>;
    }
    const host = await mount(
      <MemoryRouter initialEntries={["/?lang=es"]}>
        <Routes>
          <Route index element={<IndexRedirect />} />
          <Route path="pool" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(host.querySelector('[data-testid="where"]')!.textContent).toBe("/pool?lang=es");
  });
});

describe("section tabs", () => {
  test("route links, the current one marked, in the active language", async () => {
    const host = await mount(<Nav client={seeded({ lineCount: 3n })} address={null} path="/invest?lang=es" />);
    const links = [...host.querySelectorAll("a")];
    expect(links.map((a) => a.childNodes[0]!.textContent)).toEqual(["Pool", "Invertir", "Pedir crédito"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/pool?lang=es", "/invest?lang=es", "/borrow?lang=es"]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
    expect(host.querySelector("nav")!.getAttribute("aria-label")).toBe("Secciones");
  });

  test("not connected: the pool line count only; no placeholder figures", async () => {
    const host = await mount(<Nav client={seeded({ lineCount: 3n })} address={null} path="/pool" />);
    expect(subs(host)).toEqual(["3 lines", "", ""]);
  });

  test("loading: every sub-line is empty", async () => {
    const host = await mount(<Nav client={seeded({})} address={ME} path="/pool" />);
    expect(subs(host)).toEqual(["", "", ""]);
  });

  test("connected: shares from the balances read and lines to repay from the wallet's own lines", async () => {
    const lines = [
      { borrower: ME, status: "active" },
      { borrower: ME, status: "inCollection" },
      { borrower: ME, status: "approved" },
      { borrower: ME, status: "repaid" },
      { borrower: OTHER, status: "active" },
    ];
    const host = await mount(<Nav client={seeded({ lineCount: 1n, shares: 1_500_000_000n, lines })} address={ME} path="/pool" />);
    expect(subs(host)).toEqual(["1 line", "1,500 shares", "2 to repay"]);
  });

  test("bottom bar: a long Spanish sub-line shows the figure and keeps the words for screen readers", async () => {
    const client = seeded({ lineCount: 2n, shares: 12_345_670_000n, lines: [] });
    const host = await mount(<Nav client={client} address={ME} path="/pool?lang=es" placement="bottom" />);
    const invest = host.querySelectorAll("a small")[1]!;
    expect(invest.querySelector('[aria-hidden="true"]')!.textContent).toBe("12,345.67");
    expect(invest.querySelector(".sr-only")!.textContent).toBe("12,345.67 participaciones");
    expect(subs(host)[2]).toBe("0 por pagar");
  });
});

describe("header and footer", () => {
  test("devnet badge, language switch with aria-pressed and full names, and the actions slot", async () => {
    let lang = "en" as "en" | "es";
    const host = await mount(
      <AppHeader t={translations.en} lang="en" setLang={(l) => (lang = l)} actions={<button type="button">wallet</button>} />,
    );
    expect(host.querySelector(".app-badge")!.textContent).toBe("Devnet");
    const group = host.querySelector('[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe(translations.en.nav.language);
    const [en, es] = [...group.querySelectorAll("button")];
    expect(en!.getAttribute("aria-pressed")).toBe("true");
    expect(es!.getAttribute("aria-pressed")).toBe("false");
    expect(es!.querySelector(".sr-only")!.textContent).toBe(translations.es.nav.languageName);
    expect(host.querySelector("a")!.getAttribute("aria-label")).toBe(translations.en.app.nav.backToSite);
    await act(async () => es!.click());
    expect(lang as string).toBe("es");
    expect(host.textContent).toContain("wallet");
  });

  test("footer: the company and the two legal links", async () => {
    const host = await mount(<AppFooter t={translations.es} />);
    expect(host.textContent).toContain("Softlaw SA de CV");
    expect([...host.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Términos", "Privacidad"]);
  });
});
