import "./support/dom";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ELOTE_POOL_PROGRAM_ADDRESS, getPoolEncoder } from "@elote/pool-client";
import { AccountState, TOKEN_PROGRAM_ADDRESS, getMintEncoder, getTokenEncoder } from "@solana-program/token";
import { generateKeyPairSigner, getBase64Decoder, none, some, type Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { balancesQueryKey, formatSol, readBalances } from "../src/app/balances";
import { AirdropButton, SOLANA_FAUCET_URL, requestSol } from "../src/app/components/AirdropButton";
import { FaucetButton, requestTestTokens } from "../src/app/components/FaucetButton";
import type { AppConfig, PoolAccounts } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { InvestPage, sharesValue } from "../src/app/pages/Invest";
import { ToastProvider } from "../src/app/toast/Toast";
import { ataOf } from "../src/tx/ops";
import { createRpc } from "../src/tx/rpc";
import { RpcProvider } from "../src/tx/RpcProvider";
import { translations } from "../src/translations";
import { WalletContext, type WalletState } from "../src/wallet/useWallet";
import { RPC_URL, RpcErrorReply, startRpc, testPool } from "./support/rpc";

const UNIT = 1_000_000n;
const API = "http://api.test";
const en = translations.en;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (bytes: Uint8Array) => getBase64Decoder().decode(bytes);

const rpcServer = startRpc();
afterAll(() => rpcServer.close());
beforeEach(() => rpcServer.reset());

type RpcAccount = { data: [string, "base64"]; executable: boolean; lamports: number; owner: Address; rentEpoch: number; space: number };
const rpcAccount = (bytes: Uint8Array, owner: Address, lamports = 2_039_280): RpcAccount => ({
  data: [b64(bytes), "base64"],
  executable: false,
  lamports,
  owner,
  rentEpoch: 0,
  space: bytes.length,
});

function tokenAccount(mint: Address, owner: Address, amount: bigint) {
  return new Uint8Array(
    getTokenEncoder().encode({
      mint,
      owner,
      amount,
      delegate: none(),
      state: AccountState.Initialized,
      isNative: none(),
      delegatedAmount: 0n,
      closeAuthority: none(),
    }),
  );
}

type Fixture = { config: AppConfig; accounts: PoolAccounts; owner: Address; chain: Map<string, RpcAccount | null> };

async function fixture(opts: { lamports?: bigint; asset?: bigint; shares?: bigint | null } = {}): Promise<Fixture> {
  const { config: base, accounts } = await testPool();
  const owner = (await generateKeyPairSigner()).address;
  const config: AppConfig = { rpcUrl: RPC_URL, poolAddress: base.poolAddress, assetMint: base.assetMint, apiUrl: API, explorerCluster: "devnet", testWallet: false };
  const chain = new Map<string, RpcAccount | null>();
  chain.set(
    accounts.pool,
    rpcAccount(
      new Uint8Array(
        getPoolEncoder().encode({
          version: 1,
          admin: owner,
          assetMint: base.assetMint,
          vault: accounts.vault,
          shareMint: accounts.shareMint,
          deadShares: accounts.deadShares,
          outstandingPrincipal: 6_000n * UNIT,
          interestCollected: 0n,
          writtenOff: 0n,
          lineCount: 0n,
          paused: false,
          reserved: new Uint8Array(32),
          bump: 255,
        }),
      ),
      ELOTE_POOL_PROGRAM_ADDRESS,
    ),
  );
  chain.set(accounts.vault, rpcAccount(tokenAccount(base.assetMint, accounts.pool, 10_000n * UNIT), TOKEN_PROGRAM_ADDRESS));
  chain.set(
    accounts.shareMint,
    rpcAccount(
      new Uint8Array(getMintEncoder().encode({ mintAuthority: some(accounts.pool), supply: 15_000n * UNIT, decimals: 6, isInitialized: true, freezeAuthority: none() })),
      TOKEN_PROGRAM_ADDRESS,
    ),
  );
  chain.set(owner, { data: ["", "base64"], executable: false, lamports: Number(opts.lamports ?? 2_000_000_000n), owner: "11111111111111111111111111111111" as Address, rentEpoch: 0, space: 0 });
  chain.set(await ataOf(owner, base.assetMint), rpcAccount(tokenAccount(base.assetMint, owner, opts.asset ?? 500n * UNIT), TOKEN_PROGRAM_ADDRESS));
  if (opts.shares !== null) {
    chain.set(await ataOf(owner, accounts.shareMint), rpcAccount(tokenAccount(accounts.shareMint, owner, opts.shares ?? 300n * UNIT), TOKEN_PROGRAM_ADDRESS));
  }
  return { config, accounts, owner, chain };
}

function serve(f: Fixture) {
  rpcServer.use({
    getMultipleAccounts: (params) => ({ context: { slot: 77 }, value: (params[0] as string[]).map((a) => f.chain.get(a) ?? null) }),
  });
}

function wallet(address: Address | null, status: WalletState["status"] = address ? "connected" : "absent"): WalletState {
  return { status, account: null, address, signer: null, connect: async () => undefined, disconnect: async () => undefined, wallets: [], chain: "solana:devnet" };
}

let mounted: { root: Root; host: HTMLElement; client: QueryClient } | null = null;
afterEach(async () => {
  if (!mounted) return;
  await act(async () => mounted!.root.unmount());
  mounted.host.remove();
  mounted.client.clear();
  mounted = null;
});

async function mount(config: AppConfig, w: WalletState, node: ReactNode, entry = "/invest") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfigContext.Provider value={config}>
        <QueryClientProvider client={client}>
          <RpcProvider url={RPC_URL}>
            <WalletContext.Provider value={w}>
              <MemoryRouter initialEntries={[entry]}>
                <ToastProvider t={en}>{node}</ToastProvider>
              </MemoryRouter>
            </WalletContext.Provider>
          </RpcProvider>
        </QueryClientProvider>
      </ConfigContext.Provider>,
    );
  });
  mounted = { root, host, client };
  const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
  return {
    host,
    client,
    q,
    text: () => host.textContent ?? "",
    async until(check: () => boolean, label: string) {
      for (let i = 0; i < 300; i++) {
        if (check()) return;
        await act(async () => sleep(5));
      }
      throw new Error(`timed out waiting for ${label}: ${host.textContent}`);
    },
  };
}

// ---- balances ----

describe("readBalances", () => {
  test("one request for the owner, the test token account and the share account; a missing account is 0", async () => {
    const f = await fixture({ shares: null, lamports: 1_500_000_000n, asset: 42n * UNIT });
    serve(f);
    const balances = await readBalances(createRpc(RPC_URL), { owner: f.owner, assetMint: f.config.assetMint, shareMint: f.accounts.shareMint });
    expect(rpcServer.calls.length).toBe(1);
    expect(rpcServer.count("getMultipleAccounts")).toBe(1);
    expect(rpcServer.calls[0]!.params[0]).toEqual([
      f.owner,
      await ataOf(f.owner, f.config.assetMint),
      await ataOf(f.owner, f.accounts.shareMint),
    ]);
    expect(balances.lamports).toBe(1_500_000_000n);
    expect(balances.asset).toBe(42n * UNIT);
    expect(balances.shares).toBe(0n);
    expect(balances.slot).toBe(77n);
  });

  test("a wallet unknown to the cluster has zero everything", async () => {
    const f = await fixture();
    f.chain.clear();
    serve(f);
    const balances = await readBalances(createRpc(RPC_URL), { owner: f.owner, assetMint: f.config.assetMint, shareMint: f.accounts.shareMint });
    expect([balances.lamports, balances.asset, balances.shares]).toEqual([0n, 0n, 0n]);
  });

  test("query key and SOL formatting", () => {
    const owner = "BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM" as Address;
    expect(balancesQueryKey(owner)).toEqual(["balances", owner]);
    expect(formatSol(1_234_567_890n)).toBe("1.2345");
    expect(formatSol(5_000_000n)).toBe("0.005");
    expect(formatSol(0n)).toBe("0");
    expect(sharesValue(300n * UNIT, 1_066_666n)).toBe(319_999_800n);
  });
});

// ---- faucet ----

describe("test token faucet", () => {
  const reply = (status: number, body: unknown = {}) => {
    const seen: unknown[] = [];
    rpcServer.server.use(
      http.post(`${API}/api/faucet`, async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json(body as never, { status });
      }),
    );
    return seen;
  };

  test("200 gives the signature; the body carries the address", async () => {
    const owner = (await generateKeyPairSigner()).address;
    const seen = reply(200, { signature: "FaucetSig1" });
    expect(await requestTestTokens(API, owner)).toEqual({ kind: "sent", signature: "FaucetSig1" });
    expect(seen).toEqual([{ address: owner }]);
  });

  test("429 is the daily limit, 503 is unavailable, other statuses and network errors fail politely", async () => {
    const owner = (await generateKeyPairSigner()).address;
    reply(429, { error: "rate limited" });
    expect(await requestTestTokens(API, owner)).toEqual({ kind: "limited" });
    rpcServer.server.resetHandlers();
    reply(503);
    expect(await requestTestTokens(API, owner)).toEqual({ kind: "unavailable" });
    rpcServer.server.resetHandlers();
    reply(500);
    expect(await requestTestTokens(API, owner)).toEqual({ kind: "failed" });
    rpcServer.server.resetHandlers();
    reply(200, { nope: 1 });
    expect(await requestTestTokens(API, owner)).toEqual({ kind: "failed" });
    rpcServer.server.resetHandlers();
    rpcServer.server.use(http.post(`${API}/api/faucet`, () => HttpResponse.error()));
    expect(await requestTestTokens(API, owner)).toEqual({ kind: "failed" });
  });

  for (const [status, body, kind, copy] of [
    [200, { signature: "FaucetSig2" }, "sent", en.app.faucet.sent],
    [429, {}, "limited", en.app.faucet.limited],
    [503, {}, "unavailable", en.app.faucet.unavailable],
  ] as const) {
    test(`the button announces a ${status} reply`, async () => {
      const f = await fixture();
      serve(f);
      reply(status, body);
      const page = await mount(f.config, wallet(f.owner), <FaucetButton address={f.owner} t={en} />);
      expect(page.q('[data-testid="faucet-button"]')!.textContent).toBe("Get test tokens");
      await act(async () => page.q('[data-testid="faucet-button"]')!.click());
      await page.until(() => page.q('[data-testid="faucet-status"]')!.getAttribute("data-result") === kind, kind);
      const status_ = page.q('[data-testid="faucet-status"]')!;
      expect(status_.getAttribute("aria-live")).toBe("polite");
      expect(status_.textContent).toContain(copy);
      const link = status_.querySelector("a");
      if (kind === "sent") expect(link!.getAttribute("href")).toBe("https://explorer.solana.com/tx/FaucetSig2?cluster=devnet");
      else expect(link).toBeNull();
    });
  }
});

// ---- airdrop ----

describe("test SOL airdrop", () => {
  test("retries three times, then points to the Solana faucet", async () => {
    const f = await fixture();
    rpcServer.use({
      requestAirdrop: () => {
        throw new RpcErrorReply(429, "airdrop limit");
      },
    });
    const result = await requestSol(createRpc(RPC_URL), f.owner, { delayMs: 0 });
    expect(result).toEqual({ kind: "failed" });
    expect(rpcServer.count("requestAirdrop")).toBe(4);
    expect(rpcServer.calls[0]!.params.slice(0, 2)).toEqual([f.owner, 1_000_000_000]);
  });

  test("succeeds on a retry", async () => {
    const f = await fixture();
    rpcServer.use({
      requestAirdrop: (_params, call) => {
        if (call < 2) throw new RpcErrorReply(429, "airdrop limit");
        return "AirSig1";
      },
    });
    expect(await requestSol(createRpc(RPC_URL), f.owner, { delayMs: 0 })).toEqual({ kind: "sent", signature: "AirSig1" });
    expect(rpcServer.count("requestAirdrop")).toBe(3);
  });

  test("the button shows the Solana faucet link after the last failure", async () => {
    const f = await fixture();
    rpcServer.use({
      requestAirdrop: () => {
        throw new RpcErrorReply(429, "airdrop limit");
      },
    });
    const page = await mount(f.config, wallet(f.owner), <AirdropButton address={f.owner} t={en} retryDelayMs={0} />);
    await act(async () => page.q('[data-testid="airdrop-button"]')!.click());
    for (let i = 0; i < 200 && page.q('[data-testid="airdrop-status"]')!.getAttribute("data-result") !== "failed"; i++) {
      await act(async () => sleep(10));
    }
    const link = page.q('[data-testid="airdrop-status"] a')!;
    expect(link.getAttribute("href")).toBe(SOLANA_FAUCET_URL);
    expect(page.q('[data-testid="airdrop-status"]')!.textContent).toContain(en.app.faucet.solFailed);
  });
});

// ---- page ----

describe("invest page", () => {
  test("without a wallet: the connect prompt in place, no reads", async () => {
    const f = await fixture();
    serve(f);
    const page = await mount(f.config, wallet(null), <InvestPage />);
    expect(page.q('[data-testid="invest-connect"]')!.textContent).toContain(en.app.invest.connectTitle);
    expect(page.q('[data-testid="invest-connect"] button')!.textContent).toContain(en.app.header.connect);
    expect(page.q('[data-testid="deposit-form"]')).toBeNull();
    await act(async () => sleep(20));
    expect(rpcServer.calls.length).toBe(0);
  });

  test("wrong network: the prompt says so", async () => {
    const f = await fixture();
    const page = await mount(f.config, wallet(f.owner, "wrong-chain"), <InvestPage />);
    expect(page.text()).toContain(en.app.invest.wrongChainTitle);
    expect(page.text()).toContain(en.app.wallet.wrongChain);
  });

  test("connected: shares and their value, balances, both forms; no SOL warning above 0.01 SOL", async () => {
    const f = await fixture({ shares: 300n * UNIT, asset: 500n * UNIT, lamports: 2_000_000_000n });
    serve(f);
    const page = await mount(f.config, wallet(f.owner), <InvestPage />);
    await page.until(() => page.q('[data-testid="invest-summary"]') !== null && page.q('[data-testid="redeem-form"]') !== null, "summary and forms");
    const summary = page.q('[data-testid="invest-summary"]')!.textContent ?? "";
    expect(summary).toContain(en.app.invest.yourShares);
    expect(summary).toContain("300");
    // 300 shares at 1.066666 per share.
    expect(summary).toContain("319.99");
    expect(summary).toContain("500");
    expect(summary).toContain("2");
    expect(page.q('[data-testid="sol-low"]')).toBeNull();
    expect(page.q('[data-testid="faucet-button"]')).not.toBeNull();
    expect(page.q('[data-testid="deposit-form"]')!.textContent).toContain("500");
    // Pool and balances: two requests, one each.
    expect(rpcServer.count("getMultipleAccounts")).toBe(2);
  });

  test("below 0.01 SOL: the warning and the test SOL button", async () => {
    const f = await fixture({ lamports: 5_000_000n });
    serve(f);
    const page = await mount(f.config, wallet(f.owner), <InvestPage />);
    await page.until(() => page.q('[data-testid="sol-low"]') !== null, "SOL warning");
    expect(page.q('[data-testid="sol-low"]')!.textContent).toContain(en.app.invest.solLow);
    expect(page.q('[data-testid="airdrop-button"]')!.textContent).toBe(en.app.faucet.sol);
  });

  test("a failed balance read shows an error with retry, never zeros", async () => {
    const f = await fixture();
    rpcServer.use({
      getMultipleAccounts: (params) => {
        const addresses = params[0] as string[];
        if (addresses[0] === f.owner) throw new RpcErrorReply(-32005, "node is behind");
        return { context: { slot: 77 }, value: addresses.map((a) => f.chain.get(a) ?? null) };
      },
    });
    const page = await mount(f.config, wallet(f.owner), <InvestPage />);
    await page.until(() => page.q('[data-testid="balances-failed"]') !== null, "balances error");
    expect(page.q('[data-testid="invest-summary"]')).toBeNull();
    expect(page.q('[data-testid="deposit-submit"]')?.hasAttribute("disabled")).toBe(true);
  });

  test("Spanish copy", async () => {
    const f = await fixture();
    serve(f);
    const page = await mount(f.config, wallet(null), <InvestPage />, "/invest?lang=es");
    expect(page.text()).toContain(translations.es.app.invest.connectTitle);
    expect(page.text()).toContain(translations.es.app.invest.title);
  });
});
