// Activity rows: one per transaction, newest first, each with its date and an explorer link.
// HistoryList renders decoded entries; HistoryBody adds the loading, error and empty states of a
// history query. A transaction without an event in scope reads "Pool transaction"; a failed one
// reads "Failed". Unknown fields are never shown, so a row never says NaN or undefined.
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fill } from "../fill";
import { historyRow, type HistoryRow, type HistoryScope } from "../history";
import { dataState } from "../dataState";
import { explorerTxUrl, formatDate, truncateMiddle, type ExplorerCluster } from "../../pool/format";
import type { HistoryEntry, PoolEvent } from "../../pool/history";
import type { Copy, Lang } from "../../translations";
import { Amount } from "./Amount";
import { EmptyState } from "./EmptyState";
import { Loader } from "./Loader";
import { Notice, RetryButton } from "./Notice";
import { SkeletonRows } from "./SkeletonCard";

/** Decimals shown for share amounts (the screen reader hears all six). */
const SHARE_DECIMALS = 3;

function money(units: bigint, lang: Lang): ReactNode {
  return (
    <span className="num font-semibold text-ink">
      <Amount units={units} lang={lang} />
    </span>
  );
}

function shares(units: bigint, lang: Lang): ReactNode {
  return (
    <span className="num font-semibold text-ink">
      <Amount units={units} lang={lang} visibleDecimals={SHARE_DECIMALS} />
    </span>
  );
}

/** The sentence for one event in scope; null for an event this list does not describe. */
export function eventSentence(event: PoolEvent, t: Copy, lang: Lang): ReactNode {
  const r = t.app.history.rows;
  switch (event.kind) {
    case "Deposited":
      return fill(r.deposited, { assets: money(event.data.assets, lang), shares: shares(event.data.shares, lang) });
    case "Redeemed":
      return fill(r.redeemed, { assets: money(event.data.assets, lang), shares: shares(event.data.shares, lang) });
    case "LineOpened":
      return fill(r.lineOpened, { principal: money(event.data.principal, lang) });
    case "LineDrawn":
      return fill(r.lineDrawn, { amount: money(event.data.amount, lang) });
    case "LineRepaid":
      return fill(r.lineRepaid, { principal: money(event.data.principalPart, lang), interest: money(event.data.interestPart, lang) });
    case "LateInterestCollected":
      return fill(r.lateInterest, { amount: money(event.data.amount, lang) });
    case "LineInCollection":
      return fill(r.inCollection, { missed: <span className="num font-semibold text-ink">{String(event.data.missed)}</span> });
    case "LineWrittenOff":
      return fill(r.writtenOff, { loss: money(event.data.loss, lang) });
    default:
      return null;
  }
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" />
    </svg>
  );
}

function Row({ row, t, lang, cluster }: { row: HistoryRow; t: Copy; lang: Lang; cluster: ExplorerCluster }) {
  const h = t.app.history;
  let body: ReactNode;
  if (row.kind === "failed") {
    body = (
      <span className="inline-flex items-center rounded-full border-[1.5px] border-chili-700/30 bg-chili-50 px-2.5 py-0.5 font-display text-[15px] font-semibold text-chili-700">
        {h.rows.failed}
      </span>
    );
  } else if (row.kind === "other") {
    body = <span className="text-ink-soft">{h.rows.other}</span>;
  } else {
    body = (
      <span className="flex flex-col gap-1">
        {row.events.map((event, i) => (
          <span key={i}>{eventSentence(event, t, lang)}</span>
        ))}
      </span>
    );
  }
  const date = row.blockTime === null ? t.app.pool.noDate : formatDate(row.blockTime, lang);
  return (
    <li
      data-signature={row.signature}
      data-row={row.kind === "events" ? row.events.map((e) => e.kind).join(" ") : row.kind}
      className="flex flex-col gap-2 border-b-[1.5px] border-line py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 text-[17px] leading-[1.5] text-ink">{body}</p>
        <p className="m-0 text-[15px] text-ink-soft">{date}</p>
      </div>
      <a
        href={explorerTxUrl(row.signature, cluster)}
        target="_blank"
        rel="noreferrer"
        title={row.signature}
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 text-[15px] font-semibold text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
      >
        {h.view}
        <ExternalIcon />
        <span className="sr-only">
          {" "}
          {truncateMiddle(row.signature)} ({t.app.newTab})
        </span>
      </a>
    </li>
  );
}

export type HistoryListProps = {
  entries: HistoryEntry[];
  scope: HistoryScope;
  t: Copy;
  lang: Lang;
  cluster: ExplorerCluster;
  label: string;
};

/** The decoded entries as rows, in the order given (newest first). Empty input renders the empty state. */
export function HistoryList({ entries, scope, t, lang, cluster, label }: HistoryListProps) {
  const h = t.app.history;
  if (entries.length === 0) {
    return scope.kind === "shares" ? (
      <div data-testid="history-empty">
        <EmptyState title={h.empty.title} body={h.empty.body} />
      </div>
    ) : (
      <p data-testid="history-empty" className="m-0 text-[16px] leading-[1.55] text-ink-soft">
        {h.lineEmpty}
      </p>
    );
  }
  return (
    <ul aria-label={label} data-testid="history-list" className="m-0 flex list-none flex-col rounded-[18px] border-[1.5px] border-line bg-white px-4 py-0 md:px-5">
      {entries.map((entry) => (
        <Row key={entry.signature} row={historyRow(entry, scope)} t={t} lang={lang} cluster={cluster} />
      ))}
    </ul>
  );
}

export type HistoryBodyProps = Omit<HistoryListProps, "entries"> & { query: UseQueryResult<HistoryEntry[]> };

/** A history query as skeleton rows, an error with retry, the empty state or the list. */
export function HistoryBody({ query, ...list }: HistoryBodyProps) {
  const h = list.t.app.history;
  const state = dataState(query);
  if (state === "loading") {
    return (
      <div aria-busy="true" data-testid="history-loading" className="flex flex-col gap-2">
        <Loader label={h.loading} className="sr-only" />
        <SkeletonRows count={3} />
      </div>
    );
  }
  if (!query.data) {
    return (
      <Notice tone="error" role="alert" testId="history-failed">
        <span>{h.failed}</span>
        <RetryButton label={h.retry} onClick={() => void query.refetch()} />
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {state === "stale" ? (
        <Notice tone="warn" role="status" testId="history-stale">
          <span>{h.stale}</span>
          <RetryButton label={h.retry} onClick={() => void query.refetch()} />
        </Notice>
      ) : null}
      <HistoryList entries={query.data} {...list} />
    </div>
  );
}
