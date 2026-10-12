// Investor page. Night hero band with one headline figure (the value of your shares, or the value
// per share before a wallet is connected) and a strip of three figures; then the paper sheet with
// Get test tokens, the low-SOL region (always mounted), the deposit and redeem forms and the
// activity history. Without a wallet the band shows the public pool figures and the sheet one
// inline connect panel.
import type { Address } from "@solana/kit";
import type { ReactNode } from "react";
import { ASSET_SYMBOL, formatPerShare } from "../../pool/format";
import { DECIMALS, UNIT } from "../../pool/math";
import type { Copy, Lang } from "../../translations";
import { useTx } from "../../tx/useTx";
import { ConnectButton } from "../../wallet/ConnectButton";
import { useWallet, wrongChainText } from "../../wallet/useWallet";
import { LOW_SOL_LAMPORTS, formatSol, useBalancesQuery, type Balances } from "../balances";
import { AirdropButton } from "../components/AirdropButton";
import { Amount } from "../components/Amount";
import { FaucetButton } from "../components/FaucetButton";
import { HistoryBody } from "../components/HistoryList";
import { Loader } from "../components/Loader";
import { Notice, RetryButton } from "../components/Notice";
import { SkeletonGrid } from "../components/SkeletonCard";
import { useAppConfig } from "../configContext";
import { dataState } from "../dataState";
import { DepositForm } from "../forms/DepositForm";
import { RedeemForm } from "../forms/RedeemForm";
import { useHistoryQuery } from "../history";
import { useLang } from "../lang";
import { usePoolQuery } from "../queries";

/** Value of `shares` at the pool's value per share, rounded down. */
export function sharesValue(shares: bigint, perShare: bigint): bigint {
  return (shares * perShare) / UNIT;
}

type Figure = { key: string; label: string; value: ReactNode };

/** The night band: page title, one headline figure and a strip of three. */
function Band({
  title,
  headLabel,
  head,
  note,
  figures,
  testId,
  busy,
}: {
  title: string;
  headLabel: string;
  head: ReactNode;
  note: ReactNode;
  figures: Figure[] | null;
  testId?: string;
  busy?: boolean;
}) {
  return (
    <section aria-labelledby="invest-title" aria-busy={busy || undefined} className="app-wrap app-band">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-end lg:gap-14" data-testid={testId}>
        <div>
          <h1 id="invest-title" className="app-h1">
            {title}
          </h1>
          <p className="label m-0 mt-6 mb-1.5 text-fog-dim md:mt-7 md:mb-2">{headLabel}</p>
          <div className="flex flex-wrap items-baseline gap-x-3">{head}</div>
          <p className="m-0 mt-3 text-[15px] text-fog">{note}</p>
        </div>
        {figures ? (
          <dl className="app-strip app-strip-3 m-0">
            {figures.map((f) => (
              <div key={f.key}>
                <dt className="label">{f.label}</dt>
                <dd className="num m-0">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div aria-hidden="true" data-skeleton="" className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <span key={i} className="app-skel-night skeleton h-14" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BigFigure({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="num text-[52px] leading-none font-medium tracking-[-0.03em] text-white md:text-[72px]">{children}</span>
      <span className="label normal-case text-fog">{ASSET_SYMBOL}</span>
    </>
  );
}

function HeadSkeleton() {
  return <span aria-hidden="true" data-skeleton="" className="app-skel-night skeleton h-[52px] w-56 md:h-[72px] md:w-72" />;
}

/** Sheet: the sheet surface under the band. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="app-sheet on-paper flex-1">
      <div className="app-wrap flex flex-col gap-8">{children}</div>
    </div>
  );
}

/** Get test tokens and the low-SOL region. The status region stays mounted so the warning is announced when it appears. */
function Tools({ balances, t }: { balances: Balances; t: Copy }) {
  const i = t.app.invest;
  const lowSol = balances.lamports < LOW_SOL_LAMPORTS;
  return (
    <div className="flex flex-col gap-3">
      <div className="app-panel-teal flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="m-0 max-w-[52ch] text-[15px] text-ink">{t.app.faucet.hint}</p>
        <FaucetButton address={balances.owner} t={t} />
      </div>
      <div
        data-testid={lowSol ? "sol-low" : undefined}
        className={lowSol ? "app-panel-corn flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" : "sr-only"}
      >
        <p role="status" data-testid="sol-status" className="m-0 text-[16px] leading-[1.5] text-ink">
          {lowSol ? i.solLow : ""}
        </p>
        {lowSol ? <AirdropButton address={balances.owner} t={t} /> : null}
      </div>
    </div>
  );
}

/** The last transactions of the wallet's share account (named by the balances read). */
function InvestHistory({ owner, shareAccount, t, lang }: { owner: Address; shareAccount: Address; t: Copy; lang: Lang }) {
  const h = t.app.history;
  const { poolAddress, explorerCluster } = useAppConfig();
  const query = useHistoryQuery("shares", shareAccount);
  return (
    <section aria-labelledby="invest-history-title" data-testid="invest-history" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="invest-history-title" className="app-h2">
          {h.title}
        </h2>
        <p className="m-0 text-[15px] text-ink-soft">{h.sub}</p>
      </div>
      <HistoryBody query={query} scope={{ kind: "shares", pool: poolAddress, owner }} t={t} lang={lang} cluster={explorerCluster} label={h.title} />
    </section>
  );
}

/** No wallet: public pool figures in the band and one connect panel. */
function NotConnected({ t, lang, wrongChain }: { t: Copy; lang: Lang; wrongChain: boolean }) {
  const { account, chain } = useWallet();
  const i = t.app.invest;
  const p = t.app.pool;
  const poolQuery = usePoolQuery();
  const pool = poolQuery.data?.kind === "ok" ? poolQuery.data.pool : null;
  const amount = (units: bigint) => <Amount units={units} lang={lang} />;
  const figures: Figure[] | null = pool
    ? [
        { key: "nav", label: p.nav, value: amount(pool.nav) },
        { key: "liquidity", label: p.liquidity, value: amount(pool.vaultAmount) },
        { key: "lines", label: p.lines, value: new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US").format(pool.lineCount) },
      ]
    : poolQuery.isPending
      ? null
      : [];
  const head = pool ? (
    pool.supply === 0n ? (
      <span className="font-display text-[28px] font-semibold text-white">{p.noShares}</span>
    ) : (
      <BigFigure>{formatPerShare(pool.perShare, lang)}</BigFigure>
    )
  ) : poolQuery.isPending ? (
    <HeadSkeleton />
  ) : (
    <span className="text-[16px] text-fog">{p.loadFailed}</span>
  );
  return (
    <>
      <Band title={i.title} headLabel={p.perShare} head={head} note={p.statsNote} figures={figures} busy={poolQuery.isPending} />
      <Sheet>
        <section
          data-testid="invest-connect"
          aria-labelledby="invest-connect-title"
          className="app-panel-teal grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:items-center md:gap-10 md:p-10"
        >
          <div>
            <h2 id="invest-connect-title" className="app-h2 md:text-[28px]">
              {wrongChain ? i.wrongChainTitle : i.connectTitle}
            </h2>
            <p className="m-0 mt-3 max-w-[56ch] text-[17px] leading-[1.55]">
              {wrongChain ? wrongChainText(account, chain, t.app.wallet, t.app.header.network) : i.connectBody}
            </p>
          </div>
          <ConnectButton t={t} variant="paper" />
        </section>
      </Sheet>
    </>
  );
}

function Connected({ owner, t, lang }: { owner: NonNullable<ReturnType<typeof useWallet>["address"]>; t: Copy; lang: Lang }) {
  const i = t.app.invest;
  const poolQuery = usePoolQuery();
  const balancesQuery = useBalancesQuery(owner);
  const depositTx = useTx();
  const redeemTx = useTx();
  const poolState = dataState(poolQuery);
  const balancesState = dataState(balancesQuery);
  const result = poolQuery.data;
  const pool = result?.kind === "ok" ? result.pool : null;
  const balances = balancesQuery.data;

  let band: ReactNode;
  let top: ReactNode = null;
  if (balancesState === "loading") {
    band = (
      <>
        <Loader label={i.loading} className="sr-only" />
        <Band title={i.title} headLabel={i.sharesValue} head={<HeadSkeleton />} note={i.summaryNote} figures={null} testId="invest-loading" busy />
      </>
    );
  } else if (!balances) {
    band = <Band title={i.title} headLabel={i.sharesValue} head={<span className="text-[16px] text-fog">{i.balancesFailed}</span>} note={i.summaryNote} figures={[]} />;
    top = (
      <Notice tone="error" role="alert" testId="balances-failed">
        <span>{i.balancesFailed}</span>
        <RetryButton label={i.retry} onClick={() => void balancesQuery.refetch()} />
      </Notice>
    );
  } else {
    const head = pool ? (
      <BigFigure>
        <Amount units={sharesValue(balances.shares, pool.perShare)} lang={lang} />
      </BigFigure>
    ) : (
      <span data-testid="shares-value-loading">
        <HeadSkeleton />
        <span className="sr-only">{t.app.pool.loading}</span>
      </span>
    );
    const note = (
      <>
        {i.summaryNote}
        {pool && pool.supply > 0n ? (
          <span className="num ml-2 text-[13px] text-fog-dim">
            {i.perShareNote.replace("{n}", formatPerShare(pool.perShare, lang))}
          </span>
        ) : null}
      </>
    );
    band = (
      <Band
        title={i.title}
        headLabel={i.sharesValue}
        head={head}
        note={note}
        testId="invest-summary"
        figures={[
          { key: "shares", label: i.yourShares, value: <Amount units={balances.shares} lang={lang} /> },
          { key: "asset", label: i.assetBalance, value: <Amount units={balances.asset} lang={lang} visibleDecimals={DECIMALS} /> },
          { key: "sol", label: i.solBalance, value: formatSol(balances.lamports, lang) },
        ]}
      />
    );
    top = (
      <>
        {balancesState === "stale" ? (
          <Notice tone="warn" role="status">
            <span>{i.balancesStale}</span>
            <RetryButton label={i.retry} onClick={() => void balancesQuery.refetch()} />
          </Notice>
        ) : null}
        <Tools balances={balances} t={t} />
      </>
    );
  }

  let forms: ReactNode;
  if (poolState === "loading") {
    forms = <SkeletonGrid count={2} lines={3} className="lg:grid-cols-2" />;
  } else if (result?.kind === "mismatch") {
    forms = (
      <div role="alert" data-testid="pool-mismatch" className="flex flex-col gap-2 rounded-[18px] border-2 border-chili-700 bg-chili-50 px-5 py-4">
        <p className="m-0 font-display text-[20px] font-semibold text-chili-700">{t.app.pool.mismatch.title}</p>
        <p className="m-0 text-[16px] leading-[1.55] text-ink">{t.app.pool.mismatch.body}</p>
      </div>
    );
  } else if (!pool) {
    forms = (
      <Notice tone="error" role="alert" testId="pool-failed">
        <span>{i.poolFailed}</span>
        <RetryButton label={i.retry} onClick={() => void poolQuery.refetch()} />
      </Notice>
    );
  } else {
    forms = (
      <>
        {pool.paused ? (
          <Notice tone="warn" role="status" testId="invest-paused">
            <span>{i.paused}</span>
          </Notice>
        ) : null}
        <div className="grid grid-cols-1 gap-[var(--density-card-gap)] md:grid-cols-2 md:gap-6">
          <DepositForm pool={pool} balance={balances?.asset} tx={depositTx} t={t} lang={lang} />
          <RedeemForm pool={pool} shares={balances?.shares} tx={redeemTx} t={t} lang={lang} />
        </div>
      </>
    );
  }

  return (
    <>
      {band}
      <Sheet>
        {top}
        {forms}
        {balances ? <InvestHistory owner={owner} shareAccount={balances.shareAccount} t={t} lang={lang} /> : null}
      </Sheet>
    </>
  );
}

export function InvestPage() {
  const { t, lang } = useLang();
  const { status, address } = useWallet();
  return (
    <div className="flex flex-1 flex-col">
      {status === "connected" && address ? (
        <Connected key={address} owner={address} t={t} lang={lang} />
      ) : (
        <NotConnected t={t} lang={lang} wrongChain={status === "wrong-chain"} />
      )}
    </div>
  );
}
