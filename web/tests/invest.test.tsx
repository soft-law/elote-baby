import "./support/dom";
import { afterEach, describe, expect, test } from "bun:test";
import type { Address } from "@solana/kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AppConfig } from "../src/app/config";
import { ConfigContext } from "../src/app/configContext";
import { DepositForm } from "../src/app/forms/DepositForm";
import { RedeemForm } from "../src/app/forms/RedeemForm";
import { checkDeposit, checkRedeem, redeemLimit } from "../src/app/forms/validation";
import { ToastProvider } from "../src/app/toast/Toast";
import { toastSteps } from "../src/app/toast/useTxToast";
import { formatAmount } from "../src/pool/format";
import {
  DEAD_SHARES,
  MIN_FIRST_DEPOSIT,
  assetsForRedeem,
  format,
  maxRedeemableShares,
  sharesForDeposit,
  withTolerance,
} from "../src/pool/math";
import type { PoolOp } from "../src/tx/ops";
import { TxFailedError, TxRejectedError, type TxError, type TxResult } from "../src/tx/tx";
import type { TxStep, UseTx } from "../src/tx/useTx";
import { translations, type Copy } from "../src/translations";

const UNIT = 1_000_000n;
const en: Copy = translations.en;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A pool with value per share 1.0666: 10,000 on hand, 6,000 lent out, 15,000 shares. */
const POOL = { vaultAmount: 10_000n * UNIT, nav: 16_000n * UNIT, supply: 15_000n * UNIT, paused: false };
const EMPTY_POOL = { vaultAmount: 0n, nav: 0n, supply: 0n, paused: false };

// ---- a useTx stand-in, steered by the test (the module boundary the forms take as a prop) ----

type FakeState = { step: TxStep; error: TxError | null; signature: string | null };

function fakeTx(behavior?: (op: PoolOp, set: (patch: Partial<FakeState>) => void) => Promise<TxResult>) {
  let state: FakeState = { step: "idle", error: null, signature: null };
  const listeners = new Set<() => void>();
  const ops: PoolOp[] = [];
  let resets = 0;
  const set = (patch: Partial<FakeState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };
  const run = async (op: PoolOp): Promise<TxResult> => {
    ops.push(op);
    set({ step: "simulating", error: null, signature: null });
    if (!behavior) return new Promise<TxResult>(() => undefined);
    try {
      const result = await behavior(op, set);
      set({ step: "done", signature: result.signature });
      return result;
    } catch (error) {
      set({ step: "error", error: error as TxError });
      throw error;
    }
  };
  const reset = () => {
    resets += 1;
    set({ step: "idle", error: null, signature: null });
  };
  function useFake(): UseTx {
    const s = useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => state,
    );
    return { ...s, run, reset };
  }
  return { ops, set, useFake, resets: () => resets };
}

// ---- mounting ----

const config: AppConfig = {
  rpcUrl: "http://rpc.test/",
  poolAddress: "BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM" as Address,
  assetMint: "So11111111111111111111111111111111111111112" as Address,
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
    input: (name: string) => q<HTMLInputElement>(`[data-testid="${name}-form"] input`)!,
    async type(name: string, value: string) {
      const input = q<HTMLInputElement>(`[data-testid="${name}-form"] input`)!;
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!;
        setter.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
      });
    },
    async blur(name: string) {
      const input = q<HTMLInputElement>(`[data-testid="${name}-form"] input`)!;
      await act(async () => {
        input.focus();
        input.blur();
      });
    },
    async click(el: Element | null) {
      if (!el) throw new Error("nothing to click");
      await act(async () => (el as HTMLElement).click());
    },
    async submit(name: string) {
      await act(async () => {
        q<HTMLButtonElement>(`[data-testid="${name}-submit"]`)!.click();
        await sleep(5);
      });
    },
    async until(check: () => boolean, label: string) {
      for (let i = 0; i < 200; i++) {
        if (check()) return;
        await act(async () => sleep(5));
      }
      throw new Error(`timed out waiting for ${label}: ${host.textContent}`);
    },
  };
}

function Deposit({ tx, pool = POOL, balance = 5_000n * UNIT }: { tx: ReturnType<typeof fakeTx>; pool?: typeof POOL; balance?: bigint }) {
  return <DepositForm pool={pool} balance={balance} tx={tx.useFake()} t={en} lang="en" />;
}

function Redeem({ tx, pool = POOL, shares }: { tx: ReturnType<typeof fakeTx>; pool?: typeof POOL; shares: bigint }) {
  return <RedeemForm pool={pool} shares={shares} tx={tx.useFake()} t={en} lang="en" />;
}

const program = (name: string, code: number) => new TxFailedError("program", { programCode: code, programErrorName: name });

// ---- pure checks ----

describe("validation", () => {
  test("deposit rules: required, number, decimals, zero, balance, first deposit, shares", () => {
    const code = (input: string, pool = POOL, balance = 100n * UNIT) => {
      const r = checkDeposit(input, pool, balance);
      return r.ok ? "ok" : r.error.code;
    };
    expect(code("")).toBe("required");
    expect(code("abc")).toBe("invalid");
    expect(code("-1")).toBe("invalid");
    expect(code("1.1234567")).toBe("tooManyDecimals");
    expect(code("0")).toBe("zero");
    expect(code("100.000001")).toBe("aboveBalance");
    expect(code("100")).toBe("ok");
    expect(code("0.5", EMPTY_POOL)).toBe("firstDepositTooSmall");
    expect(code("1", EMPTY_POOL)).toBe("ok");
    // One base unit buys no share at 1.0666 per share.
    expect(code("0.000001")).toBe("zeroShares");
  });

  test("the deposit floor is withTolerance of the expected shares", () => {
    const r = checkDeposit("250", POOL, 1_000n * UNIT);
    if (!r.ok) throw new Error(r.error.code);
    expect(r.expected).toBe(sharesForDeposit(250n * UNIT, POOL.nav, POOL.supply));
    expect(r.min).toBe(withTolerance(r.expected));
    expect(r.min).toBeLessThan(r.expected);
  });

  test("redeem rules: shares held, liquidity cap, too small", () => {
    const pool = { ...POOL, vaultAmount: 1_000n * UNIT };
    const cap = maxRedeemableShares(pool.vaultAmount, pool.nav, pool.supply);
    const held = 5_000n * UNIT;
    expect(redeemLimit(pool, held)).toEqual({ max: cap, cap, capped: true });
    expect(redeemLimit(POOL, 10n * UNIT)).toMatchObject({ max: 10n * UNIT, capped: false });
    const code = (input: string) => {
      const r = checkRedeem(input, pool, held);
      return r.ok ? "ok" : r.error.code;
    };
    expect(code("5000.000001")).toBe("aboveShares");
    expect(code(format(cap + 1n))).toBe("aboveLiquidity");
    expect(code(format(cap))).toBe("ok");
    expect(code("0")).toBe("zero");
  });
});

// ---- Review Focus 1: the floor shown is the floor sent; a NAV move fails with SlippageExceeded ----

describe("Review Focus 1: slippage floor", () => {
  test("deposit: the minimum shown equals minSharesOut, and a NAV change gives the SlippageExceeded copy with Try again", async () => {
    // The program sees the pool after a repayment raised its value: fewer shares per test token.
    const navAtSend = POOL.nav + 100n * UNIT;
    const tx = fakeTx(async (op, set) => {
      if (op.kind !== "deposit") throw new Error("expected a deposit");
      set({ step: "signing" });
      set({ step: "sending", signature: "5igSig" });
      const paid = sharesForDeposit(op.assets, navAtSend, POOL.supply);
      if (paid < op.minSharesOut) throw program("SlippageExceeded", 6011);
      return { signature: "5igSig" };
    });
    const page = await mount(<Deposit tx={tx} />);
    await page.type("deposit", "1000");
    const quote = page.q('[data-testid="deposit-quote"]')!;
    const shownMin = BigInt(quote.getAttribute("data-min")!);
    const expected = sharesForDeposit(1_000n * UNIT, POOL.nav, POOL.supply);
    expect(shownMin).toBe(withTolerance(expected));
    expect(page.q('[data-testid="deposit-min"]')!.textContent).toBe(formatAmount(shownMin, "en", 6));
    expect(page.q('[data-testid="deposit-preview"]')!.textContent).toContain(`minimum ${formatAmount(shownMin, "en", 6)}`);

    await page.submit("deposit");
    expect(tx.ops).toEqual([{ kind: "deposit", assets: 1_000n * UNIT, minSharesOut: shownMin }]);

    await page.until(() => page.q('[data-testid="toast"][data-tone="error"]') !== null, "error toast");
    const toast = page.q('[data-testid="toast"]')!;
    expect(page.q('[data-testid="toast-message"]')!.textContent).toBe(en.app.tx.errors.program.slippageExceeded);
    const retry = [...toast.querySelectorAll("button")].find((b) => b.textContent === en.app.toast.retry);
    expect(retry).toBeDefined();
    // The explorer link stays: the signature existed before the failure.
    expect(page.q('[data-testid="toast-explorer"]')!.getAttribute("href")).toContain("/tx/5igSig?cluster=devnet");

    // Try again returns to the form; it never sends again by itself.
    await page.click(retry!);
    expect(page.q('[data-testid="toast"]')).toBeNull();
    expect(tx.resets()).toBe(1);
    expect(tx.ops).toHaveLength(1);
    expect(document.activeElement).toBe(page.input("deposit"));
    expect(page.input("deposit").value).toBe("1000");
  });

  test("redeem: the minimum shown equals minAssetsOut", async () => {
    const tx = fakeTx();
    const page = await mount(<Redeem tx={tx} shares={2_000n * UNIT} />);
    await page.type("redeem", "1500.5");
    const shownMin = BigInt(page.q('[data-testid="redeem-quote"]')!.getAttribute("data-min")!);
    const expected = assetsForRedeem(1_500_500_000n, POOL.nav, POOL.supply);
    expect(shownMin).toBe(withTolerance(expected));
    expect(page.q('[data-testid="redeem-min"]')!.textContent).toBe(formatAmount(shownMin, "en", 6));
    await page.submit("redeem");
    expect(tx.ops).toEqual([{ kind: "redeem", shares: 1_500_500_000n, minAssetsOut: shownMin }]);
  });
});

// ---- Review Focus 2: first deposit ----

describe("Review Focus 2: first deposit", () => {
  test("0.5 tMXN on an empty pool is rejected with the program's FirstDepositTooSmall copy, and the locked units are explained", async () => {
    const tx = fakeTx();
    const page = await mount(<Deposit tx={tx} pool={EMPTY_POOL} balance={10n * UNIT} />);
    const note = page.q('[data-testid="first-deposit-note"]')!;
    expect(note.textContent).toBe(en.app.invest.deposit.firstNote);
    expect(note.textContent).toContain("1,000 base units");
    expect(note.textContent).toContain("1 tMXN");
    expect(DEAD_SHARES).toBe(1_000n);
    expect(MIN_FIRST_DEPOSIT).toBe(UNIT);

    await page.type("deposit", "0.5");
    await page.blur("deposit");
    expect(page.q('[data-testid="deposit-error"]')!.textContent).toBe(en.app.tx.errors.program.firstDepositTooSmall);

    await page.submit("deposit");
    expect(tx.ops).toEqual([]);
    const summary = page.q('[data-testid="deposit-error-summary"]')!;
    expect(summary.textContent).toContain(en.app.tx.errors.program.firstDepositTooSmall);

    // Exactly 1 tMXN is accepted, and the preview subtracts the locked units.
    await page.type("deposit", "1");
    expect(page.q('[data-testid="deposit-quote"]')!.getAttribute("data-expected")).toBe((UNIT - DEAD_SHARES).toString());
  });

  test("the note is absent once the pool has shares", async () => {
    const page = await mount(<Deposit tx={fakeTx()} />);
    expect(page.q('[data-testid="first-deposit-note"]')).toBeNull();
  });
});

// ---- Review Focus 3: liquidity cap ----

describe("Review Focus 3: redeem without enough liquidity", () => {
  test("Max is maxRedeemableShares, the notice says liquidity is the limit, and more is rejected here", async () => {
    // Vault 10,000 of NAV 16,000: the cap is floor(10,000 * 15,000 / 16,000) = 9,375 shares.
    const held = 12_000n * UNIT;
    const cap = maxRedeemableShares(POOL.vaultAmount, POOL.nav, POOL.supply);
    expect(cap).toBe(9_375n * UNIT);
    const tx = fakeTx();
    const page = await mount(<Redeem tx={tx} shares={held} />);
    const notice = page.q('[data-testid="liquidity-notice"]')!;
    expect(notice.textContent).toContain("9,375");
    expect(notice.textContent).toContain("10,000");

    await page.click(page.q('[data-testid="redeem-max"]'));
    expect(page.input("redeem").value).toBe(format(cap));
    expect(page.q('[data-testid="redeem-error"]')).toBeNull();

    await page.type("redeem", format(cap + 1n));
    await page.blur("redeem");
    expect(page.q('[data-testid="redeem-error"]')!.textContent).toBe(en.app.invest.errors.aboveLiquidity.replace("{max}", "9,375"));
    await page.submit("redeem");
    expect(tx.ops).toEqual([]);
  });

  test("no notice when your shares fit within the liquidity; Max is your shares", async () => {
    const page = await mount(<Redeem tx={fakeTx()} shares={100n * UNIT} />);
    expect(page.q('[data-testid="liquidity-notice"]')).toBeNull();
    await page.click(page.q('[data-testid="redeem-max"]'));
    expect(page.input("redeem").value).toBe("100");
  });
});

// ---- validation display and focus ----

describe("form validation display", () => {
  test("messages appear on blur, not while typing, and sit under the field", async () => {
    const page = await mount(<Deposit tx={fakeTx()} balance={50n * UNIT} />);
    const cases: Array<[string, string]> = [
      ["abc", en.app.invest.errors.invalid],
      ["1.1234567", en.app.invest.errors.tooManyDecimals],
      ["0", en.app.invest.errors.zero],
      ["50.01", en.app.invest.errors.aboveBalance],
    ];
    await page.type("deposit", "abc");
    expect(page.q('[data-testid="deposit-error"]')).toBeNull();
    for (const [value, message] of cases) {
      await page.type("deposit", value);
      await page.blur("deposit");
      const error = page.q('[data-testid="deposit-error"]')!;
      expect(error.textContent).toBe(message);
      const input = page.input("deposit");
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toContain(error.id);
      expect(input.getAttribute("inputmode")).toBe("decimal");
    }
  });

  test("a failed submit focuses the error summary (role alert, tabIndex -1)", async () => {
    const tx = fakeTx();
    const page = await mount(<Deposit tx={tx} />);
    await page.submit("deposit");
    const summary = page.q<HTMLElement>('[data-testid="deposit-error-summary"]')!;
    expect(summary.getAttribute("role")).toBe("alert");
    expect(summary.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(summary);
    expect(summary.textContent).toContain(en.app.invest.errors.required);
    expect(page.q('[data-testid="deposit-error"]')!.textContent).toBe(en.app.invest.errors.required);
    expect(tx.ops).toEqual([]);
    // The link in the summary moves focus to the field.
    await page.click(summary.querySelector("a"));
    expect(document.activeElement).toBe(page.input("deposit"));
    // A valid amount clears it.
    await page.type("deposit", "10");
    expect(page.q('[data-testid="deposit-error-summary"]')).toBeNull();
  });

  test("a paused pool disables submit", async () => {
    const page = await mount(<Deposit tx={fakeTx()} pool={{ ...POOL, paused: true }} />);
    expect(page.q<HTMLButtonElement>('[data-testid="deposit-submit"]')!.disabled).toBe(true);
  });
});

// ---- toast ----

describe("transaction toast", () => {
  test("steps follow useTx step, the explorer link appears with the signature, the button reads Signing…", async () => {
    const tx = fakeTx();
    const page = await mount(<Deposit tx={tx} />);
    const region = page.host.querySelector('[data-testid="toast-region"]')!;
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.getAttribute("role")).toBe("status");

    await page.type("deposit", "10");
    await page.submit("deposit");
    const statuses = () => [...page.host.querySelectorAll('[data-testid="toast-steps"] li')].map((li) => li.getAttribute("data-status"));
    const labels = () => [...page.host.querySelectorAll('[data-testid="toast-steps"] li')].map((li) => li.textContent);
    expect(labels()).toEqual([en.app.toast.sign, en.app.toast.confirming, en.app.toast.updated]);
    expect(labels()).toEqual(["Sign in wallet", "Confirming", "Updated"]);
    expect(statuses()).toEqual(["active", "waiting", "waiting"]);
    expect(page.q('[data-testid="deposit-submit"]')!.textContent).toBe(en.app.tx.signingButton);
    expect(page.q<HTMLButtonElement>('[data-testid="deposit-submit"]')!.disabled).toBe(true);
    expect(page.q('[data-testid="toast-explorer"]')).toBeNull();

    await act(async () => tx.set({ step: "signing" }));
    expect(statuses()).toEqual(["active", "waiting", "waiting"]);
    await act(async () => tx.set({ step: "sending", signature: "SigABC" }));
    expect(statuses()).toEqual(["done", "active", "waiting"]);
    expect(page.q('[data-testid="toast-explorer"]')!.getAttribute("href")).toBe("https://explorer.solana.com/tx/SigABC?cluster=devnet");
    await act(async () => tx.set({ step: "confirming" }));
    expect(statuses()).toEqual(["done", "active", "waiting"]);
    await act(async () => tx.set({ step: "done" }));
    expect(statuses()).toEqual(["done", "done", "done"]);
    expect(page.q('[data-testid="toast"]')!.getAttribute("data-tone")).toBe("success");
    expect(page.q('[data-testid="deposit-submit"]')!.textContent).toBe(en.app.invest.deposit.submit);
    expect(page.host.querySelectorAll('[data-testid="toast"]')).toHaveLength(1);
  });

  test("a failure marks the step it stopped at", () => {
    expect(toastSteps("error", en, "confirming").map((s) => s.status)).toEqual(["done", "error", "waiting"]);
    expect(toastSteps("error", en, "signing").map((s) => s.status)).toEqual(["error", "waiting", "waiting"]);
  });

  test("declining in the wallet is a neutral note without Try again", async () => {
    const tx = fakeTx(async () => {
      throw new TxRejectedError();
    });
    const page = await mount(<Deposit tx={tx} />);
    await page.type("deposit", "10");
    await page.submit("deposit");
    await page.until(() => page.q('[data-testid="toast-message"]') !== null, "cancel note");
    const toast = page.q('[data-testid="toast"]')!;
    expect(toast.getAttribute("data-tone")).toBe("info");
    expect(page.q('[data-testid="toast-message"]')!.textContent).toBe(en.app.tx.errors.rejected);
    expect([...toast.querySelectorAll("button")].some((b) => b.textContent === en.app.toast.retry)).toBe(false);
  });

  test("a confirmed deposit clears the field", async () => {
    const tx = fakeTx(async () => ({ signature: "Done1" }));
    const page = await mount(<Deposit tx={tx} />);
    await page.type("deposit", "10");
    await page.submit("deposit");
    await page.until(() => page.q('[data-testid="toast"][data-tone="success"]') !== null, "success toast");
    expect(page.input("deposit").value).toBe("");
  });
});
