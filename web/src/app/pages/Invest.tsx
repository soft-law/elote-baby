// Investor page: your position (shares and their value, test token and SOL balances, test token
// and test SOL buttons), then the deposit and redeem forms. Without a wallet it shows the connect
// prompt in place, reusing the header's ConnectButton.
import type { ReactNode } from "react";
import { DECIMALS, UNIT } from "../../pool/math";
import type { Copy, Lang } from "../../translations";
import { useTx } from "../../tx/useTx";
import { ConnectButton } from "../../wallet/ConnectButton";
import { useWallet } from "../../wallet/useWallet";
import { LOW_SOL_LAMPORTS, formatSol, useBalancesQuery, type Balances } from "../balances";
import { AirdropButton } from "../components/AirdropButton";
import { Amount } from "../components/Amount";
import { FaucetButton } from "../components/FaucetButton";
import { Loader } from "../components/Loader";
import { SectionHead } from "../components/SectionHead";
import { SkeletonGrid } from "../components/SkeletonCard";
import { StatCard } from "../components/StatCard";
import { dataState } from "../dataState";
import { ASSET_SYMBOL, DepositForm } from "../forms/DepositForm";
import { RedeemForm } from "../forms/RedeemForm";
import { useLang } from "../lang";
import { usePoolQuery, type PoolView } from "../queries";
import { PageBody, PageHead } from "../Shell";

function Notice({ tone, role, children, testId }: { tone: "warn" | "error"; role: "status" | "alert"; children: ReactNode; testId?: string }) {
  const style = tone === "warn" ? "border-corn-300 bg-corn-100 text-ink" : "border-chili-700/30 bg-chili-50 text-chili-700";
  return (
    <div
      role={role}
      data-testid={testId}
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

/** Value of `shares` at the pool's value per share, rounded down. */
export function sharesValue(shares: bigint, perShare: bigint): bigint {
  return (shares * perShare) / UNIT;
}

function Summary({ pool, balances, t, lang }: { pool: PoolView | null; balances: Balances; t: Copy; lang: Lang }) {
  const i = t.app.invest;
  const lowSol = balances.lamports < LOW_SOL_LAMPORTS;
  return (
    <section aria-labelledby="invest-summary-title" className="flex flex-col gap-5">
      <SectionHead
        id="invest-summary-title"
        title={i.summaryTitle}
        sub={i.summaryNote}
        actions={<FaucetButton address={balances.owner} t={t} />}
      />
      <ul data-testid="invest-summary" className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        <li>
          <StatCard label={i.yourShares} value={<Amount units={balances.shares} lang={lang} />} unit={i.shareUnit} tone="accent" />
        </li>
        <li>
          <StatCard
            label={i.sharesValue}
            value={pool ? <Amount units={sharesValue(balances.shares, pool.perShare)} lang={lang} /> : "..."}
            unit={ASSET_SYMBOL}
            hint={i.sharesValueHint}
          />
        </li>
        <li>
          <StatCard label={i.assetBalance} value={<Amount units={balances.asset} lang={lang} visibleDecimals={DECIMALS} />} unit={ASSET_SYMBOL} />
        </li>
        <li>
          <StatCard label={i.solBalance} value={formatSol(balances.lamports, lang)} unit="SOL" hint={i.solHint} />
        </li>
      </ul>
      {lowSol ? (
        <div data-testid="sol-low" className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-corn-300 bg-corn-100 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <p role="status" className="m-0 text-[17px] leading-[1.5] text-ink">
            {i.solLow}
          </p>
          <AirdropButton address={balances.owner} t={t} />
        </div>
      ) : null}
    </section>
  );
}

function ConnectPrompt({ t, wrongChain }: { t: Copy; wrongChain: boolean }) {
  const i = t.app.invest;
  return (
    <section
      data-testid="invest-connect"
      aria-labelledby="invest-connect-title"
      className="flex flex-col items-start gap-4 rounded-[24px] border-[1.5px] border-dashed border-fog bg-white px-5 py-8 md:px-8"
    >
      <h2 id="invest-connect-title" className="m-0 text-[24px] font-bold leading-tight">
        {wrongChain ? i.wrongChainTitle : i.connectTitle}
      </h2>
      <p className="m-0 max-w-[56ch] text-[17px] leading-[1.55] text-ink-soft">{wrongChain ? t.app.wallet.wrongChain : i.connectBody}</p>
      <ConnectButton t={t} />
    </section>
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

  let summary: ReactNode;
  if (balancesState === "loading") {
    summary = (
      <section aria-busy="true" aria-label={i.summaryTitle} data-testid="invest-loading" className="flex flex-col gap-4">
        <Loader label={i.loading} className="sr-only" />
        <SkeletonGrid count={4} />
      </section>
    );
  } else if (!balances) {
    summary = (
      <Notice tone="error" role="alert" testId="balances-failed">
        <span>{i.balancesFailed}</span>
        <RetryButton label={i.retry} onClick={() => void balancesQuery.refetch()} />
      </Notice>
    );
  } else {
    summary = (
      <>
        {balancesState === "stale" ? (
          <Notice tone="warn" role="status">
            <span>{i.balancesStale}</span>
            <RetryButton label={i.retry} onClick={() => void balancesQuery.refetch()} />
          </Notice>
        ) : null}
        <Summary pool={pool} balances={balances} t={t} lang={lang} />
      </>
    );
  }

  let forms: ReactNode;
  if (poolState === "loading") {
    forms = <SkeletonGrid count={2} lines={3} className="lg:grid-cols-2" />;
  } else if (result?.kind === "mismatch") {
    forms = (
      <div role="alert" data-testid="pool-mismatch" className="flex flex-col gap-2 rounded-[18px] border-[1.5px] border-chili-700/30 bg-chili-50 px-5 py-4">
        <p className="m-0 font-display text-[20px] font-semibold text-chili-700">{t.app.pool.mismatch.title}</p>
        <p className="m-0 text-[17px] leading-[1.55] text-ink">{t.app.pool.mismatch.body}</p>
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
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <DepositForm pool={pool} balance={balances?.asset} tx={depositTx} t={t} lang={lang} />
          <RedeemForm pool={pool} shares={balances?.shares} tx={redeemTx} t={t} lang={lang} />
        </div>
      </>
    );
  }

  return (
    <>
      {summary}
      {forms}
    </>
  );
}

export function InvestPage() {
  const { t, lang } = useLang();
  const i = t.app.invest;
  const { status, address } = useWallet();
  return (
    <PageBody>
      <PageHead title={i.title} sub={i.sub} />
      {status === "connected" && address ? (
        <Connected key={address} owner={address} t={t} lang={lang} />
      ) : (
        <ConnectPrompt t={t} wrongChain={status === "wrong-chain"} />
      )}
    </PageBody>
  );
}
