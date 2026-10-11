// One credit line on the borrower page: status, figures, the agreement hash (with the summary and
// evidence link when the API knows it), the installment schedule and late interest of a scheduled
// line, and the action the status allows: Draw on an approved line, the repayment form on an
// active or in-collection line. Lines this code cannot read show the "Unknown" badge and nothing
// else, so a new layout never breaks the page. Every known line ends with its history, read only
// when its disclosure is opened. Cards at every width, no tables.
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { fill, fillText } from "../fill";
import { RepayForm } from "../forms/RepayForm";
import { useHistoryQuery } from "../history";
import type { PoolLine, PoolView } from "../queries";
import { useTxToast } from "../toast/useTxToast";
import { explorerAddressUrl, formatBps, formatDate, formatDuration, truncateMiddle, type ExplorerCluster } from "../../pool/format";
import type { LineView } from "../../pool/line";
import { DECIMALS } from "../../pool/math";
import { repayFigures, usableSchedule } from "../../pool/schedule";
import type { Copy, Lang } from "../../translations";
import { useTx, type UseTx } from "../../tx/useTx";
import { isTxBusy } from "../txBusy";
import { AgreementBlock } from "./AgreementBlock";
import { Amount } from "./Amount";
import { Field, money } from "./Field";
import { HistoryBody } from "./HistoryList";
import { LineStatusBadge, drawnAmount, repaidAmount } from "./LinesTable";
import { ScheduleBlock } from "./ScheduleBlock";

function LateInterestBlock({ line, pool, now, t, lang }: { line: LineView; pool: PoolView; now: number; t: Copy; lang: Lang }) {
  const l = t.app.borrow.late;
  const late = line.lateInterest;
  if (!late) return null;
  const owing = line.status === "active" || line.status === "inCollection";
  const figures = owing ? repayFigures(line, pool.graceSeconds, BigInt(now)) : null;
  return (
    <section data-testid="late-interest" className="flex flex-col gap-2">
      <h4 className="m-0 font-display text-[18px] font-semibold">{l.title}</h4>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Field label={l.rate}>
          <span className="num">{formatBps(late.lateBps, lang)}</span>
        </Field>
        <Field label={l.collected}>{money(late.collected, lang)}</Field>
        {figures?.arrears ? <Field label={l.dueNow}>{money(figures.lateDue, lang)}</Field> : null}
      </dl>
      <p className="m-0 text-[15px] leading-[1.55] text-ink-soft">
        {pool.graceSeconds > 0 ? fillText(l.grace, { grace: formatDuration(pool.graceSeconds, lang) }) : l.noGrace}
      </p>
    </section>
  );
}

// ---- history ----

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

/** The line's last transactions behind a disclosure: nothing is read until it is opened. */
export function LineHistory({ row, pool, t, lang, cluster }: { row: PoolLine; pool: Pick<PoolView, "address">; t: Copy; lang: Lang; cluster: ExplorerCluster }) {
  const h = t.app.history;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const query = useHistoryQuery("line", row.address, { enabled: open });
  const label = `${h.lineToggle}, ${fillText(t.app.borrow.line, { id: `#${row.lineId.toString()}` })}`;
  return (
    <section data-testid="line-history" className="flex flex-col gap-3 border-t-[1.5px] border-line pt-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-testid="line-history-toggle"
        className="inline-flex min-h-[44px] items-center gap-2 self-start font-display text-[17px] font-semibold text-teal-700 hover:text-teal-800"
      >
        {h.lineToggle}
        <Chevron open={open} />
      </button>
      <div id={panelId} hidden={!open} className="flex flex-col gap-3">
        {open ? (
          <>
            <p className="m-0 text-[15px] leading-[1.55] text-ink-soft">{h.lineSub}</p>
            <HistoryBody query={query} scope={{ kind: "line", pool: pool.address, lineId: row.lineId }} t={t} lang={lang} cluster={cluster} label={label} />
          </>
        ) : null}
      </div>
    </section>
  );
}

// ---- draw ----

export type DrawBlock = "paused" | "liquidity" | "termEnded" | "schedule" | null;

/** Why the program would refuse a draw right now, checked in its order; null when it may go. */
export function drawBlock(line: LineView, pool: Pick<PoolView, "paused" | "vaultAmount">, now: number): DrawBlock {
  if (pool.paused) return "paused";
  if (line.termEnd !== null && now > line.termEnd) return "termEnded";
  if (usableSchedule(line.schedule) && line.termEnd !== null) {
    const lastDue = BigInt(now) + line.schedule.intervalSeconds * BigInt(line.schedule.installments);
    if (lastDue > BigInt(line.termEnd)) return "schedule";
  }
  if (line.principal > pool.vaultAmount) return "liquidity";
  return null;
}

export type DrawActionProps = {
  line: LineView;
  pool: Pick<PoolView, "paused" | "vaultAmount">;
  now: number;
  tx: UseTx;
  t: Copy;
  lang: Lang;
};

/** Draw the whole principal. The wallet signature is the confirmation; the toast follows the steps. */
export function DrawAction({ line, pool, now, tx, t, lang }: DrawActionProps) {
  const d = t.app.borrow.draw;
  const queryClient = useQueryClient();
  const noteId = useId();
  const titleId = useId();
  const busy = isTxBusy(tx.step);
  const block = drawBlock(line, pool, now);
  const note =
    block === "paused" ? d.pausedNote : block === "liquidity" ? d.liquidityNote : block === "termEnded" ? d.termEndedNote : block === "schedule" ? d.scheduleNote : null;

  useTxToast(tx, {
    op: "draw",
    t,
    onRetry: () => {
      tx.reset();
      void queryClient.invalidateQueries({ queryKey: ["pool"] });
      void queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });

  const onDraw = async () => {
    if (busy || block) return;
    try {
      await tx.run({ kind: "draw", lineId: line.lineId });
    } catch {
      // useTx keeps the typed error; the toast shows it with "Try again".
    }
  };

  return (
    <section aria-labelledby={titleId} data-testid="draw" className="flex flex-col gap-4 rounded-[24px] border-[1.5px] border-line bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
      <div className="flex flex-col gap-1.5">
        <h4 id={titleId} className="m-0 text-[24px] font-bold leading-tight">
          {d.title}
        </h4>
        <p className="m-0 text-[17px] leading-[1.55] text-ink-soft">
          {fill(d.body, {
            amount: (
              <span className="num font-semibold text-ink">
                <Amount units={line.principal} lang={lang} visibleDecimals={DECIMALS} />
              </span>
            ),
          })}
        </p>
      </div>
      {note ? (
        <p id={noteId} data-testid="draw-note" data-reason={block ?? undefined} className="m-0 rounded-[14px] border-[1.5px] border-corn-300 bg-corn-100 px-4 py-3 text-[16px] leading-[1.55] text-ink">
          {note}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void onDraw()}
        disabled={busy || block !== null}
        aria-busy={busy}
        aria-describedby={note ? noteId : undefined}
        data-testid="draw-submit"
        className="inline-flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-teal-700 px-5 font-display text-[18px] font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? t.app.tx.signingButton : d.submit}
      </button>
    </section>
  );
}

// ---- the card ----

export type LineCardProps = {
  row: PoolLine;
  pool: PoolView;
  /** Test token balance of the connected wallet; undefined while it loads or when it failed. */
  balance: bigint | undefined;
  now: number;
  t: Copy;
  lang: Lang;
  cluster: ExplorerCluster;
  /** Which party the card names besides the connected wallet. */
  counterpart: "sponsor" | "borrower";
};

function PartyLink({ address, cluster, t }: { address: string; cluster: ExplorerCluster; t: Copy }) {
  return (
    <a
      href={explorerAddressUrl(address, cluster)}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="num inline-flex min-h-[44px] items-center text-[15px] text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
    >
      {truncateMiddle(address)}
      <span className="sr-only"> ({t.app.newTab})</span>
    </a>
  );
}

function LineFigures({ line, t, lang, cluster, counterpart }: { line: LineView; t: Copy; lang: Lang; cluster: ExplorerCluster; counterpart: "sponsor" | "borrower" }) {
  const f = t.app.borrow.fields;
  const other = counterpart === "sponsor" ? line.sponsor : line.borrower;
  return (
    <dl data-testid="line-figures" className="m-0 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
      <Field label={f.principal}>{money(line.principal, lang)}</Field>
      <Field label={f.rate}>
        <span className="num">{formatBps(line.rateBps, lang)}</span>
      </Field>
      <Field label={f.interest}>{money(line.interestDue, lang)}</Field>
      <Field label={f.drawn}>{money(drawnAmount(line), lang)}</Field>
      <Field label={f.repaid}>{money(repaidAmount(line), lang)}</Field>
      <Field label={f.remaining}>{money(line.remaining, lang)}</Field>
      <Field label={f.termEnd}>{line.termEnd === null ? t.app.pool.noDate : formatDate(line.termEnd, lang)}</Field>
      {line.drawnAt !== null ? <Field label={f.drawnAt}>{formatDate(line.drawnAt, lang)}</Field> : null}
      {other ? (
        <Field label={counterpart === "sponsor" ? f.sponsor : f.borrower}>
          <PartyLink address={other} cluster={cluster} t={t} />
        </Field>
      ) : null}
    </dl>
  );
}

export function LineCard({ row, pool, balance, now, t, lang, cluster, counterpart }: LineCardProps) {
  const b = t.app.borrow;
  const titleId = useId();
  // Both hooks run on every card so hook order never depends on the status.
  const drawTx = useTx();
  const repayTx = useTx();
  const { view } = row;
  const known = view.readable && view.status !== "unknown";

  let action: ReactNode = null;
  if (view.readable && view.status === "approved") {
    action = <DrawAction line={view} pool={pool} now={now} tx={drawTx} t={t} lang={lang} />;
  } else if (view.readable && (view.status === "active" || view.status === "inCollection")) {
    action = <RepayForm line={view} graceSeconds={pool.graceSeconds} balance={balance} now={now} tx={repayTx} t={t} lang={lang} />;
  }

  return (
    <article
      aria-labelledby={titleId}
      data-line={row.lineId.toString()}
      data-status={view.status}
      className="flex flex-col gap-5 rounded-[24px] border-[1.5px] border-line bg-white p-5 md:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={titleId} className="m-0 text-[22px] font-bold leading-tight md:text-[26px]">
          {fillText(b.line, { id: `#${row.lineId.toString()}` })}
        </h3>
        <LineStatusBadge status={view.status} labels={t.app.pool.status} />
      </div>

      {!known ? (
        <p data-testid="line-unknown" className="m-0 text-[17px] leading-[1.55] text-ink-soft">
          {b.unknownBody}
        </p>
      ) : (
        <div className={`grid grid-cols-1 gap-6 ${action ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]" : ""}`}>
          <div className="flex min-w-0 flex-col gap-5">
            {view.status === "inCollection" ? (
              <p role="status" data-testid="in-collection" className="m-0 rounded-[14px] border-[1.5px] border-corn-300 bg-corn-100 px-4 py-3 text-[16px] leading-[1.55] text-ink">
                {b.inCollection}
              </p>
            ) : null}
            <LineFigures line={view} t={t} lang={lang} cluster={cluster} counterpart={counterpart} />
            {view.status === "repaid" ? <p className="m-0 text-[16px] text-ink-soft">{b.repaidNote}</p> : null}
            {view.status === "writtenOff" ? <p className="m-0 text-[16px] text-ink-soft">{b.writtenOffNote}</p> : null}
            <AgreementBlock hashHex={view.agreementHashHex} t={t} lang={lang} />
            <ScheduleBlock line={view} now={now} t={t} lang={lang} />
            <LateInterestBlock line={view} pool={pool} now={now} t={t} lang={lang} />
          </div>
          {action ? <div className="min-w-0">{action}</div> : null}
        </div>
      )}
      {known ? <LineHistory row={row} pool={pool} t={t} lang={lang} cluster={cluster} /> : null}
    </article>
  );
}

