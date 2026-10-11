import "./support/dom";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
  ELOTE_POOL_PROGRAM_ADDRESS,
  LineStatus,
  findLinePda,
  getCreditLineEncoder,
  getPoolEncoder,
  type CreditLineArgs,
} from "@elote/pool-client";
import { AccountState, TOKEN_PROGRAM_ADDRESS, getMintEncoder, getTokenEncoder } from "@solana-program/token";
import { generateKeyPairSigner, getBase64Decoder, none, some, type Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import type { AppConfig, PoolAccounts } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { dataState } from "../src/app/dataState";
import { PoolPage } from "../src/app/pages/Pool";
import { createQueryClient } from "../src/app/providers";
import { ACCOUNTS_PER_REQUEST, PoolAccountsMissingError, linesQueryKey, poolQueryKey, readLines, readPool, type PoolView } from "../src/app/queries";
import { formatAmount, formatPerShare } from "../src/pool/format";
import { nav, perShare } from "../src/pool/math";
import { createRpc } from "../src/tx/rpc";
import { RpcProvider } from "../src/tx/RpcProvider";
import { translations } from "../src/translations";
import { RPC_URL, RpcErrorReply, startRpc, testPool } from "./support/rpc";

const UNIT = 1_000_000n;
const VAULT = 10_000n * UNIT;
const OUTSTANDING = 6_000n * UNIT;
const SUPPLY = 15_000n * UNIT;
const INTEREST = 720n * UNIT;
const WRITTEN_OFF = 0n;
// Byte offset of `status` in a CreditLine with sponsor = None (see tests/line.test.ts).
const STATUS_OFFSET_NO_SPONSOR = 156;

const rpcServer = startRpc();
afterAll(() => rpcServer.close());
beforeEach(() => rpcServer.reset());

const b64 = (bytes: Uint8Array | ArrayLike<number>) => getBase64Decoder().decode(Uint8Array.from(bytes as ArrayLike<number>));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rpcAccount(bytes: Uint8Array, owner: Address) {
  return { data: [b64(bytes), "base64"], executable: false, lamports: 1_000_000, owner, rentEpoch: 0, space: bytes.length };
}

type Fixture = {
  config: AppConfig;
  accounts: PoolAccounts;
  /** Account data by address, as the stub node serves it. */
  chain: Map<string, ReturnType<typeof rpcAccount>>;
  borrower: Address;
  sponsor: Address;
};

async function fixture(opts: { lineCount?: number; paused?: boolean; assetMint?: Address; supply?: bigint } = {}): Promise<Fixture> {
  const { config: base, accounts } = await testPool();
  const admin = (await generateKeyPairSigner()).address;
  const borrower = (await generateKeyPairSigner()).address;
  const sponsor = (await generateKeyPairSigner()).address;
  const config: AppConfig = {
    rpcUrl: RPC_URL,
    poolAddress: base.poolAddress,
    assetMint: base.assetMint,
    apiUrl: "http://api.test",
    explorerCluster: "devnet",
    testWallet: false,
  };
  const chain = new Map<string, ReturnType<typeof rpcAccount>>();
  const poolBytes = getPoolEncoder().encode({
    version: 1,
    admin,
    assetMint: opts.assetMint ?? base.assetMint,
    vault: accounts.vault,
    shareMint: accounts.shareMint,
    deadShares: accounts.deadShares,
    outstandingPrincipal: OUTSTANDING,
    interestCollected: INTEREST,
    writtenOff: WRITTEN_OFF,
    lineCount: BigInt(opts.lineCount ?? 4),
    paused: opts.paused ?? false,
    reserved: new Uint8Array(32),
    bump: 255,
  });
  chain.set(accounts.pool, rpcAccount(new Uint8Array(poolBytes), ELOTE_POOL_PROGRAM_ADDRESS));
  const vaultBytes = getTokenEncoder().encode({
    mint: base.assetMint,
    owner: accounts.pool,
    amount: VAULT,
    delegate: none(),
    state: AccountState.Initialized,
    isNative: none(),
    delegatedAmount: 0n,
    closeAuthority: none(),
  });
  chain.set(accounts.vault, rpcAccount(new Uint8Array(vaultBytes), TOKEN_PROGRAM_ADDRESS));
  const mintBytes = getMintEncoder().encode({
    mintAuthority: some(accounts.pool),
    supply: opts.supply ?? SUPPLY,
    decimals: 6,
    isInitialized: true,
    freezeAuthority: none(),
  });
  chain.set(accounts.shareMint, rpcAccount(new Uint8Array(mintBytes), TOKEN_PROGRAM_ADDRESS));

  const line = (lineId: bigint, overrides: Partial<CreditLineArgs>, statusByte?: number) => {
    const bytes = new Uint8Array(
      getCreditLineEncoder().encode({
        version: 1,
        pool: accounts.pool,
        lineId,
        borrower,
        sponsor: none(),
        agreementHash: new Uint8Array(32).fill(7),
        principal: 3_000n * UNIT,
        rateBps: 1_200,
        interestDue: 360n * UNIT,
        termEnd: 1_800_000_000n,
        principalRepaid: 0n,
        interestRepaid: 0n,
        status: LineStatus.Approved,
        openedAt: 1_700_000_000n,
        drawnAt: 0n,
        closedAt: 0n,
        reserved: new Uint8Array(32),
        bump: 254,
        ...overrides,
      }),
    );
    if (statusByte !== undefined) bytes[STATUS_OFFSET_NO_SPONSOR] = statusByte;
    return bytes;
  };
  const lines = [
    // 0: approved v1, with a sponsor
    line(0n, { sponsor: some(sponsor) }),
    // 1: active v1, partly repaid
    line(1n, { status: LineStatus.Active, drawnAt: 1_700_000_100n, principalRepaid: 1_000n * UNIT, interestRepaid: 120n * UNIT }),
    // 2: version 2 in collection (status byte 4, which the generated decoder cannot read)
    line(2n, { version: 2, status: LineStatus.Active, drawnAt: 1_700_000_100n }, 4),
    // 3: a status byte nobody knows yet
    line(3n, { status: LineStatus.Active, drawnAt: 1_700_000_100n }, 9),
  ];
  for (let i = 0; i < Math.min(lines.length, opts.lineCount ?? 4); i++) {
    const [pda] = await findLinePda({ pool: accounts.pool, lineId: BigInt(i) });
    chain.set(pda, rpcAccount(lines[i]!, ELOTE_POOL_PROGRAM_ADDRESS));
  }
  return { config, accounts, chain, borrower, sponsor };
}

const ctx = (value: unknown) => ({ context: { slot: 321 }, value });

function serve(f: Fixture, opts: { delayMs?: number; fail?: () => boolean } = {}) {
  rpcServer.use({
    getMultipleAccounts: async (params) => {
      if (opts.delayMs) await sleep(opts.delayMs);
      if (opts.fail?.()) throw new RpcErrorReply(-32005, "node is behind");
      const addresses = params[0] as string[];
      expect((params[1] as { encoding: string }).encoding).toBe("base64");
      return ctx(addresses.map((a) => f.chain.get(a) ?? null));
    },
  });
}

describe("readPool", () => {
  test("one request for pool, vault and share token; derived figures match pool/math", async () => {
    const f = await fixture();
    serve(f);
    const result = await readPool(createRpc(RPC_URL), f.config);
    expect(rpcServer.count("getMultipleAccounts")).toBe(1);
    expect(rpcServer.calls.length).toBe(1);
    expect(rpcServer.calls[0]!.params[0]).toEqual([f.accounts.pool, f.accounts.vault, f.accounts.shareMint]);
    if (result.kind !== "ok") throw new Error(`expected ok, got ${result.reason}`);
    const pool: PoolView = result.pool;
    expect(pool.vaultAmount).toBe(VAULT);
    expect(pool.supply).toBe(SUPPLY);
    expect(pool.outstandingPrincipal).toBe(OUTSTANDING);
    expect(pool.nav).toBe(nav(VAULT, OUTSTANDING));
    expect(pool.nav).toBe(VAULT + OUTSTANDING);
    expect(pool.perShare).toBe(perShare(VAULT + OUTSTANDING, SUPPLY));
    expect(pool.perShare).toBe(1_066_666n);
    expect(pool.interestCollected).toBe(INTEREST);
    expect(pool.writtenOff).toBe(WRITTEN_OFF);
    expect(pool.lineCount).toBe(4n);
    expect(pool.paused).toBe(false);
    expect(pool.slot).toBe(321n);
    expect(pool.assetMint).toBe(f.config.assetMint);
  });

  test("a pool holding another test token is a configuration mismatch", async () => {
    const f = await fixture({ assetMint: (await generateKeyPairSigner()).address });
    serve(f);
    expect(await readPool(createRpc(RPC_URL), f.config)).toEqual({ kind: "mismatch", reason: "assetMismatch" });
  });

  test("a missing pool account, or one this program does not own, is a mismatch", async () => {
    const f = await fixture();
    const poolAccount = f.chain.get(f.accounts.pool)!;
    f.chain.delete(f.accounts.pool);
    serve(f);
    expect(await readPool(createRpc(RPC_URL), f.config)).toEqual({ kind: "mismatch", reason: "poolMissing" });
    f.chain.set(f.accounts.pool, { ...poolAccount, owner: TOKEN_PROGRAM_ADDRESS });
    expect(await readPool(createRpc(RPC_URL), f.config)).toEqual({ kind: "mismatch", reason: "notAPool" });
  });

  test("a vault or share token not returned yet is a retryable error, not a mismatch", async () => {
    const f = await fixture();
    f.chain.delete(f.accounts.vault);
    serve(f);
    const error = await readPool(createRpc(RPC_URL), f.config).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PoolAccountsMissingError);
    expect((error as PoolAccountsMissingError).missing).toEqual(["vault"]);
    expect(rpcServer.count("getMultipleAccounts")).toBe(1);
  });

  test("a vault holding another token is a permanent accountsMismatch", async () => {
    const f = await fixture();
    const other = (await generateKeyPairSigner()).address;
    const vaultBytes = getTokenEncoder().encode({
      mint: other,
      owner: f.accounts.pool,
      amount: VAULT,
      delegate: none(),
      state: AccountState.Initialized,
      isNative: none(),
      delegatedAmount: 0n,
      closeAuthority: none(),
    });
    f.chain.set(f.accounts.vault, rpcAccount(new Uint8Array(vaultBytes), TOKEN_PROGRAM_ADDRESS));
    serve(f);
    expect(await readPool(createRpc(RPC_URL), f.config)).toEqual({ kind: "mismatch", reason: "accountsMismatch" });
    expect(rpcServer.count("getMultipleAccounts")).toBe(1);
  });

  test("query keys hash without bigint", () => {
    const pool = "BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM" as Address;
    expect(poolQueryKey(pool)).toEqual(["pool", pool]);
    expect(linesQueryKey(pool, 4n)).toEqual(["lines", pool, 4]);
    expect(() => JSON.stringify(linesQueryKey(pool, 4n))).not.toThrow();
  });
});

describe("readLines", () => {
  test("one request; every line decoded through the tolerant adapter", async () => {
    const f = await fixture();
    serve(f);
    const rows = await readLines(createRpc(RPC_URL), f.accounts.pool, 4n);
    expect(rpcServer.count("getMultipleAccounts")).toBe(1);
    expect(rows.map((r) => r.lineId)).toEqual([0n, 1n, 2n, 3n]);
    expect(rows.map((r) => r.view.status)).toEqual(["approved", "active", "inCollection", "unknown"]);
    const [approved, active] = rows.map((r) => r.view);
    if (!approved?.readable || !active?.readable) throw new Error("expected readable lines");
    expect(approved.sponsor).toBe(f.sponsor);
    expect(active.principalRepaid).toBe(1_000n * UNIT);
    expect(rows[3]!.view.readable).toBe(true);
  });

  test("a missing line account still gets a row, as unknown", async () => {
    const f = await fixture();
    serve(f);
    const rows = await readLines(createRpc(RPC_URL), f.accounts.pool, 5n);
    expect(rows).toHaveLength(5);
    expect(rows[4]).toMatchObject({ lineId: 4n, view: { readable: false, status: "unknown" } });
  });

  test("no lines, no request", async () => {
    const f = await fixture({ lineCount: 0 });
    serve(f);
    expect(await readLines(createRpc(RPC_URL), f.accounts.pool, 0n)).toEqual([]);
    expect(rpcServer.calls.length).toBe(0);
  });

  test("more than 100 lines go in chunks of 100", async () => {
    const f = await fixture();
    serve(f);
    const rows = await readLines(createRpc(RPC_URL), f.accounts.pool, 150n);
    expect(rows).toHaveLength(150);
    expect(rpcServer.count("getMultipleAccounts")).toBe(2);
    expect((rpcServer.calls[0]!.params[0] as string[]).length).toBe(ACCOUNTS_PER_REQUEST);
    expect((rpcServer.calls[1]!.params[0] as string[]).length).toBe(50);
  });
});

describe("dataState", () => {
  test("a failed read is never shown as empty", () => {
    expect(dataState({ isPending: true, isError: false, data: undefined })).toBe("loading");
    expect(dataState({ isPending: false, isError: false, data: [] })).toBe("ready");
    expect(dataState({ isPending: false, isError: true, data: [] })).toBe("stale");
    expect(dataState({ isPending: false, isError: true, data: undefined })).toBe("unavailable");
  });
});

// ---- page ---------------------------------------------------------------------------------

async function mountPage(f: Fixture, opts: { client?: QueryClient; lang?: "en" | "es" } = {}) {
  const client = opts.client ?? new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfigContext.Provider value={f.config}>
        <QueryClientProvider client={client}>
          <RpcProvider url={RPC_URL}>
            <MemoryRouter initialEntries={[opts.lang === "es" ? "/pool?lang=es" : "/pool"]}>
              <PoolPage />
            </MemoryRouter>
          </RpcProvider>
        </QueryClientProvider>
      </ConfigContext.Provider>,
    );
  });
  return {
    host,
    text: () => host.textContent ?? "",
    async until(check: () => boolean, label: string) {
      for (let i = 0; i < 200; i++) {
        if (check()) return;
        await act(async () => sleep(5));
      }
      throw new Error(`timed out waiting for ${label}: ${host.textContent}`);
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
      client.clear();
    },
  };
}

const en = translations.en.app.pool;

describe("pool page", () => {
  test("skeleton first, then the figures and one row per line", async () => {
    const f = await fixture();
    serve(f, { delayMs: 30 });
    const page = await mountPage(f);
    expect(page.host.querySelector('[data-testid="pool-loading"]')).not.toBeNull();
    expect(page.host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(page.host.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);

    await page.until(() => page.host.querySelectorAll("tbody tr").length === 4, "line rows");
    const stats = page.host.querySelector('[data-testid="pool-stats"]')!.textContent ?? "";
    expect(stats).toContain(formatPerShare(perShare(VAULT + OUTSTANDING, SUPPLY)));
    expect(stats).toContain("1.066");
    expect(stats).toContain(formatAmount(VAULT + OUTSTANDING)); // NAV 16,000
    expect(stats).toContain("16,000");
    expect(stats).toContain("10,000"); // liquidity
    expect(stats).toContain("6,000"); // principal lent out
    expect(stats).toContain("720"); // interest collected
    for (const label of [en.perShare, en.nav, en.liquidity, en.outstanding, en.interestCollected, en.losses, en.lines]) {
      expect(stats).toContain(label);
    }
    expect(page.host.querySelector('[data-testid="pool-paused"]')).toBeNull();
    expect(page.host.querySelector("[data-skeleton]")).toBeNull();

    const statuses = [...page.host.querySelectorAll("tbody [data-status]")].map((n) => n.getAttribute("data-status"));
    expect(statuses).toEqual(["approved", "active", "inCollection", "unknown"]);
    const table = page.host.querySelector("table")!.textContent ?? "";
    for (const label of [en.status.approved, en.status.active, en.status.inCollection, en.status.unknown]) {
      expect(table).toContain(label);
    }
    expect(table).toContain(en.columns.sponsor);
    // Mobile cards carry the same rows.
    expect(page.host.querySelectorAll("li[data-line]").length).toBe(4);
    expect(page.host.querySelector("li[data-line] .sr-only")!.textContent).toBe(`${en.columns.status}:`);

    // Explorer links for the pool, borrowers and the sponsor, on the configured cluster.
    const hrefs = [...page.host.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`https://explorer.solana.com/address/${f.config.poolAddress}?cluster=devnet`);
    expect(hrefs).toContain(`https://explorer.solana.com/address/${f.borrower}?cluster=devnet`);
    expect(hrefs).toContain(`https://explorer.solana.com/address/${f.sponsor}?cluster=devnet`);

    // One request for the pool and one for the lines.
    expect(rpcServer.count("getMultipleAccounts")).toBe(2);
    expect(rpcServer.calls.length).toBe(2);
    await page.unmount();
  });

  test("a line with an unknown status renders Unknown and the page holds", async () => {
    const f = await fixture();
    serve(f);
    const page = await mountPage(f);
    await page.until(() => page.host.querySelectorAll("tbody tr").length === 4, "line rows");
    const row = page.host.querySelector('tr[data-line="3"]')!;
    expect(row.querySelector("[data-status]")!.getAttribute("data-status")).toBe("unknown");
    expect(row.textContent).toContain(en.status.unknown);
    expect(row.textContent).toContain("3,000"); // its figures still show
    expect(page.host.querySelector('[role="alert"]')).toBeNull();
    await page.unmount();
  });

  test("an unreadable line keeps its row", async () => {
    const f = await fixture();
    const [pda] = await findLinePda({ pool: f.accounts.pool, lineId: 1n });
    f.chain.set(pda, rpcAccount(new Uint8Array([1, 2, 3]), ELOTE_POOL_PROGRAM_ADDRESS));
    serve(f);
    const page = await mountPage(f);
    await page.until(() => page.host.querySelectorAll("tbody tr").length === 4, "line rows");
    const row = page.host.querySelector('tr[data-line="1"]')!;
    expect(row.querySelector("[data-status]")!.getAttribute("data-status")).toBe("unknown");
    expect(row.textContent).toContain(en.unreadable);
    await page.unmount();
  });

  test("no lines: the empty state with a link to how lines are opened, and no lines request", async () => {
    const f = await fixture({ lineCount: 0 });
    serve(f);
    const page = await mountPage(f);
    await page.until(() => page.text().includes(en.empty.title), "empty state");
    expect(en.empty.title).toBe("No credit lines yet");
    const link = [...page.host.querySelectorAll("a")].find((a) => a.textContent === en.empty.link);
    expect(link?.getAttribute("href")).toBe("/#agreement-title");
    expect(page.host.querySelector("table")).toBeNull();
    expect(rpcServer.count("getMultipleAccounts")).toBe(1);
    await page.unmount();
  });

  test("Spanish copy and the Spanish landing link", async () => {
    const f = await fixture({ lineCount: 0 });
    serve(f);
    const page = await mountPage(f, { lang: "es" });
    await page.until(() => page.text().includes(translations.es.app.pool.empty.title), "empty state");
    const link = [...page.host.querySelectorAll("a")].find((a) => a.textContent === translations.es.app.pool.empty.link);
    expect(link?.getAttribute("href")).toBe("/?lang=es#agreement-title");
    await page.unmount();
  });

  test("a paused pool shows the banner", async () => {
    const f = await fixture({ paused: true, lineCount: 0 });
    serve(f);
    const page = await mountPage(f);
    await page.until(() => page.host.querySelector('[data-testid="pool-paused"]') !== null, "paused banner");
    expect(page.text()).toContain(en.paused);
    await page.unmount();
  });

  test("no shares yet: the per-share figure says so instead of a number", async () => {
    const f = await fixture({ supply: 0n, lineCount: 0 });
    serve(f);
    const page = await mountPage(f);
    await page.until(() => page.text().includes(en.noShares), "no shares");
    await page.unmount();
  });

  test("config mismatch: an error, no figures, no retries even with the app's retry policy", async () => {
    const f = await fixture({ assetMint: (await generateKeyPairSigner()).address });
    serve(f);
    const page = await mountPage(f, { client: createQueryClient() });
    await page.until(() => page.host.querySelector('[data-testid="pool-mismatch"]') !== null, "mismatch");
    expect(page.host.querySelector('[data-testid="pool-mismatch"]')!.getAttribute("role")).toBe("alert");
    expect(page.text()).toContain(en.mismatch.title);
    expect(page.host.querySelector('[data-testid="pool-stats"]')).toBeNull();
    await act(async () => sleep(50));
    expect(rpcServer.count("getMultipleAccounts")).toBe(1);
    await page.unmount();
  });

  test("a missing share token shows the retry error, then recovers once the node returns it", async () => {
    const f = await fixture({ lineCount: 0 });
    const mint = f.chain.get(f.accounts.shareMint)!;
    f.chain.delete(f.accounts.shareMint);
    serve(f);
    const page = await mountPage(f);
    await page.until(() => page.text().includes(en.loadFailed), "error state");
    expect(page.host.querySelector('[data-testid="pool-mismatch"]')).toBeNull();
    f.chain.set(f.accounts.shareMint, mint);
    const retry = [...page.host.querySelectorAll("button")].find((b) => b.textContent === en.retry)!;
    await act(async () => retry.click());
    await page.until(() => page.text().includes(en.empty.title), "recovered");
    await page.unmount();
  });

  test("amounts under 0.01 keep their full value in the title and for screen readers", async () => {
    const f = await fixture({ lineCount: 0 });
    const poolBytes = new Uint8Array(Buffer.from(f.chain.get(f.accounts.pool)!.data[0] as string, "base64"));
    // interestCollected sits after discriminator, version and five addresses, then outstandingPrincipal.
    new DataView(poolBytes.buffer).setBigUint64(8 + 1 + 32 * 5 + 8, 4_000n, true);
    f.chain.set(f.accounts.pool, rpcAccount(poolBytes, ELOTE_POOL_PROGRAM_ADDRESS));
    serve(f);
    const page = await mountPage(f);
    await page.until(() => page.host.querySelector('[data-testid="pool-stats"]') !== null, "stats");
    const full = page.host.querySelector('[data-full="0.004"]');
    expect(full).not.toBeNull();
    expect(full!.getAttribute("title")).toBe("0.004");
    expect(full!.querySelector('[aria-hidden="true"]')!.textContent).toBe("0");
    expect(full!.querySelector(".sr-only")!.textContent).toBe("0.004");
    await page.unmount();
  });

  test("a failed read shows an error with retry, and retry recovers", async () => {
    const f = await fixture({ lineCount: 0 });
    let failing = true;
    serve(f, { fail: () => failing });
    const page = await mountPage(f);
    await page.until(() => page.text().includes(en.loadFailed), "error state");
    expect(page.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(page.text()).not.toContain(en.empty.title);
    failing = false;
    const retry = [...page.host.querySelectorAll("button")].find((b) => b.textContent === en.retry)!;
    await act(async () => retry.click());
    await page.until(() => page.text().includes(en.empty.title), "recovered");
    await page.unmount();
  });
});
