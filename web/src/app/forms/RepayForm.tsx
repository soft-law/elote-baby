// Repay a credit line. Anyone may repay: the borrower, the sponsor or a third party, from their own
// test tokens. Partial repayments are allowed; there is no slippage floor. A single-maturity (v1)
// line takes at most what remains. A scheduled (v2) line first settles its late interest, so the
// amount must cover the late interest estimated at this moment; it takes at most what is due and
// the rest stays in the wallet. "Due now" and late interest come from pool/schedule at `now`.
import { Amount } from "../components/Amount";
import { fill } from "../fill";
import { ASSET_SYMBOL } from "../../pool/format";
import type { LineView } from "../../pool/line";
import { DECIMALS } from "../../pool/math";
import { repayFigures, type RepayFigures } from "../../pool/schedule";
import type { Copy, Lang } from "../../translations";
import type { UseTx } from "../../tx/useTx";
import { AmountForm } from "./AmountForm";
import { fieldErrorText } from "./errors";
import { checkRepay, type RepayLimits } from "./validation";

export type RepayFormProps = {
  line: LineView;
  /** The pool's grace period in seconds (late interest of scheduled lines). */
  graceSeconds: number;
  /** Test token balance in base units; undefined while it loads or when it failed. */
  balance: bigint | undefined;
  /** Unix seconds for the late interest estimate. */
  now: number;
  tx: UseTx;
  t: Copy;
  lang: Lang;
};

/** The limits the form checks: at most the payoff, at least the late interest a v2 line settles first. */
export function repayLimits(figures: RepayFigures): RepayLimits {
  return { owed: figures.payoff, minimum: figures.lateDueBuffered > 0n ? figures.lateDueBuffered : 1n };
}

export function RepayForm({ line, graceSeconds, balance, now, tx, t, lang }: RepayFormProps) {
  const r = t.app.borrow.repay;
  const figures = repayFigures(line, graceSeconds, BigInt(now));
  const limits = repayLimits(figures);
  const max = balance === undefined ? null : balance < figures.payoff ? balance : figures.payoff;
  const settles = line.remaining + figures.lateDue;
  const amount = (units: bigint) => (
    <span className="num font-semibold text-ink">
      <Amount units={units} lang={lang} visibleDecimals={DECIMALS} />
    </span>
  );
  return (
    <AmountForm
      name="repay"
      headingLevel="h4"
      t={t}
      title={r.title}
      sub={r.sub}
      label={r.label}
      unit={ASSET_SYMBOL}
      available={balance === undefined ? null : fill(r.available, { amount: <Amount units={balance} lang={lang} visibleDecimals={DECIMALS} /> })}
      maxText={r.max}
      maxLabel={r.maxLabel}
      max={max}
      check={(input) => checkRepay(input, limits, balance ?? 0n)}
      preview={({ units }) => (
        <span data-testid="repay-quote" data-amount={units.toString()}>
          {fill(units >= settles ? r.previewSettles : r.preview, { amount: amount(units) })}
        </span>
      )}
      previewEmpty={r.previewEmpty}
      notes={
        <div className="flex flex-col gap-2 rounded-[14px] bg-mist px-4 py-3 text-[16px] leading-[1.55] text-ink">
          <p className="m-0 font-semibold" data-testid="repay-due-now" data-amount={figures.dueNow.toString()}>
            {fill(r.dueNow, { amount: amount(figures.dueNow) })}
          </p>
          {figures.estimate ? (
            <p className="m-0 text-ink-soft" data-testid="repay-estimate">
              {r.estimate}
            </p>
          ) : null}
          <p className="m-0 text-ink-soft">{figures.estimate ? r.orderV2 : r.orderV1}</p>
        </div>
      }
      errorText={(error) => fieldErrorText(error, t, lang)}
      blocked={balance === undefined}
      submitText={r.submit}
      toOp={({ units }) => ({ kind: "repay", lineId: line.lineId, amount: units })}
      tx={tx}
    />
  );
}
