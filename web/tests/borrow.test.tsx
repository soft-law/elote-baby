import "./support/dom";
import { afterEach, describe, expect, test } from "bun:test";
import type { Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fetchAgreementByHash, parseAgreementSummary } from "../src/app/agreement";
import { DrawAction, agreementCreatedSeconds, drawBlock } from "../src/app/components/LineCard";
import type { AppConfig } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { RepayForm, repayLimits } from "../src/app/forms/RepayForm";
import { checkRepay } from "../src/app/forms/validation";
import { linesFor } from "../src/app/pages/Borrow";
import { poolGraceSeconds, type PoolLine } from "../src/app/queries";
import { ToastProvider } from "../src/app/toast/Toast";
import { formatDuration } from "../src/pool/format";
import type { LineView } from "../src/pool/line";
import {
  LATE_BUFFER_SECONDS,
  SECONDS_PER_YEAR,
  arrears,
  cumulativeDue,
  installmentRows,
  installmentsCovered,
  installmentsDue,
  repayFigures,
  scheduleTerms,
  type ScheduleTerms,
} from "../src/pool/schedule";
import type { PoolOp } from "../src/tx/ops";
import type { TxError, TxResult } from "../src/tx/tx";
import type { TxStep, UseTx } from "../src/tx/useTx";
import { translations, type Copy } from "../src/translations";

const UNIT = 1_000_000n;
const en: Copy = translations.en;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const YEAR = SECONDS_PER_YEAR;

const BORROWER = "BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM" as Address;
const SPONSOR = "So11111111111111111111111111111111111111112" as Address;
const HASH = "07".repeat(32);

function lineView(overrides: Partial<LineView> = {}): LineView {
  const base: LineView = {
    readable: true,
    version: 1,
    status: "active",
    statusIndex: 1,
    pool: BORROWER,
    lineId: 3n,
    borrower: BORROWER,
    sponsor: null,
    principal: 600n * UNIT,
    rateBps: 1_000,
    interestDue: 60n * UNIT,
    principalRepaid: 0n,
    interestRepaid: 0n,
    remaining: 660n * UNIT,
    termEnd: 2_000_000_000,
    openedAt: 1_000,
    drawnAt: 1_000,
    closedAt: null,
    agreementHashHex: HASH,
  };
  const view = { ...base, ...overrides };
  const p = view.principal > view.principalRepaid ? view.principal - view.principalRepaid : 0n;
  const i = view.interestDue > view.interestRepaid ? view.interestDue - view.interestRepaid : 0n;
  return { ...view, remaining: overrides.remaining ?? p + i };
}

// ---- the arrears port matches the program's own test numbers (programs/elote_pool/src/math.rs) ----

function terms(total: bigint, n: number, lateBps: number, grace: bigint): ScheduleTerms {
  return { total, drawnAt: 1_000n, interval: 100n, installments: n, lateBps, grace, latePaidUntil: 0n, principal: total, lateCollected: 0n };
}

describe("schedule arithmetic", () => {
  test("installments due, cumulative due and covered", () => {
    expect(installmentsDue(100n, 0n, 1_000n, 6)).toBe(0);
    expect(installmentsDue(1_000n, 0n, 1_000n, 6)).toBe(1);
    expect(installmentsDue(3_500n, 0n, 1_000n, 6)).toBe(3);
    expect(installmentsDue(1_000_000n, 0n, 1_000n, 6)).toBe(6);
    expect(installmentsDue(10n, 0n, 0n, 6)).toBe(0);
    expect(cumulativeDue(1_000_003n, 6, 5)).toBe(833_335n);
    expect(cumulativeDue(1_000_003n, 6, 6)).toBe(1_000_003n);
    expect(installmentsCovered(99n, 600n, 6)).toBe(0);
    expect(installmentsCovered(599n, 600n, 6)).toBe(5);
    expect(installmentsCovered(1_000_002n, 1_000_003n, 6)).toBe(5);
    expect(installmentsCovered(1_000_003n, 1_000_003n, 6)).toBe(6);
  });

  test("missed installments over time", () => {
    const t = terms(600n, 6, 0, 0n);
    expect(arrears(t, 0n, 1_099n).missed).toBe(0);
    expect(arrears(t, 0n, 1_100n)).toMatchObject({ due: 1, covered: 0, missed: 1, overdue: 100n, firstMissedDue: 1_100n });
    expect(arrears(t, 150n, 1_300n)).toMatchObject({ due: 3, covered: 1, missed: 2, overdue: 150n, firstMissedDue: 1_200n });
    expect(arrears(t, 400n, 1_300n)).toMatchObject({ missed: 0, overdue: 0n, firstMissedDue: null });
    expect(arrears(t, 60n, 1_200n)).toMatchObject({ due: 2, covered: 0, missed: 2, overdue: 140n, firstMissedDue: 1_100n });
  });

  test("late interest per part from due date plus grace, and the watermark", () => {
    const t = { ...terms((365n * 3n * YEAR) / 1_000n, 3, 10_000, 10n), interval: 1_000n };
    const now = t.drawnAt + 2_000n + 10n + 100n;
    expect(arrears(t, 0n, now)).toMatchObject({ missed: 2, lateDue: 438n });
    expect(arrears(t, 0n, t.drawnAt + 1_000n + 10n)).toMatchObject({ missed: 1, lateDue: 0n });
    expect(arrears({ ...t, latePaidUntil: now }, 0n, now).lateDue).toBe(0n);
  });

  test("late interest caps: the overdue amount and the principal over the life of the line", () => {
    const t = terms(600n, 6, 10_000, 0n);
    expect(arrears(t, 0n, 1_000n + 600n + 50n * YEAR)).toMatchObject({ overdue: 600n, lateDue: 600n });
    expect(arrears({ ...t, principal: 500n, lateCollected: 450n }, 0n, 1_000n + 600n + 50n * YEAR).lateDue).toBe(50n);
  });

  test("a v1 line, an undrawn v2 line or a broken schedule has no terms", () => {
    expect(scheduleTerms(lineView(), 0)).toBeNull();
    const schedule = { intervalSeconds: 100n, installments: 6, maxMissed: 2 };
    expect(scheduleTerms(lineView({ version: 2, schedule, drawnAt: null }), 0)).toBeNull();
    expect(scheduleTerms(lineView({ version: 2, schedule: { ...schedule, installments: 0 } }), 0)).toBeNull();
    expect(scheduleTerms(lineView({ version: 2, schedule: { ...schedule, intervalSeconds: 0n } }), 0)).toBeNull();
    expect(installmentRows(lineView({ version: 2, schedule: { ...schedule, intervalSeconds: 0n } }), 0n)).toEqual([]);
  });

  test("installment rows: paid, partly paid, overdue and upcoming; no dates before the draw", () => {
    const schedule = { intervalSeconds: 100n, installments: 6, maxMissed: 2 };
    // 660 in six installments of 110; 150 paid: one paid, the second partly paid.
    const line = lineView({ version: 2, schedule, principalRepaid: 150n * UNIT });
    const rows = installmentRows(line, 1_250n);
    expect(rows.map((r) => r.state)).toEqual(["paid", "overdue", "pending", "pending", "pending", "pending"]);
    expect(rows.map((r) => r.dueAt)).toEqual([1_100, 1_200, 1_300, 1_400, 1_500, 1_600]);
    expect(rows.reduce((sum, r) => sum + r.amount, 0n)).toBe(660n * UNIT);
    expect(installmentRows(line, 1_150n)[1]!.state).toBe("partial");
    const undrawn = installmentRows(lineView({ version: 2, schedule, status: "approved", drawnAt: null }), 5_000n);
    expect(undrawn.every((r) => r.dueAt === null && r.state === "pending")).toBe(true);
  });

  test("repay figures: v1 owes what remains; v2 owes overdue plus late interest, else the next installment", () => {
    const v1 = repayFigures(lineView({ principalRepaid: 100n * UNIT }), 0, 5_000n);
    expect(v1).toMatchObject({ dueNow: 560n * UNIT, lateDue: 0n, payoff: 560n * UNIT, estimate: false });

    const schedule = { intervalSeconds: 100n, installments: 6, maxMissed: 2 };
    const ahead = repayFigures(lineView({ version: 2, schedule, lateInterest: { lateBps: 0, collected: 0n, paidUntil: null } }), 0, 1_050n);
    expect(ahead).toMatchObject({ dueNow: 110n * UNIT, lateDue: 0n, payoff: 660n * UNIT, estimate: true });

    const lateLine = lineView({ version: 2, schedule, lateInterest: { lateBps: 10_000, collected: 0n, paidUntil: null } });
    const late = repayFigures(lateLine, 10, 1_250n);
    expect(late.arrears).toMatchObject({ missed: 2, overdue: 220n * UNIT });
    expect(late.lateDue).toBeGreaterThan(0n);
    expect(late.dueNow).toBe(220n * UNIT + late.lateDue);
    expect(late.lateDueBuffered).toBe(arrears(scheduleTerms(lateLine, 10)!, 0n, 1_250n + LATE_BUFFER_SECONDS).lateDue);
    expect(late.payoff).toBe(660n * UNIT + late.lateDueBuffered);
  });

  test("pool grace from reserved bytes, durations in words", () => {
    const reserved = new Uint8Array(32);
    new DataView(reserved.buffer).setUint32(0, 259_200, true);
    expect(poolGraceSeconds(reserved)).toBe(259_200);
    expect(poolGraceSeconds(new Uint8Array(32))).toBe(0);
    expect(formatDuration(259_200)).toBe("3 days");
    expect(formatDuration(2_592_000n, "es")).toBe("30 días");
    expect(formatDuration(7_200n)).toBe("2 hours");
  });
});

describe("repay validation", () => {
  test("v1: above zero, at most what remains and the balance; partial amounts are fine", () => {
    const limits = { owed: 560n * UNIT, minimum: 1n };
    const code = (input: string, balance = 1_000n * UNIT) => {
      const r = checkRepay(input, limits, balance);
      return r.ok ? "ok" : r.error.code;
    };
    expect(code("")).toBe("required");
    expect(code("abc")).toBe("invalid");
    expect(code("0")).toBe("zero");
    expect(code("1.0000001")).toBe("tooManyDecimals");
    expect(code("0.000001")).toBe("ok");
    expect(code("25.5")).toBe("ok");
    expect(code("560")).toBe("ok");
    expect(code("560.000001")).toBe("aboveDue");
    expect(code("100", 99n * UNIT)).toBe("aboveBalance");
    const ok = checkRepay("25", limits, 1_000n * UNIT);
    expect(ok).toEqual({ ok: true, units: 25n * UNIT, expected: 25n * UNIT, min: 25n * UNIT });
  });

  test("v2: at least the late interest estimate", () => {
    const r = checkRepay("1", { owed: 700n * UNIT, minimum: 2n * UNIT }, 1_000n * UNIT);
    expect(r).toEqual({ ok: false, error: { code: "belowLateInterest", min: 2n * UNIT } });
    expect(repayLimits({ dueNow: 0n, lateDue: 0n, lateDueBuffered: 0n, payoff: 9n, estimate: false, arrears: null })).toEqual({ owed: 9n, minimum: 1n });
  });
});

describe("draw checks", () => {
  const approved = lineView({ status: "approved", drawnAt: null, termEnd: 10_000 });
  const pool = { paused: false, vaultAmount: 1_000n * UNIT };
  test("in the program's order: paused, term ended, schedule past the term, liquidity", () => {
    expect(drawBlock(approved, pool, 5_000)).toBeNull();
    expect(drawBlock(approved, { ...pool, paused: true }, 5_000)).toBe("paused");
    expect(drawBlock(approved, pool, 10_001)).toBe("termEnded");
    expect(drawBlock({ ...approved, version: 2, schedule: { intervalSeconds: 1_000n, installments: 6, maxMissed: 2 } }, pool, 5_000)).toBe("schedule");
    expect(drawBlock(approved, { ...pool, vaultAmount: 599n * UNIT }, 5_000)).toBe("liquidity");
  });
});

describe("agreement summary", () => {
  const body = {
    data: {
      id: "a".repeat(32),
      chain: "solana",
      template: { id: "credit-agreement", version: "0.1.0" },
      status: "anchored",
      roles: ["acreditante", "acreditado"],
      partiesCount: 2,
      signaturesCount: 2,
      createdAt: "2026-10-11 12:00:00",
      anchors: [],
      evidenceUrl: `http://api.test/api/agreements/${"a".repeat(32)}/evidence`,
    },
  };

  test("parses what the server sends and refuses anything else", () => {
    expect(parseAgreementSummary(body)).toMatchObject({ id: "a".repeat(32), signaturesCount: 2, roles: ["acreditante", "acreditado"] });
    expect(parseAgreementSummary({ data: { ...body.data, evidenceUrl: "javascript:alert(1)" } })).toBeNull();
    expect(parseAgreementSummary({ data: { ...body.data, template: null } })).toBeNull();
    expect(parseAgreementSummary(null)).toBeNull();
    expect(parseAgreementSummary({ data: { ...body.data, signaturesCount: "2" } })?.signaturesCount).toBeNull();
    expect(agreementCreatedSeconds("2026-10-11 12:00:00")).toBe(Date.UTC(2026, 9, 11, 12) / 1000);
    expect(agreementCreatedSeconds("not a date")).toBeNull();
  });

  test("404 and 400 are 'not found', never thrown; a 500 throws", async () => {
    const reply = (status: number, json: unknown) => (async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
    expect(await fetchAgreementByHash("http://api.test", HASH, undefined, reply(200, body))).toMatchObject({ kind: "found" });
    expect(await fetchAgreementByHash("http://api.test", HASH, undefined, reply(404, { error: "agreement not found" }))).toEqual({ kind: "notFound" });
    expect(await fetchAgreementByHash("http://api.test", HASH, undefined, reply(400, {}))).toEqual({ kind: "notFound" });
    await expect(fetchAgreementByHash("http://api.test", HASH, undefined, reply(500, {}))).rejects.toThrow("500");
  });
});

describe("lines for a wallet", () => {
  test("borrowed first, then sponsored; unreadable lines name nobody", () => {
    const rows: PoolLine[] = [
      { lineId: 0n, address: BORROWER, view: lineView({ lineId: 0n }) },
      { lineId: 1n, address: BORROWER, view: { readable: false, status: "unknown" } },
      { lineId: 2n, address: BORROWER, view: lineView({ lineId: 2n, borrower: SPONSOR, sponsor: BORROWER }) },
      { lineId: 3n, address: BORROWER, view: lineView({ lineId: 3n, borrower: SPONSOR }) },
    ];
    const { borrowed, sponsored } = linesFor(rows, BORROWER);
    expect(borrowed.map((r) => r.lineId)).toEqual([0n]);
    expect(sponsored.map((r) => r.lineId)).toEqual([2n]);
  });
});

// ---- forms with a stand-in for useTx ----

type FakeState = { step: TxStep; error: TxError | null; signature: string | null };

function fakeTx(behavior?: (op: PoolOp) => Promise<TxResult>) {
  let state: FakeState = { step: "idle", error: null, signature: null };
  const listeners = new Set<() => void>();
  const ops: PoolOp[] = [];
  const set = (patch: Partial<FakeState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };
  const run = async (op: PoolOp): Promise<TxResult> => {
    ops.push(op);
    set({ step: "signing" });
    if (!behavior) return new Promise<TxResult>(() => undefined);
    const result = await behavior(op);
    set({ step: "done", signature: result.signature });
    return result;
  };
  function useFake(): UseTx {
    const s = useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => state,
    );
    return { ...s, run, reset: () => set({ step: "idle", error: null, signature: null }) };
  }
  return { ops, useFake };
}

const config: AppConfig = {
  rpcUrl: "http://rpc.test/",
  poolAddress: BORROWER,
  assetMint: SPONSOR,
  apiUrl: "http://api.test",
  explorerCluster: "devnet",
  testWallet: false,
};

let mounted: { root: Root; host: HTMLElement; client: QueryClient } | null = null;
afterEach(async () => {
  if (!mounted) return;
  const { root, host, client } = mounted;
  await act(async () => root.unmount());
  host.remove();
  client.clear();
  mounted = null;
});

async function mount(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false } } });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <ConfigContext.Provider value={config}>
        <QueryClientProvider client={client}>
          <ToastProvider t={en}>{node}</ToastProvider>
        </QueryClientProvider>
      </ConfigContext.Provider>,
    );
  });
  mounted = { root, host, client };
  const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
  return {
    host,
    q,
    text: () => host.textContent ?? "",
    async type(value: string) {
      const input = q<HTMLInputElement>('[data-testid="repay-form"] input')!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
        setter.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
      });
    },
    async click(el: Element | null) {
      if (!el) throw new Error("nothing to click");
      await act(async () => {
        (el as HTMLElement).click();
        await sleep(5);
      });
    },
  };
}

function Repay({ tx, line, balance = 1_000n * UNIT, now = 1_250, grace = 0 }: { tx: ReturnType<typeof fakeTx>; line: LineView; balance?: bigint; now?: number; grace?: number }) {
  return <RepayForm line={line} graceSeconds={grace} balance={balance} now={now} tx={tx.useFake()} t={en} lang="en" />;
}

describe("repay form", () => {
  test("v1: due now is what remains; Max fills it; the op carries the line id and amount", async () => {
    const tx = fakeTx(async () => ({ signature: "RepaySig1" }));
    const line = lineView({ lineId: 7n, principalRepaid: 100n * UNIT });
    const page = await mount(<Repay tx={tx} line={line} />);
    expect(page.q('[data-testid="repay-due-now"]')!.getAttribute("data-amount")).toBe((560n * UNIT).toString());
    expect(page.q('[data-testid="repay-estimate"]')).toBeNull();
    expect(page.text()).toContain(en.app.borrow.repay.orderV1);
    await page.click(page.q('[data-testid="repay-max"]'));
    expect(page.q<HTMLInputElement>('[data-testid="repay-form"] input')!.value).toBe("560");
    expect(page.q('[data-testid="repay-preview"]')!.textContent).toContain("which settles this line");
    await page.type("25");
    await page.click(page.q('[data-testid="repay-submit"]'));
    expect(tx.ops).toEqual([{ kind: "repay", lineId: 7n, amount: 25n * UNIT }]);
  });

  test("Max is the balance when the balance is lower", async () => {
    const page = await mount(<Repay tx={fakeTx()} line={lineView()} balance={40n * UNIT} />);
    await page.click(page.q('[data-testid="repay-max"]'));
    expect(page.q<HTMLInputElement>('[data-testid="repay-form"] input')!.value).toBe("40");
  });

  test("above what is owed: the message under the field, and nothing is sent", async () => {
    const tx = fakeTx();
    const page = await mount(<Repay tx={tx} line={lineView()} />);
    await page.type("660.000001");
    await page.click(page.q('[data-testid="repay-submit"]'));
    expect(tx.ops).toEqual([]);
    expect(page.q('[data-testid="repay-error"]')!.textContent).toBe("This line takes at most 660 tMXN test tokens right now.");
    expect(page.q('[data-testid="repay-error-summary"]')!.getAttribute("role")).toBe("alert");
  });

  test("v2 overdue with late interest: due now includes it, the estimate note shows, less than it is refused", async () => {
    const schedule = { intervalSeconds: 100n, installments: 6, maxMissed: 2 };
    const line = lineView({ version: 2, status: "inCollection", schedule, lateInterest: { lateBps: 10_000, collected: 0n, paidUntil: null } });
    const figures = repayFigures(line, 0, 50_000n);
    expect(figures.lateDue).toBeGreaterThan(0n);
    const tx = fakeTx();
    const page = await mount(<Repay tx={tx} line={line} now={50_000} />);
    expect(page.q('[data-testid="repay-due-now"]')!.getAttribute("data-amount")).toBe(figures.dueNow.toString());
    expect(page.q('[data-testid="repay-estimate"]')!.textContent).toBe(en.app.borrow.repay.estimate);
    await page.type("0.000001");
    await page.click(page.q('[data-testid="repay-submit"]'));
    expect(tx.ops).toEqual([]);
    expect(page.q('[data-testid="repay-error"]')!.textContent).toContain("the late interest due on this line comes first");
  });
});

describe("draw action", () => {
  const approved = lineView({ lineId: 4n, status: "approved", drawnAt: null, termEnd: 4_000_000_000 });

  test("one click sends the draw for the line; the wallet signature is the confirmation", async () => {
    const tx = fakeTx(async () => ({ signature: "DrawSig1" }));
    function Draw() {
      return <DrawAction line={approved} pool={{ paused: false, vaultAmount: 10_000n * UNIT }} now={2_000_000_000} tx={tx.useFake()} t={en} lang="en" />;
    }
    const page = await mount(<Draw />);
    expect(page.q('[data-testid="draw"]')!.textContent).toContain("600");
    await page.click(page.q('[data-testid="draw-submit"]'));
    expect(tx.ops).toEqual([{ kind: "draw", lineId: 4n }]);
  });

  test("paused: the button is disabled with the reason", async () => {
    const tx = fakeTx();
    function Draw() {
      return <DrawAction line={approved} pool={{ paused: true, vaultAmount: 10_000n * UNIT }} now={2_000_000_000} tx={tx.useFake()} t={en} lang="en" />;
    }
    const page = await mount(<Draw />);
    const button = page.q<HTMLButtonElement>('[data-testid="draw-submit"]')!;
    expect(button.disabled).toBe(true);
    expect(page.q('[data-testid="draw-note"]')!.textContent).toBe(en.app.borrow.draw.pausedNote);
    expect(button.getAttribute("aria-describedby")).toBe(page.q('[data-testid="draw-note"]')!.id);
    await page.click(button);
    expect(tx.ops).toEqual([]);
  });
});
