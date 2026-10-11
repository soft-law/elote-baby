// One credit line on the borrower page: status, figures, the agreement hash (with the summary and
// evidence link when the API knows it), the installment schedule and late interest of a scheduled
// line, and the action the status allows: Draw on an approved line, the repayment form on an
// active or in-collection line. Lines this code cannot read show the "Unknown" badge and nothing
// else, so a new layout never breaks the page. Cards at every width, no tables.
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import { useAgreementQuery, type AgreementSummary } from "../agreement";
import { fill, fillText } from "../fill";
import { RepayForm } from "../forms/RepayForm";
import type { PoolLine, PoolView } from "../queries";
import { useTxToast } from "../toast/useTxToast";
import { explorerAddressUrl, formatBps, formatDate, formatDuration, truncateMiddle, type ExplorerCluster } from "../../pool/format";
import type { LineView } from "../../pool/line";
import { DECIMALS } from "../../pool/math";
import { installmentRows, repayFigures, usableSchedule, type InstallmentState } from "../../pool/schedule";
import type { Copy, Lang } from "../../translations";
import { useTx, type UseTx } from "../../tx/useTx";
import { Amount } from "./Amount";
import { LineStatusBadge, drawnAmount, repaidAmount } from "./LinesTable";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
const IconCopy = () => (
  <Svg>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </Svg>
);
const IconCheck = () => (
  <Svg>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
const IconExternal = () => (
  <Svg>
    <path d="M14 5h5v5M19 5l-8 8" />
    <path d="M17 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8.5A1.5 1.5 0 0 1 6 7h4.5" />
  </Svg>
);

const BUSY_STEPS = new Set<UseTx["step"]>(["simulating", "signing", "sending", "confirming"]);

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="label text-ink-soft">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-[17px]">{children}</dd>
    </div>
  );
}

function money(units: bigint, lang: Lang) {
  return (
    <span className="num">
      <Amount units={units} lang={lang} />
    </span>
  );
}

// ---- agreement ----

/** SQLite "YYYY-MM-DD HH:MM:SS" (UTC) or ISO; null when it does not parse. */
export function agreementCreatedSeconds(createdAt: string): number | null {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(createdAt) ? `${createdAt.replace(" ", "T")}Z` : createdAt;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function agreementStatusLabel(status: string, t: Copy): string | null {
  const s = t.app.borrow.agreement.statuses;
  switch (status) {
    case "draft":
      return s.draft;
    case "pending_signatures":
      return s.pendingSignatures;
    case "signed":
      return s.signed;
    case "anchored":
      return s.anchored;
    default:
      return null;
  }
}

function AgreementDetails({ summary, t, lang }: { summary: AgreementSummary; t: Copy; lang: Lang }) {
  const a = t.app.borrow.agreement;
  const status = agreementStatusLabel(summary.status, t);
  const created = agreementCreatedSeconds(summary.createdAt);
  return (
    <div data-testid="agreement-summary" className="flex flex-col gap-3">
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2">
        <Field label={a.template}>
          <span className="num text-[15px]">
            {summary.template.id} {summary.template.version}
          </span>
        </Field>
        {status ? <Field label={a.status}>{status}</Field> : null}
        {summary.signaturesCount !== null ? (
          <Field label={a.signatures}>
            {summary.roles.length > 0
              ? fillText(a.signaturesValue, { count: String(summary.signaturesCount), total: String(summary.roles.length) })
              : String(summary.signaturesCount)}
          </Field>
        ) : null}
        {created !== null ? <Field label={a.created}>{formatDate(created, lang)}</Field> : null}
      </dl>
      <a
        href={summary.evidenceUrl}
        target="_blank"
        rel="noreferrer"
        data-testid="agreement-evidence"
        className="inline-flex min-h-[44px] w-fit items-center gap-2 font-display text-[16px] font-semibold text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
      >
        {a.evidence}
        <IconExternal />
        <span className="sr-only"> ({t.app.newTab})</span>
      </a>
    </div>
  );
}

function AgreementBlock({ hashHex, t, lang }: { hashHex: string; t: Copy; lang: Lang }) {
  const a = t.app.borrow.agreement;
  const query = useAgreementQuery(hashHex);
  const [copied, setCopied] = useState(false);
  const labelId = useId();
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(hashHex);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const found = query.data?.kind === "found" ? query.data.summary : null;
  return (
    <section aria-labelledby={labelId} data-testid="agreement" className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-line bg-mist/60 p-4">
      <div className="flex flex-col gap-1">
        <p id={labelId} className="label m-0 text-ink-soft">
          {a.hash}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code title={hashHex} data-testid="agreement-hash" className="num min-w-0 break-all text-[15px] text-ink">
            <span aria-hidden="true">{truncateMiddle(hashHex, 10, 10)}</span>
            <span className="sr-only">{hashHex}</span>
          </code>
          <button
            type="button"
            onClick={() => void onCopy()}
            data-testid="agreement-copy"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-fog bg-white px-3 font-display text-[15px] font-semibold text-teal-700 hover:bg-teal-50"
          >
            {copied ? <IconCheck /> : <IconCopy />}
            <span className="sr-only sm:not-sr-only">{copied ? a.copied : a.copy}</span>
          </button>
          <span role="status" className="sr-only">
            {copied ? a.copied : ""}
          </span>
        </div>
      </div>
      {found ? <AgreementDetails summary={found} t={t} lang={lang} /> : null}
    </section>
  );
}

// ---- schedule and late interest ----

const STATE_STYLE: Record<InstallmentState, string> = {
  paid: "bg-green-50 text-green-700 border-green-700/30",
  partial: "bg-teal-50 text-teal-800 border-teal-700/30",
  overdue: "bg-chili-50 text-chili-700 border-chili-700/40",
  pending: "bg-white text-ink-soft border-fog",
};

function ScheduleBlock({ line, now, t, lang }: { line: LineView; now: number; t: Copy; lang: Lang }) {
  const s = t.app.borrow.schedule;
  const titleId = useId();
  const schedule = line.schedule;
  if (!usableSchedule(schedule)) return null;
  const rows = installmentRows(line, BigInt(now));
  return (
    <section aria-labelledby={titleId} data-testid="schedule" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 id={titleId} className="m-0 font-display text-[18px] font-semibold">
          {s.title}
        </h4>
        <p className="m-0 text-[16px] leading-[1.55] text-ink-soft">
          {fillText(s.every, { count: String(schedule.installments), interval: formatDuration(schedule.intervalSeconds, lang) })}
          {line.drawnAt === null ? ` ${s.afterDraw}` : ""}
        </p>
      </div>
      <ol aria-label={s.caption} className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <li
            key={row.number}
            data-installment={row.number}
            data-state={row.state}
            className="flex items-center justify-between gap-3 rounded-[14px] border-[1.5px] border-line bg-white px-3 py-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold">
                {s.number} {row.number}
              </span>
              <span className="text-[14px] text-ink-soft">
                {row.dueAt === null ? s.afterDraw : `${s.due} ${formatDate(row.dueAt, lang)}`}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span className="num text-[15px]">
                <Amount units={row.amount} lang={lang} />
              </span>
              <span className={`inline-flex whitespace-nowrap rounded-full border-[1.5px] px-2 py-0.5 text-[13px] font-semibold ${STATE_STYLE[row.state]}`}>
                <span className="sr-only">{s.state}: </span>
                {s.states[row.state]}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

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
  const busy = BUSY_STEPS.has(tx.step);
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
    </article>
  );
}

