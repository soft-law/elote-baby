// Borrower page: the credit lines opened for the connected wallet, and below them the lines it
// sponsors (anyone may repay, so a sponsor uses the same form). Each line is a LineCard with Draw
// on approved lines and the repayment form on active or in-collection lines. Without a wallet it
// shows the connect prompt in place, like the investor page.
import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Copy, Lang } from "../../translations";
import type { ExplorerCluster } from "../../pool/format";
import { ConnectButton } from "../../wallet/ConnectButton";
import { useWallet } from "../../wallet/useWallet";
import { useBalancesQuery } from "../balances";
import { EmptyState } from "../components/EmptyState";
import { LineCard } from "../components/LineCard";
import { Loader } from "../components/Loader";
import { Notice, RetryButton } from "../components/Notice";
import { SectionHead } from "../components/SectionHead";
import { SkeletonGrid } from "../components/SkeletonCard";
import { useAppConfig } from "../configContext";
import { dataState } from "../dataState";
import { useLang } from "../lang";
import { useLinesQuery, usePoolQuery, type PoolLine, type PoolView } from "../queries";
import { PageBody, PageHead } from "../Shell";

/** Seconds between refreshes of the clock used for due dates and late interest estimates. */
export const NOW_TICK_MS = 30_000;

/**
 * Unix seconds on the chain's clock, refreshed every NOW_TICK_MS while the page is open: the
 * browser clock plus `offsetSeconds` (chain minus browser, read with the pool). With no offset it
 * is the browser clock, and the late interest stays an estimate (the form says so either way).
 */
export function useNow(tickMs: number = NOW_TICK_MS, offsetSeconds: number = 0): number {
  const read = () => Math.floor(Date.now() / 1000 + offsetSeconds);
  const [now, setNow] = useState(read);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000 + offsetSeconds));
    tick();
    const id = setInterval(tick, tickMs);
    return () => clearInterval(id);
  }, [tickMs, offsetSeconds]);
  return now;
}

/** The lines the borrower page shows for `owner`: borrowed first, then sponsored. Unreadable lines name nobody. */
export function linesFor(rows: PoolLine[], owner: string): { borrowed: PoolLine[]; sponsored: PoolLine[] } {
  const borrowed: PoolLine[] = [];
  const sponsored: PoolLine[] = [];
  for (const row of rows) {
    if (!row.view.readable) continue;
    if (row.view.borrower === owner) borrowed.push(row);
    else if (row.view.sponsor === owner) sponsored.push(row);
  }
  return { borrowed, sponsored };
}

function ConnectPrompt({ t, wrongChain }: { t: Copy; wrongChain: boolean }) {
  const b = t.app.borrow;
  return (
    <section
      data-testid="borrow-connect"
      aria-labelledby="borrow-connect-title"
      className="flex flex-col items-start gap-4 rounded-[24px] border-[1.5px] border-dashed border-fog bg-white px-5 py-8 md:px-8"
    >
      <h2 id="borrow-connect-title" className="m-0 text-[24px] font-bold leading-tight">
        {wrongChain ? t.app.invest.wrongChainTitle : b.connectTitle}
      </h2>
      <p className="m-0 max-w-[56ch] text-[17px] leading-[1.55] text-ink-soft">{wrongChain ? t.app.wallet.wrongChain : b.connectBody}</p>
      <ConnectButton t={t} />
    </section>
  );
}

type GroupProps = {
  id: string;
  title: string;
  sub: string;
  rows: PoolLine[];
  counterpart: "sponsor" | "borrower";
  pool: PoolView;
  balance: bigint | undefined;
  now: number;
  t: Copy;
  lang: Lang;
  cluster: ExplorerCluster;
};

function LineGroup({ id, title, sub, rows, counterpart, pool, balance, now, t, lang, cluster }: GroupProps) {
  return (
    <section aria-labelledby={id} data-testid={`${id}-group`} className="flex flex-col gap-5">
      <SectionHead id={id} title={title} sub={sub} />
      <ul aria-label={title} className="m-0 flex list-none flex-col gap-5 p-0">
        {rows.map((row) => (
          <li key={row.lineId.toString()}>
            <LineCard row={row} pool={pool} balance={balance} now={now} t={t} lang={lang} cluster={cluster} counterpart={counterpart} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Connected({ owner, t, lang }: { owner: NonNullable<ReturnType<typeof useWallet>["address"]>; t: Copy; lang: Lang }) {
  const b = t.app.borrow;
  const { explorerCluster } = useAppConfig();
  const { to } = useLang();
  const poolQuery = usePoolQuery();
  const balancesQuery = useBalancesQuery(owner);
  const result = poolQuery.data;
  const pool = result?.kind === "ok" ? result.pool : null;
  // The program judges late interest by the chain's clock; the browser clock may drift from it.
  const now = useNow(NOW_TICK_MS, pool?.chainClockOffset ?? 0);
  const linesQuery = useLinesQuery(pool?.lineCount);
  const poolState = dataState(poolQuery);
  const linesState = dataState(linesQuery);
  const balancesState = dataState(balancesQuery);
  const balance = balancesQuery.data?.asset;

  if (poolState === "loading" || (pool && linesState === "loading")) {
    return (
      <section aria-busy="true" aria-label={b.loading} data-testid="borrow-loading" className="flex flex-col gap-4">
        <Loader label={b.loading} className="sr-only" />
        <SkeletonGrid count={2} lines={4} className="lg:grid-cols-1" />
      </section>
    );
  }
  if (result?.kind === "mismatch") {
    return (
      <div role="alert" data-testid="pool-mismatch" className="flex flex-col gap-2 rounded-[18px] border-[1.5px] border-chili-700/30 bg-chili-50 px-5 py-4">
        <p className="m-0 font-display text-[20px] font-semibold text-chili-700">{t.app.pool.mismatch.title}</p>
        <p className="m-0 text-[17px] leading-[1.55] text-ink">{t.app.pool.mismatch.body}</p>
      </div>
    );
  }
  if (!pool) {
    return (
      <Notice tone="error" role="alert" testId="pool-failed">
        <span>{b.poolFailed}</span>
        <RetryButton label={b.retry} onClick={() => void poolQuery.refetch()} />
      </Notice>
    );
  }
  if (!linesQuery.data) {
    return (
      <Notice tone="error" role="alert" testId="lines-failed">
        <span>{b.linesFailed}</span>
        <RetryButton label={b.retry} onClick={() => void linesQuery.refetch()} />
      </Notice>
    );
  }

  const { borrowed, sponsored } = linesFor(linesQuery.data, owner);
  const shared = { pool, balance, now, t, lang, cluster: explorerCluster };

  return (
    <>
      {pool.paused ? (
        <Notice tone="warn" role="status" testId="borrow-paused">
          <span>{b.paused}</span>
        </Notice>
      ) : null}
      {linesState === "stale" ? (
        <Notice tone="warn" role="status" testId="lines-stale">
          <span>{b.linesStale}</span>
          <RetryButton label={b.retry} onClick={() => void linesQuery.refetch()} />
        </Notice>
      ) : null}
      {balancesState === "unavailable" && borrowed.length + sponsored.length > 0 ? (
        <Notice tone="error" role="alert" testId="balances-failed">
          <span>{b.balancesFailed}</span>
          <RetryButton label={b.retry} onClick={() => void balancesQuery.refetch()} />
        </Notice>
      ) : null}
      {borrowed.length + sponsored.length === 0 ? (
        <div data-testid="borrow-empty">
          <EmptyState
            title={b.empty.title}
            body={b.empty.body}
            action={
              <Link to={to("/pool")} className="inline-flex min-h-[44px] items-center gap-2 font-display text-[17px] font-semibold text-teal-700 underline decoration-teal-700/40 underline-offset-4">
                {t.app.home.poolLink}
              </Link>
            }
          />
        </div>
      ) : null}
      {borrowed.length > 0 ? (
        <LineGroup id="borrow-mine" title={b.yourLines} sub={`${b.yourLinesSub} ${b.unitNote}`} rows={borrowed} counterpart="sponsor" {...shared} />
      ) : null}
      {sponsored.length > 0 ? (
        <LineGroup id="borrow-sponsored" title={b.sponsored} sub={`${b.sponsoredSub} ${b.unitNote}`} rows={sponsored} counterpart="borrower" {...shared} />
      ) : null}
    </>
  );
}

export function BorrowPage() {
  const { t, lang } = useLang();
  const b = t.app.borrow;
  const { status, address } = useWallet();
  return (
    <PageBody>
      <PageHead title={b.title} sub={b.sub} />
      {status === "connected" && address ? (
        <Connected key={address} owner={address} t={t} lang={lang} />
      ) : (
        <ConnectPrompt t={t} wrongChain={status === "wrong-chain"} />
      )}
    </PageBody>
  );
}
