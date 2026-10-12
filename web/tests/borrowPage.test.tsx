import "./support/dom";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  ELOTE_POOL_PROGRAM_ADDRESS,
  LineStatus,
  findLinePda,
  getCreditLineEncoder,
  getLineDrawnEventEncoder,
  getPoolEncoder,
  type CreditLineArgs,
} from "@elote/pool-client";
import { AccountState, TOKEN_PROGRAM_ADDRESS, getMintEncoder, getTokenEncoder } from "@solana-program/token";
import { generateKeyPairSigner, getBase64Decoder, getBase64Encoder, none, some, type Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import type { AppConfig } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { BorrowPage } from "../src/app/pages/Borrow";
import { SYSVAR_CLOCK_ADDRESS } from "../src/app/queries";
import { derivePoolAccounts } from "../src/app/config";
import { decodeLineView } from "../src/pool/line";
import { repayFigures } from "../src/pool/schedule";
import { ToastProvider } from "../src/app/toast/Toast";
import { ataOf } from "../src/tx/ops";
import { RpcProvider } from "../src/tx/RpcProvider";
import { translations } from "../src/translations";
import { WalletContext, type WalletState } from "../src/wallet/useWallet";
import { eventIxData, fakeSignature, signatureInfo, transactionResult } from "./support/history";
import { RPC_URL, startRpc, testPool } from "./support/rpc";

const UNIT = 1_000_000n;
const API = "http://api.test";
const en = translations.en;
const es = translations.es;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const b64 = (bytes: Uint8Array) => getBase64Decoder().decode(bytes);
// Byte offset of `status` in a CreditLine with sponsor = None (see tests/line.test.ts).
const STATUS_OFFSET_NO_SPONSOR = 156;
const KNOWN_HASH = "01".repeat(32);
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86_400;

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

/** Version-2 reserved bytes: interval, installments, late bps, max missed, late collected, paid until. */
function scheduleBytes(interval: number, installments: number, lateBps: number, maxMissed: number) {
  const reserved = new Uint8Array(32);
  const v = new DataView(reserved.buffer);
  v.setBigInt64(0, BigInt(interval), true);
  v.setUint16(8, installments, true);
  v.setUint16(10, lateBps, true);
  v.setUint8(12, maxMissed);
  return reserved;
}

type Fixture = { config: AppConfig; owner: Address; other: Address; chain: Map<string, RpcAccount | null> };

const testPoolAccounts = (f: Fixture) => derivePoolAccounts(f.config.poolAddress);

type LineSpec = { args: Partial<CreditLineArgs>; statusByte?: number; raw?: Uint8Array };

async function fixture(opts: { lines?: (owner: Address, other: Address) => LineSpec[]; paused?: boolean } = {}): Promise<Fixture> {
  const { config: base, accounts } = await testPool();
  const owner = (await generateKeyPairSigner()).address;
  const other = (await generateKeyPairSigner()).address;
  const config: AppConfig = { rpcUrl: RPC_URL, poolAddress: base.poolAddress, assetMint: base.assetMint, apiUrl: API, explorerCluster: "devnet", testWallet: false };
  const specs = opts.lines ? opts.lines(owner, other) : [];
  const chain = new Map<string, RpcAccount | null>();
  const poolReserved = new Uint8Array(32);
  new DataView(poolReserved.buffer).setUint32(0, 3 * DAY, true);
  chain.set(
    accounts.pool,
    rpcAccount(
      new Uint8Array(
        getPoolEncoder().encode({
          version: 1,
          admin: other,
          assetMint: base.assetMint,
          vault: accounts.vault,
          shareMint: accounts.shareMint,
          deadShares: accounts.deadShares,
          outstandingPrincipal: 6_000n * UNIT,
          interestCollected: 0n,
          writtenOff: 0n,
          lineCount: BigInt(specs.length),
          paused: opts.paused ?? false,
          reserved: poolReserved,
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
  chain.set(owner, { data: ["", "base64"], executable: false, lamports: 2_000_000_000, owner: "11111111111111111111111111111111" as Address, rentEpoch: 0, space: 0 });
  chain.set(await ataOf(owner, base.assetMint), rpcAccount(tokenAccount(base.assetMint, owner, 500n * UNIT), TOKEN_PROGRAM_ADDRESS));

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const [pda] = await findLinePda({ pool: accounts.pool, lineId: BigInt(i) });
    let bytes = spec.raw;
    if (!bytes) {
      bytes = new Uint8Array(
        getCreditLineEncoder().encode({
          version: 1,
          pool: accounts.pool,
          lineId: BigInt(i),
          borrower: owner,
          sponsor: none(),
          agreementHash: new Uint8Array(32).fill(i + 1),
          principal: 600n * UNIT,
          rateBps: 1_000,
          interestDue: 60n * UNIT,
          termEnd: BigInt(NOW + 400 * DAY),
          principalRepaid: 0n,
          interestRepaid: 0n,
          status: LineStatus.Approved,
          openedAt: BigInt(NOW - 30 * DAY),
          drawnAt: 0n,
          closedAt: 0n,
          reserved: new Uint8Array(32),
          bump: 254,
          ...spec.args,
        }),
      );
      if (spec.statusByte !== undefined) bytes[STATUS_OFFSET_NO_SPONSOR] = spec.statusByte;
    }
    chain.set(pda, rpcAccount(bytes, ELOTE_POOL_PROGRAM_ADDRESS));
  }
  return { config, owner, other, chain };
}

/** Every line kind the page must survive (Review Focus 5). */
const ALL_KINDS = (owner: Address, other: Address): LineSpec[] => [
  // 0: approved v1
  { args: {} },
  // 1: active v1, partly repaid
  { args: { status: LineStatus.Active, drawnAt: BigInt(NOW - 10 * DAY), principalRepaid: 100n * UNIT } },
  // 2: repaid v1
  { args: { status: LineStatus.Repaid, drawnAt: BigInt(NOW - 20 * DAY), principalRepaid: 600n * UNIT, interestRepaid: 60n * UNIT, closedAt: BigInt(NOW - DAY) } },
  // 3: v2 in collection: six monthly installments, drawn 100 days ago, nothing paid
  {
    args: { version: 2, status: LineStatus.Active, drawnAt: BigInt(NOW - 100 * DAY), reserved: scheduleBytes(30 * DAY, 6, 2_400, 2) },
    statusByte: 4,
  },
  // 4: readable, but a status byte nobody knows yet
  { args: { status: LineStatus.Active, drawnAt: BigInt(NOW - DAY) }, statusByte: 9 },
  // 5: not a credit line at all (unreadable): names nobody, so it is not on this page
  { args: {}, raw: new Uint8Array(40).fill(3) },
  // 6: another borrower's line that this wallet sponsors
  { args: { borrower: other, sponsor: some(owner), status: LineStatus.Active, drawnAt: BigInt(NOW - 5 * DAY) } },
  // 7: another borrower's line, nothing to do with this wallet
  { args: { borrower: other } },
];

function serve(f: Fixture) {
  rpcServer.use({
    getMultipleAccounts: (params) => ({ context: { slot: 77 }, value: (params[0] as string[]).map((a) => f.chain.get(a) ?? null) }),
  });
}

/** The API knows KNOWN_HASH only; counts requests per hash. */
function serveAgreements() {
  const seen = new Map<string, number>();
  rpcServer.server.use(
    http.get(`${API}/api/agreements/by-hash/:hash`, ({ params }) => {
      const hash = String(params.hash);
      seen.set(hash, (seen.get(hash) ?? 0) + 1);
      if (hash !== KNOWN_HASH) return HttpResponse.json({ error: "agreement not found" }, { status: 404 });
      return HttpResponse.json({
        data: {
          id: "a".repeat(32),
          chain: "solana",
          template: { id: "credit-agreement", version: "0.1.0" },
          status: "anchored",
          roles: ["acreditante", "acreditado"],
          partiesCount: 2,
          signaturesCount: 2,
          createdAt: "2026-10-01 09:30:00",
          anchors: [],
          evidenceUrl: `${API}/api/agreements/${"a".repeat(32)}/evidence`,
        },
      });
    }),
  );
  return seen;
}

function wallet(address: Address | null, status: WalletState["status"] = address ? "connected" : "absent"): WalletState {
  return { status, account: null, address, signer: null, connect: async () => undefined, disconnect: async () => undefined, wallets: [], chain: "solana:devnet" };
}

let mounted: { root: Root; host: HTMLElement; client: QueryClient } | null = null;
afterEach(async () => {
  if (!mounted) return;
  // Let the agreement lookups settle inside act before unmounting.
  for (let i = 0; i < 100 && mounted.client.isFetching() > 0; i++) await act(async () => sleep(5));
  await act(async () => mounted!.root.unmount());
  mounted.host.remove();
  mounted.client.clear();
  mounted = null;
});

async function mount(config: AppConfig, w: WalletState, node: ReactNode = <BorrowPage />, entry = "/borrow") {
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
    q,
    card: (id: number) => host.querySelector(`article[data-line="${id}"]`) as HTMLElement | null,
    text: () => host.textContent ?? "",
    async until(check: () => boolean, label: string) {
      // Also waits for in-flight reads (the agreement lookups), so none lands outside act.
      for (let i = 0; i < 300; i++) {
        if (check() && client.isFetching() === 0) {
          // Query notifications are batched on a timer: flush them inside act.
          await act(async () => sleep(5));
          return;
        }
        await act(async () => sleep(5));
      }
      throw new Error(`timed out waiting for ${label}: ${host.textContent}`);
    },
  };
}

describe("borrow page", () => {
  test("without a wallet: the connect prompt in place, no reads", async () => {
    const f = await fixture({ lines: ALL_KINDS });
    serve(f);
    const page = await mount(f.config, wallet(null));
    expect(page.q('[data-testid="borrow-connect"]')!.textContent).toContain(en.app.borrow.connectTitle);
    expect(page.q('[data-testid="borrow-connect"] button')!.textContent).toContain(en.app.header.connect);
    await act(async () => sleep(20));
    expect(rpcServer.calls.length).toBe(0);
  });

  test("wrong network: the prompt says so", async () => {
    const f = await fixture();
    const page = await mount(f.config, wallet(f.owner, "wrong-chain"));
    expect(page.text()).toContain(en.app.wallet.wrongChain);
  });

  test("Review Focus 5: approved, active, repaid, in collection (v2) and unknown lines all render", async () => {
    const f = await fixture({ lines: ALL_KINDS });
    serve(f);
    serveAgreements();
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.card(0) !== null, "line cards");

    const mine = page.q('[data-testid="borrow-mine-group"]')!;
    const sponsored = page.q('[data-testid="borrow-sponsored-group"]')!;
    expect([...mine.querySelectorAll("article[data-line]")].map((a) => a.getAttribute("data-line"))).toEqual(["0", "1", "2", "3", "4"]);
    expect([...sponsored.querySelectorAll("article[data-line]")].map((a) => a.getAttribute("data-line"))).toEqual(["6"]);
    expect(page.card(5)).toBeNull();
    expect(page.card(7)).toBeNull();
    // overflow:hidden on the card would trap the sticky Draw and Repay submits at 375; clip does not.
    for (const card of mine.querySelectorAll("article[data-line]")) {
      expect(card.className).not.toContain("overflow-hidden");
      expect(card.className).toContain("overflow-clip");
    }
    expect(sponsored.textContent).toContain(en.app.borrow.sponsored);

    const status = (id: number) => page.card(id)!.querySelector("[data-status]")!.getAttribute("data-status");
    expect([0, 1, 2, 3, 4, 6].map(status)).toEqual(["approved", "active", "repaid", "inCollection", "unknown", "active"]);

    // Draw only on the approved line; the repayment form on active and in-collection lines.
    const has = (id: number, sel: string) => page.card(id)!.querySelector(sel) !== null;
    expect([0, 1, 2, 3, 4, 6].map((id) => has(id, '[data-testid="draw-submit"]'))).toEqual([true, false, false, false, false, false]);
    expect([0, 1, 2, 3, 4, 6].map((id) => has(id, '[data-testid="repay-form"]'))).toEqual([false, true, false, true, false, true]);

    // The unknown line: the badge, the note, and no actions at all.
    const unknown = page.card(4)!;
    expect(unknown.textContent).toContain(en.app.pool.status.unknown);
    expect(unknown.querySelector('[data-testid="line-unknown"]')!.textContent).toBe(en.app.borrow.unknownBody);
    expect(unknown.querySelectorAll("button, input, a").length).toBe(0);

    // v1 lines carry no schedule and no late interest; the v2 line has both and the collection notice.
    for (const id of [0, 1, 2, 6]) {
      expect(has(id, '[data-testid="schedule"]')).toBe(false);
      expect(has(id, '[data-testid="late-interest"]')).toBe(false);
      expect(has(id, '[data-testid="in-collection"]')).toBe(false);
    }
    const v2 = page.card(3)!;
    expect(v2.querySelector('[data-testid="in-collection"]')!.textContent).toBe(en.app.borrow.inCollection);
    const installments = [...v2.querySelectorAll("[data-installment]")];
    expect(installments.length).toBe(6);
    // Drawn 100 days ago, every 30 days: three due and unpaid, three to come.
    expect(installments.map((li) => li.getAttribute("data-state"))).toEqual(["overdue", "overdue", "overdue", "pending", "pending", "pending"]);
    expect(v2.querySelector('[data-testid="late-interest"]')!.textContent).toContain("24%");
    expect(v2.querySelector('[data-testid="late-interest"]')!.textContent).toContain("3 days");
    expect(v2.querySelector('[data-testid="repay-estimate"]')).not.toBeNull();

    // The repaid line: figures and the note, no actions.
    expect(page.card(2)!.textContent).toContain(en.app.borrow.repaidNote);
    expect(page.card(2)!.querySelectorAll("input").length).toBe(0);

    // Nothing renders as NaN or undefined anywhere.
    expect(page.text()).not.toMatch(/NaN|undefined|null/);
  });

  test("late interest follows the chain clock read with the pool, not the browser clock", async () => {
    const v2 = { version: 2, status: LineStatus.Active, drawnAt: BigInt(NOW - 100 * DAY), reserved: scheduleBytes(30 * DAY, 6, 2_400, 2) };
    const f = await fixture({ lines: (owner) => [{ args: { ...v2, borrower: owner } }] });
    // The cluster's clock runs 10 minutes ahead of this browser.
    const chainNow = NOW + 600;
    const clock = new Uint8Array(40);
    new DataView(clock.buffer).setBigInt64(32, BigInt(chainNow), true);
    f.chain.set(SYSVAR_CLOCK_ADDRESS, rpcAccount(clock, "Sysvar1111111111111111111111111111111111111" as Address, 1_169_280));
    serve(f);
    serveAgreements();
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.card(0)?.querySelector('[data-testid="repay-due-now"]') != null, "repayment form");

    const [pda] = await findLinePda({ pool: (await testPoolAccounts(f)).pool, lineId: 0n });
    const view = decodeLineView(getBase64Encoder().encode(f.chain.get(pda)!.data[0]));
    if (!view.readable) throw new Error("fixture line unreadable");
    const byChain = repayFigures(view, 3 * DAY, BigInt(chainNow)).dueNow;
    const byBrowser = repayFigures(view, 3 * DAY, BigInt(NOW)).dueNow;
    expect(byChain).not.toBe(byBrowser);
    expect(page.card(0)!.querySelector('[data-testid="repay-due-now"]')!.getAttribute("data-amount")).toBe(byChain.toString());
    // One request still reads the pool accounts and the clock together.
    expect((rpcServer.calls.find((c) => c.method === "getMultipleAccounts")!.params[0] as string[]).at(-1)).toBe(SYSVAR_CLOCK_ADDRESS);
  });

  test("without the chain clock the estimate uses the browser clock", async () => {
    const v2 = { version: 2, status: LineStatus.Active, drawnAt: BigInt(NOW - 100 * DAY), reserved: scheduleBytes(30 * DAY, 6, 2_400, 2) };
    const f = await fixture({ lines: (owner) => [{ args: { ...v2, borrower: owner } }] });
    serve(f);
    serveAgreements();
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.card(0)?.querySelector('[data-testid="repay-due-now"]') != null, "repayment form");
    const [pda] = await findLinePda({ pool: (await testPoolAccounts(f)).pool, lineId: 0n });
    const view = decodeLineView(getBase64Encoder().encode(f.chain.get(pda)!.data[0]));
    if (!view.readable) throw new Error("fixture line unreadable");
    const shown = BigInt(page.card(0)!.querySelector('[data-testid="repay-due-now"]')!.getAttribute("data-amount")!);
    // Browser time at render is NOW or a second or two later; never 10 minutes ahead.
    const low = repayFigures(view, 3 * DAY, BigInt(NOW)).dueNow;
    const high = repayFigures(view, 3 * DAY, BigInt(NOW + 5)).dueNow;
    expect(shown >= low && shown <= high).toBe(true);
    expect(page.card(0)!.querySelector('[data-testid="repay-estimate"]')!.textContent).toBe(en.app.borrow.repay.estimate);
  });

  test("v1 line: no schedule section at all", async () => {
    const f = await fixture({ lines: (owner) => [{ args: { borrower: owner, status: LineStatus.Active, drawnAt: BigInt(NOW - DAY) } }] });
    serve(f);
    serveAgreements();
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.card(0) !== null, "line card");
    expect(page.card(0)!.querySelector('[data-testid="schedule"]')).toBeNull();
    expect(page.card(0)!.textContent).not.toContain(en.app.borrow.schedule.title);
    expect(page.card(0)!.querySelector('[data-testid="repay-due-now"]')!.getAttribute("data-amount")).toBe((660n * UNIT).toString());
  });

  test("agreement: the hash always; the summary and evidence link when the API knows it; a 404 is not retried", async () => {
    const f = await fixture({ lines: ALL_KINDS });
    serve(f);
    const seen = serveAgreements();
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.card(0)?.querySelector('[data-testid="agreement-evidence"]') != null, "agreement summary");

    const known = page.card(0)!;
    const hash = known.querySelector('[data-testid="agreement-hash"]')!;
    expect(hash.getAttribute("title")).toBe(KNOWN_HASH);
    expect(hash.querySelector(".sr-only")!.textContent).toBe(KNOWN_HASH);
    const link = known.querySelector('[data-testid="agreement-evidence"]')!;
    expect(link.getAttribute("href")).toBe(`${API}/api/agreements/${"a".repeat(32)}/evidence`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    const summary = known.querySelector('[data-testid="agreement-summary"]')!.textContent ?? "";
    expect(summary).toContain("credit-agreement 0.1.0");
    expect(summary).toContain(en.app.borrow.agreement.statuses.anchored);
    expect(summary).toContain("2 of 2");
    expect(summary).toContain("Oct 1, 2026");

    // Line 1 holds a hash the API does not know: the label and hash only.
    await page.until(() => (seen.get("02".repeat(32)) ?? 0) >= 1, "lookup of line 1");
    await act(async () => sleep(30));
    const unknown = page.card(1)!.querySelector('[data-testid="agreement"]')!;
    expect(unknown.textContent).toContain(en.app.borrow.agreement.hash);
    expect(unknown.querySelector('[data-testid="agreement-summary"]')).toBeNull();
    expect(seen.get("02".repeat(32))).toBe(1);
  });

  test("history: nothing is read until the disclosure opens; then the line's signatures, decoded", async () => {
    const f = await fixture({ lines: (owner) => [{ args: { borrower: owner, status: LineStatus.Active, drawnAt: BigInt(NOW - DAY) } }, { args: {} }] });
    serve(f);
    serveAgreements();
    const pool = f.config.poolAddress;
    const [line0] = await findLinePda({ pool, lineId: 0n });
    const drawSig = fakeSignature(5);
    const asked: string[] = [];
    rpcServer.use({
      getSignaturesForAddress: (params) => {
        asked.push(params[0] as string);
        return [signatureInfo(drawSig, NOW - DAY)];
      },
      getTransaction: (params) =>
        transactionResult(params[0] as string, f.owner, [
          eventIxData(getLineDrawnEventEncoder().encode({ pool, lineId: 0n, amount: 600n * UNIT, outstandingAfter: 600n * UNIT })),
        ]),
    });
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.card(1) !== null, "line cards");
    await act(async () => sleep(30));
    expect(rpcServer.count("getSignaturesForAddress")).toBe(0);

    const toggle = page.card(0)!.querySelector('[data-testid="line-history-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Visible "History"; the accessible name adds the line, so each card's button is distinct.
    expect(toggle.textContent).toBe(`${en.app.history.lineToggle}, Line #0`);
    expect(toggle.querySelector(".sr-only")!.textContent).toBe(", Line #0");
    const other = page.card(1)!.querySelector('[data-testid="line-history-toggle"]')!;
    expect(other.textContent).toBe(`${en.app.history.lineToggle}, Line #1`);
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await page.until(() => page.card(0)!.querySelector('[data-testid="history-list"]') !== null, "line history");
    expect(rpcServer.count("getSignaturesForAddress")).toBe(1);
    expect(asked).toEqual([line0]);
    const row = page.card(0)!.querySelector("li[data-signature]")!;
    expect(row.getAttribute("data-row")).toBe("LineDrawn");
    expect(row.textContent).toContain("Drew 600 tMXN test tokens");
    expect(row.querySelector("a")!.getAttribute("href")).toContain(drawSig);
    // The other line stays closed and unread.
    expect(page.card(1)!.querySelector('[data-testid="line-history-toggle"]')!.getAttribute("aria-expanded")).toBe("false");

    // Closing and opening again within a minute reads nothing new.
    await act(async () => toggle.click());
    await act(async () => toggle.click());
    await act(async () => sleep(30));
    expect(rpcServer.count("getSignaturesForAddress")).toBe(1);
  });

  test("no lines for this wallet: the empty state with the copy the owner set", async () => {
    const f = await fixture({ lines: (_owner, other) => [{ args: { borrower: other } }] });
    serve(f);
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.q('[data-testid="borrow-empty"]') !== null, "empty state");
    expect(page.q('[data-testid="borrow-empty"]')!.textContent).toContain(
      "No lines for this wallet.Lines are opened by the pool administrator after the agreement is signed.",
    );
    expect(`${es.app.borrow.empty.title} ${es.app.borrow.empty.body}`).toBe(
      "No hay líneas para esta wallet. El administrador del pool abre las líneas cuando el contrato está firmado.",
    );
  });

  test("paused pool: the banner, Draw disabled, repayments still open", async () => {
    const f = await fixture({ lines: ALL_KINDS, paused: true });
    serve(f);
    serveAgreements();
    const page = await mount(f.config, wallet(f.owner));
    await page.until(() => page.card(0) !== null, "line cards");
    expect(page.q('[data-testid="borrow-paused"]')!.textContent).toBe(en.app.borrow.paused);
    expect((page.card(0)!.querySelector('[data-testid="draw-submit"]') as HTMLButtonElement).disabled).toBe(true);
    await page.until(() => !(page.card(1)!.querySelector('[data-testid="repay-submit"]') as HTMLButtonElement).disabled, "balance loaded");
  });

  test("Spanish copy: Disponer, Pagar and the status labels", async () => {
    const f = await fixture({ lines: ALL_KINDS });
    serve(f);
    serveAgreements();
    const page = await mount(f.config, wallet(f.owner), <BorrowPage />, "/borrow?lang=es");
    await page.until(() => page.card(0) !== null, "line cards");
    expect(page.card(0)!.querySelector('[data-testid="draw-submit"]')!.textContent).toBe("Disponer");
    expect(page.card(1)!.querySelector('[data-testid="repay-submit"]')!.textContent).toBe("Pagar");
    expect(page.card(3)!.textContent).toContain("En cobranza");
    expect(page.card(4)!.textContent).toContain("Desconocida");
  });
});
