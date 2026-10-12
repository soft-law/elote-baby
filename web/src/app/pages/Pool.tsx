// Public pool page: the pool's figures and every credit line, read from Solana. No wallet needed.
// Night hero band with the one headline figure (value per share), a strip of the other figures,
// then the paper sheet with the credit lines.
import type { ReactNode } from "react";
import { Link } from "react-router";
import { explorerAddressUrl, formatPerShare, formatReadTime, truncateMiddle } from "../../pool/format";
import type { Copy, Lang } from "../../translations";
import { Amount } from "../components/Amount";
import { EmptyState } from "../components/EmptyState";
import { LinesTable } from "../components/LinesTable";
import { Loader } from "../components/Loader";
import { Notice, RetryButton } from "../components/Notice";
import { SkeletonRows } from "../components/SkeletonCard";
import { useAppConfig } from "../configContext";
import { dataState } from "../dataState";
import { useLang } from "../lang";
import { useLinesQuery, usePoolQuery, type PoolView } from "../queries";

/** Symbol shown after amounts; the note beside the figures says it is a test token. */
const ASSET_SYMBOL = "tMXN";

type PoolCopy = Copy["app"]["pool"];

function IconExternal() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/** "The pool" with its last word glowing. */
function Title({ p }: { p: PoolCopy }) {
  const at = p.title.lastIndexOf(p.titleGlow);
  if (at < 0) return <h1 id="pool-title" className="app-h1">{p.title}</h1>;
  return (
    <h1 id="pool-title" className="app-h1">
      {p.title.slice(0, at)}
      <span className="glow-word">{p.titleGlow}</span>
      {p.title.slice(at + p.titleGlow.length)}
    </h1>
  );
}

function PoolAccount({ p }: { p: PoolCopy }) {
  const { poolAddress, explorerCluster, rpcUrl } = useAppConfig();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-night-line pt-2 md:flex-col md:items-end md:gap-1 md:border-0 md:pt-0 md:text-right">
      <div className="flex flex-col md:items-end">
        <span className="label text-fog-dim">{p.address}</span>
        <span className="num text-[15px] text-white" title={poolAddress}>
          {truncateMiddle(poolAddress)}
        </span>
      </div>
      <a
        href={explorerAddressUrl(poolAddress, explorerCluster, rpcUrl)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] text-neon underline decoration-neon/40 underline-offset-4 hover:decoration-neon"
      >
        {p.viewAddress}
        <span className="sr-only">{` (${p.newTab})`}</span>
        <IconExternal />
      </a>
    </div>
  );
}

/** The headline figure, the note and the read time. */
function Headline({ pool, readAt, p, lang }: { pool: PoolView; readAt: number; p: PoolCopy; lang: Lang }) {
  const noShares = pool.supply === 0n;
  return (
    <div className="flex flex-col">
      <p className="label m-0 mt-6 mb-1.5 text-fog-dim md:mt-8 md:mb-2">{p.perShare}</p>
      {noShares ? (
        <p className="m-0 font-display text-[28px] font-semibold leading-tight text-white md:text-[36px]">{p.noShares}</p>
      ) : (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2.5 md:gap-x-4">
          <span className="num text-[64px] leading-none font-medium tracking-[-0.03em] text-white min-[400px]:text-[72px] md:text-[104px]">
            {formatPerShare(pool.perShare, lang)}
          </span>
          <span className="label normal-case text-fog">{ASSET_SYMBOL}</span>
        </p>
      )}
      <p className="m-0 mt-3 text-[15px] text-fog md:mt-4">
        {p.statsNote}{" "}
        <span className="num block text-[13px] text-fog-dim max-md:mt-1 md:inline">{p.readAt.replace("{time}", formatReadTime(readAt, lang))}</span>
      </p>
    </div>
  );
}

function Strip({ pool, p, lang }: { pool: PoolView; p: PoolCopy; lang: Lang }) {
  const amount = (units: bigint) => <Amount units={units} lang={lang} />;
  const label = (full: string, short?: string) =>
    short ? (
      <>
        <span className="md:hidden">{short}</span>
        <span className="hidden md:inline">{full}</span>
      </>
    ) : (
      full
    );
  const figures: Array<{ key: string; label: ReactNode; value: ReactNode }> = [
    { key: "nav", label: label(p.nav), value: amount(pool.nav) },
    { key: "liquidity", label: label(p.liquidity), value: amount(pool.vaultAmount) },
    { key: "outstanding", label: label(p.outstanding, p.outstandingShort), value: amount(pool.outstandingPrincipal) },
    { key: "interest", label: label(p.interestCollected, p.interestShort), value: amount(pool.interestCollected) },
    { key: "losses", label: label(p.losses, p.lossesShort), value: amount(pool.writtenOff) },
    { key: "lines", label: label(p.lines), value: new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US").format(pool.lineCount) },
  ];
  return (
    <dl className="app-strip">
      {figures.map((f) => (
        <div key={f.key}>
          <dt className="label">{f.label}</dt>
          <dd className="num m-0">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PoolLines({ lineCount, p, lang }: { lineCount: bigint; p: PoolCopy; lang: Lang }) {
  const { explorerCluster } = useAppConfig();
  const query = useLinesQuery(lineCount);
  const empty = lineCount === 0n;
  const state = empty ? "ready" : dataState(query);
  // The landing's agreement section explains how a line is opened.
  const howHref = lang === "es" ? "/?lang=es#agreement-title" : "/#agreement-title";

  return (
    <section aria-labelledby="pool-lines-title" aria-busy={state === "loading"} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="pool-lines-title" className="app-h2">
          {p.linesTitle}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{p.statsNote}</p>
      </div>
      {empty ? (
        <EmptyState
          title={p.empty.title}
          body={p.empty.body}
          action={
            <a href={howHref} className="inline-flex min-h-[44px] items-center font-display text-[16px] font-semibold text-teal-700 underline underline-offset-4">
              {p.empty.link}
            </a>
          }
        />
      ) : state === "loading" ? (
        <>
          <Loader label={p.loading} className="sr-only" />
          <SkeletonRows count={Math.min(Number(lineCount), 5)} />
        </>
      ) : state === "unavailable" ? (
        <Notice tone="error" role="alert">
          <span>{p.linesFailed}</span>
          <RetryButton label={p.retry} onClick={() => void query.refetch()} />
        </Notice>
      ) : (
        <>
          {state === "stale" ? (
            <Notice tone="warn" role="status">
              <span>{p.stale}</span>
              <RetryButton label={p.retry} onClick={() => void query.refetch()} />
            </Notice>
          ) : null}
          <LinesTable rows={query.data ?? []} t={p} lang={lang} cluster={explorerCluster} youLabel={p.you} />
        </>
      )}
    </section>
  );
}

/** Night placeholders shaped like the headline figure and the strip. */
function HeadlineSkeleton() {
  return (
    <div aria-hidden="true" data-skeleton="" className="mt-6 flex flex-col gap-3 md:mt-8">
      <span className="app-skel-night skeleton h-3.5 w-40" />
      <span className="app-skel-night skeleton h-16 w-56 md:h-24 md:w-80" />
      <span className="app-skel-night skeleton h-3.5 w-64" />
    </div>
  );
}

export function PoolPage() {
  const { t, lang, to } = useLang();
  const p = t.app.pool;
  const query = usePoolQuery();
  const state = dataState(query);
  const result = query.data;
  const pool = result?.kind === "ok" ? result.pool : null;
  // The read time on the chain's clock when the node returned it, else the browser's.
  const readAt = query.dataUpdatedAt / 1000 + (pool?.chainClockOffset ?? 0);

  let sheet: ReactNode;
  if (state === "loading") {
    sheet = (
      <>
        <Loader label={p.loading} className="sr-only" />
        <SkeletonRows count={3} />
      </>
    );
  } else if (!result) {
    sheet = (
      <Notice tone="error" role="alert">
        <span>{p.loadFailed}</span>
        <RetryButton label={p.retry} onClick={() => void query.refetch()} />
      </Notice>
    );
  } else if (result.kind === "mismatch") {
    sheet = (
      <div
        role="alert"
        data-testid="pool-mismatch"
        data-reason={result.reason}
        className="flex flex-col gap-2 rounded-[18px] border-2 border-chili-700 bg-chili-50 px-5 py-4"
      >
        <p className="m-0 font-display text-[20px] font-semibold text-chili-700">{p.mismatch.title}</p>
        <p className="m-0 text-[16px] leading-[1.55] text-ink">{p.mismatch.body}</p>
      </div>
    );
  } else {
    sheet = (
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
        <PoolLines lineCount={result.pool.lineCount} p={p} lang={lang} />
      </>
    );
  }

  return (
    <div className="flex flex-1 flex-col" aria-busy={state === "loading"} data-testid={state === "loading" ? "pool-loading" : undefined}>
      <section aria-labelledby="pool-title" className="app-wrap app-band">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <Title p={p} />
          <Link
            to={to("/launch")}
            className="inline-flex min-h-[44px] items-center text-[15px] text-neon underline decoration-neon/40 underline-offset-4 hover:decoration-neon"
          >
            {p.launchLink}
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-10">
          {state === "loading" ? <HeadlineSkeleton /> : pool ? <Headline pool={pool} readAt={readAt} p={p} lang={lang} /> : <div />}
          <PoolAccount p={p} />
        </div>
      </section>
      {pool ? (
        <section aria-label={p.statsTitle} className="app-wrap pb-[var(--density-section-pad)]" data-testid="pool-stats">
          <p className="sr-only">
            {p.perShare}: {pool.supply === 0n ? p.noShares : `${formatPerShare(pool.perShare, lang)} ${ASSET_SYMBOL}`}
          </p>
          <Strip pool={pool} p={p} lang={lang} />
        </section>
      ) : state === "loading" ? (
        <div aria-hidden="true" data-skeleton="" className="app-wrap grid grid-cols-2 gap-3 pb-[var(--density-section-pad)] lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="app-skel-night skeleton h-12" />
          ))}
        </div>
      ) : null}
      <div className="app-sheet on-paper flex-1">
        <div className="app-wrap flex flex-col gap-6">{sheet}</div>
      </div>
    </div>
  );
}
