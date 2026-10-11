import "./support/dom";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  getDepositedEventEncoder,
  getLateInterestCollectedEventEncoder,
  getLineInCollectionEventEncoder,
  getLineScheduledEventEncoder,
  getLineRepaidEventEncoder,
  getRedeemedEventEncoder,
} from "@elote/pool-client";
import { generateKeyPairSigner, getBase58Encoder, type Address } from "@solana/kit";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HistoryList } from "../src/app/components/HistoryList";
import { HISTORY_LIMIT, historyQueryKey, historyRow, mapLimit, readHistory, type HistoryScope } from "../src/app/history";
import { decodeEventInstructionData, type HistoryEntry } from "../src/pool/history";
import { createRpc } from "../src/tx/rpc";
import { translations, type Lang } from "../src/translations";
import { eventIxData, fakeSignature, signatureInfo, transactionResult } from "./support/history";
import { RPC_URL, RpcErrorReply, startRpc } from "./support/rpc";

const UNIT = 1_000_000n;
const en = translations.en;
const es = translations.es;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rpcServer = startRpc();
afterAll(() => rpcServer.close());
beforeEach(() => rpcServer.reset());

let pool: Address;
let owner: Address;
let other: Address;
beforeEach(async () => {
  pool = (await generateKeyPairSigner()).address;
  owner = (await generateKeyPairSigner()).address;
  other = (await generateKeyPairSigner()).address;
});

const depositedData = () =>
  eventIxData(
    getDepositedEventEncoder().encode({ pool, depositor: owner, assets: 10_000n * UNIT, shares: 9_999_999_000n, navAfter: 10_000n * UNIT, supplyAfter: 10_000n * UNIT }),
  );
const redeemedData = () =>
  eventIxData(getRedeemedEventEncoder().encode({ pool, holder: owner, shares: 4_000n * UNIT + 123n, assets: 4_192n * UNIT, navAfter: 0n, supplyAfter: 0n }));
// Tagged like an event, with a discriminator no generated parser knows.
const UNKNOWN_DATA = eventIxData([7, 7, 7, 7, 7, 7, 7, 7, 1, 2, 3, 4]);

// ---- concurrency helper ----

describe("mapLimit", () => {
  test("never more than the limit in flight; results keep the input order", async () => {
    let inFlight = 0;
    let peak = 0;
    const pending: Array<() => void> = [];
    const run = mapLimit([0, 1, 2, 3, 4, 5, 6, 7], 3, (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise<number>((resolve) => {
        pending.push(() => {
          inFlight -= 1;
          resolve(n * 10);
        });
      });
    });
    // Resolve out of order, one at a time, letting the helper start the next call.
    while (pending.length > 0) {
      expect(inFlight).toBeLessThanOrEqual(3);
      pending.splice(pending.length - 1, 1)[0]!();
      await sleep(0);
    }
    expect(await run).toEqual([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
  });

  test("after abort no further call starts and the promise rejects", async () => {
    const controller = new AbortController();
    let started = 0;
    const pending: Array<() => void> = [];
    const run = mapLimit(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      () => {
        started += 1;
        return new Promise<void>((resolve) => pending.push(resolve));
      },
      controller.signal,
    );
    const outcome = run.then(
      () => "resolved",
      (error: unknown) => (error as Error).name,
    );
    expect(started).toBe(3);
    controller.abort();
    for (const resolve of pending.splice(0)) resolve();
    await sleep(5);
    expect(started).toBe(3);
    expect(await outcome).toBe("AbortError");
  });

  test("an empty list resolves at once; a failing call rejects", async () => {
    expect(await mapLimit([], 3, async () => 1)).toEqual([]);
    await expect(mapLimit([1, 2], 3, async (n) => (n === 2 ? Promise.reject(new Error("boom")) : n))).rejects.toThrow("boom");
  });
});

// ---- decoder additions ----

describe("events added for lines", () => {
  test("late interest and collection events decode", () => {
    const b58 = getBase58Encoder();
    const late = decodeEventInstructionData(b58.encode(eventIxData(getLateInterestCollectedEventEncoder().encode({ pool, lineId: 3n, amount: 12n * UNIT }))));
    expect(late?.kind).toBe("LateInterestCollected");
    const coll = decodeEventInstructionData(b58.encode(eventIxData(getLineInCollectionEventEncoder().encode({ pool, lineId: 3n, missed: 2, remaining: 500n * UNIT }))));
    expect(coll?.kind).toBe("LineInCollection");
    if (coll?.kind === "LineInCollection") expect(coll.data.missed).toBe(2);
  });
});

// ---- reading ----

describe("readHistory", () => {
  test("one signatures call, transactions for the confirmed ones only, newest first, decoded", async () => {
    const sigs = [fakeSignature(1), fakeSignature(2), fakeSignature(3)];
    const account = (await generateKeyPairSigner()).address;
    rpcServer.use({
      getSignaturesForAddress: (params) => {
        expect(params[0]).toBe(account);
        expect((params[1] as { limit: number }).limit).toBe(HISTORY_LIMIT);
        return [
          signatureInfo(sigs[0]!, 1_760_000_300),
          signatureInfo(sigs[1]!, 1_760_000_200),
          signatureInfo(sigs[2]!, null, { InstructionError: [0, { Custom: 6001 }] }),
        ];
      },
      getTransaction: async (params) => {
        const sig = params[0] as string;
        const cfg = params[1] as { encoding: string; maxSupportedTransactionVersion: number };
        expect(cfg.encoding).toBe("json");
        expect(cfg.maxSupportedTransactionVersion).toBe(0);
        // The second answers first: the result must still follow the signature order.
        if (sig === sigs[0]) await sleep(15);
        return transactionResult(sig, owner, sig === sigs[0] ? [depositedData()] : [UNKNOWN_DATA]);
      },
    });
    const entries = await readHistory(createRpc(RPC_URL), account, { limit: HISTORY_LIMIT, concurrency: 3 });
    expect(rpcServer.count("getSignaturesForAddress")).toBe(1);
    expect(rpcServer.count("getTransaction")).toBe(2);
    expect(entries.map((e) => e.signature)).toEqual(sigs);
    expect(entries.map((e) => e.events.map((x) => x.kind))).toEqual([["Deposited"], [], []]);
    expect(entries.map((e) => e.failed)).toEqual([false, false, true]);
    expect(entries.map((e) => e.blockTime)).toEqual([1_760_000_300, 1_760_000_200, null]);
    const dep = entries[0]!.events[0]!;
    if (dep.kind === "Deposited") expect(dep.data.assets).toBe(10_000n * UNIT);
  });

  test("one rate-limited transaction read costs only its row", async () => {
    const sigs = [fakeSignature(71), fakeSignature(72), fakeSignature(73)];
    rpcServer.use({
      getSignaturesForAddress: () => sigs.map((s) => signatureInfo(s, 1_760_000_000)),
      getTransaction: (params) => {
        const sig = params[0] as string;
        if (sig === sigs[1]) throw new RpcErrorReply(-32429, "Too many requests for a specific RPC call");
        return transactionResult(sig, owner, [depositedData()]);
      },
    });
    const entries = await readHistory(createRpc(RPC_URL), owner);
    expect(entries.map((e) => e.signature)).toEqual(sigs);
    expect(entries.map((e) => e.events.length)).toEqual([1, 0, 1]);
    expect(entries.map((e) => e.unreadable === true)).toEqual([false, true, false]);
    expect(entries[1]!.failed).toBe(false);
    const scope: HistoryScope = { kind: "shares", pool, owner };
    expect(entries.map((e) => historyRow(e, scope).kind)).toEqual(["events", "other", "events"]);
  });

  test("a malformed node reply is an unreadable row, not a failed list", async () => {
    const sig = fakeSignature(81);
    rpcServer.use({
      getSignaturesForAddress: () => [signatureInfo(sig, 1_760_000_000)],
      // No message: the decoder would throw on it.
      getTransaction: () => ({ slot: 1, blockTime: 1, transaction: {}, meta: { err: null, innerInstructions: [] } }),
    });
    const entries = await readHistory(createRpc(RPC_URL), owner);
    expect(entries).toEqual([{ signature: sig, blockTime: 1_760_000_000, failed: false, events: [], unreadable: true }]);
  });

  test("a transaction whose meta reports an error is failed even when the list said ok", async () => {
    const sig = fakeSignature(91);
    rpcServer.use({
      getSignaturesForAddress: () => [signatureInfo(sig, 1_760_000_000, null)],
      getTransaction: () => {
        const tx = transactionResult(sig, owner, [depositedData()]);
        return { ...tx, meta: { ...tx.meta, err: { InstructionError: [0, { Custom: 6013 }] }, status: { Err: { InstructionError: [0, { Custom: 6013 }] } } } };
      },
    });
    const entries = await readHistory(createRpc(RPC_URL), owner);
    expect(entries[0]!.failed).toBe(true);
    expect(historyRow(entries[0]!, { kind: "shares", pool, owner }).kind).toBe("failed");
  });

  test("a transaction the node does not return is a row without events", async () => {
    const sig = fakeSignature(9);
    rpcServer.use({ getSignaturesForAddress: () => [signatureInfo(sig, 1_760_000_000)], getTransaction: () => null });
    const entries = await readHistory(createRpc(RPC_URL), owner);
    expect(entries).toEqual([{ signature: sig, blockTime: 1_760_000_000, failed: false, events: [] }]);
  });

  test("at most 3 transaction reads in flight; none start after abort", async () => {
    const sigs = Array.from({ length: 12 }, (_, i) => fakeSignature(20 + i));
    let inFlight = 0;
    let peak = 0;
    rpcServer.use({
      getSignaturesForAddress: () => sigs.map((s) => signatureInfo(s, 1_760_000_000)),
      getTransaction: async (params) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await sleep(20);
        inFlight -= 1;
        return transactionResult(params[0] as string, owner, []);
      },
    });
    const rpc = createRpc(RPC_URL);
    const entries = await readHistory(rpc, owner, { limit: 20, concurrency: 3 });
    expect(entries.length).toBe(12);
    expect(peak).toBe(3);

    rpcServer.calls.length = 0;
    const controller = new AbortController();
    const outcome = readHistory(rpc, owner, { limit: 20, concurrency: 3 }, controller.signal).then(
      () => "resolved",
      () => "rejected",
    );
    for (let i = 0; i < 100 && rpcServer.count("getTransaction") < 3; i++) await sleep(2);
    expect(rpcServer.count("getTransaction")).toBe(3);
    controller.abort();
    expect(await outcome).toBe("rejected");
    await sleep(60);
    expect(rpcServer.count("getTransaction")).toBe(3);
  });

  test("the query key", () => {
    expect(historyQueryKey("shares", owner)).toEqual(["history", "shares", owner]);
    expect(historyQueryKey("line", null)).toEqual(["history", "line", null]);
  });
});

// ---- rows ----

function entry(signature: string, events: HistoryEntry["events"], failed = false, blockTime: number | null = 1_760_000_000): HistoryEntry {
  return { signature, blockTime, failed, events };
}

describe("historyRow", () => {
  test("the investor sees only their own deposits and redemptions in this pool", () => {
    const scope: HistoryScope = { kind: "shares", pool, owner };
    const mine = decodeEventInstructionData(getBase58Encoder().encode(depositedData()))!;
    const theirs = { kind: "Deposited", data: { pool, depositor: other, assets: 1n, shares: 1n, navAfter: 0n, supplyAfter: 0n } } as const;
    const otherPool = { kind: "Deposited", data: { pool: other, depositor: owner, assets: 1n, shares: 1n, navAfter: 0n, supplyAfter: 0n } } as const;
    expect(historyRow(entry("a", [mine]), scope).kind).toBe("events");
    expect(historyRow(entry("b", [theirs, otherPool]), scope).kind).toBe("other");
    expect(historyRow(entry("c", [mine], true), scope).kind).toBe("failed");
  });

  test("a line sees only its own events", () => {
    const scope: HistoryScope = { kind: "line", pool, lineId: 2n };
    const repaid = (lineId: bigint) =>
      ({ kind: "LineRepaid", data: { pool, lineId, payer: owner, principalPart: 1n, interestPart: 1n, remaining: 0n, navAfter: 0n } }) as const;
    const row = historyRow(entry("a", [repaid(1n), repaid(2n)]), scope);
    expect(row.kind === "events" ? row.events.length : 0).toBe(1);
    expect(historyRow(entry("b", [repaid(1n)]), scope).kind).toBe("other");
  });
});

// ---- the list ----

let mounted: { root: Root; host: HTMLElement } | null = null;
afterEach(async () => {
  if (!mounted) return;
  await act(async () => mounted!.root.unmount());
  mounted.host.remove();
  mounted = null;
});

async function render(entries: HistoryEntry[], scope: HistoryScope, lang: Lang = "en") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const t = translations[lang];
  await act(async () => root.render(<HistoryList entries={entries} scope={scope} t={t} lang={lang} cluster="devnet" label={t.app.history.title} />));
  mounted = { root, host };
  return host;
}

describe("HistoryList", () => {
  test("deposit, redemption, unknown and failed rows, each with an explorer link", async () => {
    const decode = (data: string) => decodeEventInstructionData(getBase58Encoder().encode(data))!;
    const sigs = [fakeSignature(41), fakeSignature(42), fakeSignature(43), fakeSignature(44)];
    const host = await render(
      [
        entry(sigs[0]!, [decode(depositedData())]),
        entry(sigs[1]!, [decode(redeemedData())]),
        entry(sigs[2]!, []),
        entry(sigs[3]!, [], true, null),
      ],
      { kind: "shares", pool, owner },
    );
    const rows = [...host.querySelectorAll("li[data-signature]")] as HTMLElement[];
    expect(rows.map((r) => r.getAttribute("data-signature"))).toEqual(sigs);
    expect(rows.map((r) => r.getAttribute("data-row"))).toEqual(["Deposited", "Redeemed", "other", "failed"]);
    expect(rows[0]!.textContent).toContain("Deposited 10,000 tMXN test tokens for 9,999.999 shares");
    // 4,000.000123 shares: three decimals on screen, all six for screen readers.
    const visible = (el: Element) => {
      const copy = el.cloneNode(true) as Element;
      for (const sr of copy.querySelectorAll(".sr-only")) sr.remove();
      return (copy.textContent ?? "").replace(/\s+/g, " ");
    };
    expect(visible(rows[1]!)).toContain("Redeemed 4,000 shares for 4,192 tMXN test tokens");
    const sharesAmount = rows[1]!.querySelector('[data-full="4,000.000123"]');
    expect(sharesAmount).not.toBeNull();
    expect(sharesAmount!.querySelector(".sr-only")!.textContent).toBe("4,000.000123");
    expect(sharesAmount!.querySelector('[aria-hidden="true"]')!.textContent).toBe("4,000");
    expect(rows[2]!.textContent).toContain(en.app.history.rows.other);
    expect(rows[3]!.textContent).toContain(en.app.history.rows.failed);
    expect(rows[3]!.textContent).toContain(en.app.pool.noDate);
    expect(rows[0]!.textContent).toContain("Oct");
    for (const [i, row] of rows.entries()) {
      const link = row.querySelector("a")!;
      expect(link.getAttribute("href")).toBe(`https://explorer.solana.com/tx/${sigs[i]}?cluster=devnet`);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noreferrer");
      expect(link.textContent).toContain(en.app.newTab);
    }
    expect(host.textContent).not.toMatch(/NaN|undefined|null/);
  });

  test("Spanish rows", async () => {
    const decode = (data: string) => decodeEventInstructionData(getBase58Encoder().encode(data))!;
    const host = await render([entry(fakeSignature(51), [decode(depositedData())])], { kind: "shares", pool, owner }, "es");
    expect(host.textContent).toContain("Depositó 10,000 tokens de prueba tMXN por 9,999.999 participaciones");
    expect(host.textContent).toContain(es.app.history.view);
  });

  test("line rows: repayment with late interest, collection", async () => {
    const decode = (data: string) => decodeEventInstructionData(getBase58Encoder().encode(data))!;
    const repaid = decode(
      eventIxData(getLineRepaidEventEncoder().encode({ pool, lineId: 0n, payer: owner, principalPart: 100n * UNIT, interestPart: 10n * UNIT, remaining: 0n, navAfter: 0n })),
    );
    const late = decode(eventIxData(getLateInterestCollectedEventEncoder().encode({ pool, lineId: 0n, amount: 2n * UNIT })));
    const coll = decode(eventIxData(getLineInCollectionEventEncoder().encode({ pool, lineId: 0n, missed: 2, remaining: 500n * UNIT })));
    const scheduled = decode(
      eventIxData(getLineScheduledEventEncoder().encode({ pool, lineId: 0n, intervalSeconds: 30n * 86_400n, installments: 6, lateBps: 2_400, maxMissed: 2 })),
    );
    expect(scheduled.kind).toBe("LineScheduled");
    const host = await render(
      [entry(fakeSignature(61), [late, repaid]), entry(fakeSignature(62), [coll]), entry(fakeSignature(63), [scheduled])],
      { kind: "line", pool, lineId: 0n },
    );
    const rows = [...host.querySelectorAll("li[data-signature]")];
    expect(rows[2]!.getAttribute("data-row")).toBe("LineScheduled");
    expect(rows[2]!.textContent).toContain("Schedule set: 6 installments, one every 30 days");
    expect(host.textContent).toContain("Paid 2 tMXN test tokens of late interest");
    expect(host.textContent).toContain("Repaid 100 tMXN test tokens of principal and 10 of interest");
    expect(host.textContent).toContain("Sent to collection after 2 missed installments");
  });

  test("empty: the investor empty state; a line says so in one line", async () => {
    let host = await render([], { kind: "shares", pool, owner });
    expect(host.querySelector('[data-testid="history-empty"]')!.textContent).toContain(en.app.history.empty.title);
    expect(host.querySelector("li")).toBeNull();
    await act(async () => mounted!.root.unmount());
    mounted!.host.remove();
    mounted = null;
    host = await render([], { kind: "line", pool, lineId: 0n });
    expect(host.querySelector('[data-testid="history-empty"]')!.textContent).toBe(en.app.history.lineEmpty);
  });
});
