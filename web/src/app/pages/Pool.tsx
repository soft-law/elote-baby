// Public pool page: the pool's figures and every credit line, read from Solana. No wallet needed.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { explorerAddressUrl, formatPerShare, truncateMiddle } from "../../pool/format";
import type { Copy, Lang } from "../../translations";
import { Amount } from "../components/Amount";
import { EmptyState } from "../components/EmptyState";
import { LinesTable } from "../components/LinesTable";
import { Loader } from "../components/Loader";
import { SectionHead } from "../components/SectionHead";
import { SkeletonGrid, SkeletonRows } from "../components/SkeletonCard";
import { StatCard } from "../components/StatCard";
import { useAppConfig } from "../configContext";
import { dataState } from "../dataState";
import { useLang } from "../lang";
import { useLinesQuery, usePoolQuery, type PoolView } from "../queries";
import { PageBody, PageHead } from "../Shell";

/** Symbol shown after amounts; the section note says it is a test token. */
const ASSET_SYMBOL = "tMXN";

type PoolCopy = Copy["app"]["pool"];

function Notice({ tone, role, children }: { tone: "warn" | "error"; role: "status" | "alert"; children: ReactNode }) {
  const style = tone === "warn" ? "border-corn-300 bg-corn-100 text-ink" : "border-chili-700/30 bg-chili-50 text-chili-700";
  return (
    <div
      role={role}
      className={`flex flex-col gap-3 rounded-[18px] border-[1.5px] px-4 py-3 text-[17px] leading-[1.5] sm:flex-row sm:items-center sm:justify-between ${style}`}
    >
      {children}
    </div>
  );
}

function RetryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-teal-700 bg-white px-4 font-display text-[16px] font-semibold text-teal-700 hover:bg-teal-50"
    >
      {label}
    </button>
  );
}

function PoolStats({ pool, t, lang }: { pool: PoolView; t: PoolCopy; lang: Lang }) {
  const amount = (units: bigint) => <Amount units={units} lang={lang} />;
  const noShares = pool.supply === 0n;
  const stats: Array<{ label: string; value: ReactNode; unit?: string; hint?: string; accent?: boolean }> = [
    {
      label: t.perShare,
      value: noShares ? t.noShares : formatPerShare(pool.perShare, lang),
      unit: noShares ? undefined : ASSET_SYMBOL,
      hint: t.perShareHint,
      accent: true,
    },
    { label: t.nav, value: amount(pool.nav), unit: ASSET_SYMBOL, hint: t.navHint },
    { label: t.liquidity, value: amount(pool.vaultAmount), unit: ASSET_SYMBOL, hint: t.liquidityHint },
    { label: t.outstanding, value: amount(pool.outstandingPrincipal), unit: ASSET_SYMBOL },
    { label: t.interestCollected, value: amount(pool.interestCollected), unit: ASSET_SYMBOL },
    { label: t.losses, value: amount(pool.writtenOff), unit: ASSET_SYMBOL },
    { label: t.lines, value: new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US").format(pool.lineCount) },
  ];
  return (
    <ul data-testid="pool-stats" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <li key={s.label}>
          <StatCard label={s.label} value={s.value} unit={s.unit} hint={s.hint} tone={s.accent ? "accent" : "default"} />
        </li>
      ))}
    </ul>
  );
}

function PoolLines({ lineCount, t, lang }: { lineCount: bigint; t: PoolCopy; lang: Lang }) {
  const { explorerCluster } = useAppConfig();
  const query = useLinesQuery(lineCount);
  const empty = lineCount === 0n;
  const state = empty ? "ready" : dataState(query);
  // The landing's agreement section explains how a line is opened.
  const howHref = lang === "es" ? "/?lang=es#agreement-title" : "/#agreement-title";

  return (
    <section aria-labelledby="pool-lines-title" aria-busy={state === "loading"} className="flex flex-col gap-5">
      <SectionHead id="pool-lines-title" title={t.linesTitle} sub={t.linesSub} />
      {empty ? (
        <EmptyState
          title={t.empty.title}
          body={t.empty.body}
          action={
            <a
              href={howHref}
              className="inline-flex min-h-[44px] items-center font-display text-[17px] font-semibold text-teal-700 underline underline-offset-4"
            >
              {t.empty.link}
            </a>
          }
        />
      ) : state === "loading" ? (
        <>
          <Loader label={t.loading} className="sr-only" />
          <SkeletonRows count={Math.min(Number(lineCount), 5)} />
        </>
      ) : state === "unavailable" ? (
        <Notice tone="error" role="alert">
          <span>{t.linesFailed}</span>
          <RetryButton label={t.retry} onClick={() => void query.refetch()} />
        </Notice>
      ) : (
        <>
          {state === "stale" ? (
            <Notice tone="warn" role="status">
              <span>{t.stale}</span>
              <RetryButton label={t.retry} onClick={() => void query.refetch()} />
            </Notice>
          ) : null}
          <LinesTable rows={query.data ?? []} t={t} lang={lang} cluster={explorerCluster} />
        </>
      )}
    </section>
  );
}

export function PoolPage() {
  const { t, lang, to } = useLang();
  const p = t.app.pool;
  const { poolAddress, explorerCluster, rpcUrl } = useAppConfig();
  const query = usePoolQuery();
  const state = dataState(query);
  const result = query.data;

  let body: ReactNode;
  if (state === "loading") {
    body = (
      <section aria-busy="true" aria-label={p.statsTitle} className="flex flex-col gap-4" data-testid="pool-loading">
        <Loader label={p.loading} className="sr-only" />
        <SkeletonGrid count={7} />
        <SkeletonRows count={3} />
      </section>
    );
  } else if (!result) {
    body = (
      <Notice tone="error" role="alert">
        <span>{p.loadFailed}</span>
        <RetryButton label={p.retry} onClick={() => void query.refetch()} />
      </Notice>
    );
  } else if (result.kind === "mismatch") {
    body = (
      <div
        role="alert"
        data-testid="pool-mismatch"
        data-reason={result.reason}
        className="flex flex-col gap-2 rounded-[18px] border-[1.5px] border-chili-700/30 bg-chili-50 px-5 py-4"
      >
        <p className="m-0 font-display text-[20px] font-semibold text-chili-700">{p.mismatch.title}</p>
        <p className="m-0 text-[17px] leading-[1.55] text-ink">{p.mismatch.body}</p>
      </div>
    );
  } else {
    body = (
      <>
        {result.pool.paused ? (
          <Notice tone="warn" role="status">
            <span data-testid="pool-paused">{p.paused}</span>
          </Notice>
        ) : null}
        {state === "stale" ? (
          <Notice tone="warn" role="status">
            <span>{p.stale}</span>
            <RetryButton label={p.retry} onClick={() => void query.refetch()} />
          </Notice>
        ) : null}
        <section aria-labelledby="pool-stats-title" className="flex flex-col gap-5">
          <SectionHead id="pool-stats-title" title={p.statsTitle} sub={p.statsNote} />
          <PoolStats pool={result.pool} t={p} lang={lang} />
        </section>
        <PoolLines lineCount={result.pool.lineCount} t={p} lang={lang} />
      </>
    );
  }

  return (
    <PageBody>
      <PageHead title={p.title} sub={p.sub} />
      <p className="m-0 flex flex-wrap items-center gap-x-3 text-[16px] text-ink-soft">
        <span className="label">{p.address}</span>
        <a
          href={explorerAddressUrl(poolAddress, explorerCluster, rpcUrl)}
          target="_blank"
          rel="noreferrer"
          title={poolAddress}
          className="num inline-flex min-h-[44px] items-center text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
        >
          {truncateMiddle(poolAddress, 6, 6)}
          <span className="sr-only">{` (${p.viewAddress}, ${p.newTab})`}</span>
        </a>
        <Link
          to={to("/launch")}
          className="inline-flex min-h-[44px] items-center text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700 sm:ml-auto"
        >
          {p.launchLink}
        </Link>
      </p>
      {body}
    </PageBody>
  );
}
