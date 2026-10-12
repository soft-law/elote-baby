// Launch preset page: the Meteora Dynamic Bonding Curve launch of the demo token and where its fees
// go, read live from Solana. Read-only: no wallet, no transaction. Kept apart from /pool so pool
// shares and the demo token never share a screen. While the preset addresses are null (not
// launched on this cluster) the page makes no RPC call at all.
import type { ReactNode } from "react";
import { IconCheckCircle, IconClose } from "../../icons";
import { explorerAddressUrl, formatAmount, formatBps, formatPerShare, truncateMiddle } from "../../pool/format";
import { UNIT } from "../../pool/math";
import type { Copy, Lang } from "../../translations";
import { Amount } from "../components/Amount";
import { EmptyState } from "../components/EmptyState";
import { Loader } from "../components/Loader";
import { Notice, RetryButton } from "../components/Notice";
import { SectionHead } from "../components/SectionHead";
import { SkeletonGrid } from "../components/SkeletonCard";
import { StatCard } from "../components/StatCard";
import { useAppConfig } from "../configContext";
import { dataState } from "../dataState";
import { fill, fillText } from "../fill";
import { useLang } from "../lang";
import { PRESET, PRESET_PROGRAMS, type PresetAddresses } from "../meteora/addresses";
import { useLaunchQuery, type LaunchView } from "../meteora/launch";
import { usePoolQuery } from "../queries";
import { PageBody, PageHead } from "../Shell";

/** Unit after test token amounts; the flow section's lead says it is a test token. */
const ASSET_SYMBOL = "tMXN";
const PRICE_UNIT = "tMXN / tELOTE";

type LaunchCopy = Copy["app"]["launch"];

function ExplorerLink({ address, t }: { address: string; t: LaunchCopy }) {
  const { explorerCluster, rpcUrl } = useAppConfig();
  return (
    <a
      href={explorerAddressUrl(address, explorerCluster, rpcUrl)}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="num inline-flex min-h-[44px] items-center text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
    >
      {truncateMiddle(address, 6, 6)}
      <span className="sr-only">{` (${t.addresses.viewAddress}, ${t.addresses.newTab})`}</span>
    </a>
  );
}

/** A secondary figure inside a step: label on the left, value on the right. */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-3">
      <dt className="text-[15px] leading-[1.45] text-ink-soft">{label}</dt>
      <dd className="num m-0 text-[17px] font-semibold text-ink">{children}</dd>
    </div>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-4 rounded-[24px] border-[1.5px] border-line bg-white p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="num inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-night text-[16px] font-semibold text-neon"
        >
          {n}
        </span>
        <h3 className="m-0 font-display text-[20px] font-bold leading-tight text-ink">{title}</h3>
      </div>
      <p className="m-0 text-[16px] leading-[1.5] text-ink-soft">{body}</p>
      {children}
    </li>
  );
}

function StagePill({ stage, t }: { stage: LaunchView["progress"]["stage"]; t: LaunchCopy }) {
  const style =
    stage === "graduated"
      ? "border-green-700/30 bg-green-50 text-green-700"
      : stage === "thresholdReached"
        ? "border-corn-300 bg-corn-100 text-ink"
        : "border-teal-700/30 bg-teal-50 text-teal-700";
  return (
    <span data-testid="launch-stage" data-stage={stage} className={`label inline-flex w-fit rounded-full border-[1.5px] px-3 py-1 ${style}`}>
      {t.stage[stage]}
    </span>
  );
}

function ProgressBar({ bps, label }: { bps: number; label: string }) {
  const pct = bps / 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.floor(pct)}
      data-testid="launch-progress"
      data-bps={bps}
      className="h-3 w-full overflow-hidden rounded-full bg-mist"
    >
      <div className="h-full rounded-full bg-teal-700 motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

function Flow({ launch, perShare, lang, t }: { launch: LaunchView; perShare: bigint | null; lang: Lang; t: LaunchCopy }) {
  const amount = (units: bigint) => <Amount units={units} lang={lang} />;
  const withUnit = (node: ReactNode) => (
    <>
      {node} <span className="text-[14px] font-normal text-ink-soft">{ASSET_SYMBOL}</span>
    </>
  );
  const { progress, pool, config, vault, treasuryFees } = launch;
  const treasuryShareBps = treasuryFees ? sharePctBps(treasuryFees.share, launch) : null;
  const treasuryValue = perShare === null ? null : (launch.treasuryShares * perShare) / UNIT;

  return (
    <ol data-testid="launch-flow" className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-4">
      <Step n={1} title={t.curve.title} body={t.curve.body}>
        <StagePill stage={progress.stage} t={t} />
        <div className="flex flex-col gap-2">
          <ProgressBar bps={progress.bps} label={t.progressLabel} />
          <p className="m-0 flex flex-col gap-1">
            <span className="label text-ink-soft">{t.curve.raised}</span>
            <span className="num text-[17px] font-semibold text-ink" data-testid="launch-raised">
              {fill(t.curve.of, { raised: amount(pool.quoteReserve), threshold: amount(config.migrationQuoteThreshold) })} {ASSET_SYMBOL}
            </span>
          </p>
        </div>
        <dl className="m-0 mt-auto flex flex-col gap-3">
          <Figure label={t.curve.feesWaiting}>{withUnit(amount(pool.partnerQuoteFee))}</Figure>
        </dl>
      </Step>

      <Step n={2} title={t.graduation.title} body={t.graduation.body}>
        <StatCard
          label={t.graduation.price}
          value={launch.dammPrice === null ? t.graduation.priceLater : formatAmount(launch.dammPrice, lang, 6)}
          unit={launch.dammPrice === null ? undefined : PRICE_UNIT}
          hint={launch.dammPrice === null ? undefined : t.graduation.priceHint}
        />
        <dl className="m-0 mt-auto flex flex-col gap-3">
          <Figure label={t.graduation.threshold}>{withUnit(amount(config.migrationQuoteThreshold))}</Figure>
        </dl>
      </Step>

      <Step n={3} title={t.vault.title} body={t.vault.body}>
        <StatCard label={t.vault.received} value={amount(vault.totalFundedFee)} unit={ASSET_SYMBOL} />
        <dl className="m-0 flex flex-col gap-3">
          <Figure label={t.vault.claimed}>{withUnit(amount(vault.totalClaimedFee))}</Figure>
          {treasuryFees ? (
            <>
              <Figure label={t.vault.treasuryCan}>
                <span data-testid="launch-treasury-claimable">{withUnit(amount(treasuryFees.feeUnclaimed))}</span>
              </Figure>
              {treasuryShareBps !== null ? <Figure label={t.vault.treasuryShare}>{formatBps(treasuryShareBps, lang)}</Figure> : null}
            </>
          ) : null}
        </dl>
        <ul className="m-0 mt-auto flex list-none flex-col gap-2 p-0 text-[15px] leading-[1.45]">
          <Check ok={launch.feesGoToVault} testId="launch-vault-check">
            {launch.feesGoToVault ? t.vault.feesGoToVault : t.vault.feesElsewhere}
          </Check>
          {treasuryFees ? null : <Check ok={false}>{t.vault.treasuryNotUser}</Check>}
        </ul>
      </Step>

      <Step n={4} title={t.credit.title} body={t.credit.body}>
        <StatCard
          label={t.credit.holds}
          value={<span data-testid="launch-treasury-shares">{amount(launch.treasuryShares)}</span>}
          unit={t.credit.shares}
          hint={treasuryValue === null ? undefined : `${fillText(t.credit.about, { amount: formatAmount(treasuryValue, lang) })} ${ASSET_SYMBOL}`}
          tone="accent"
        />
        <dl className="m-0 mt-auto flex flex-col gap-3">
          {perShare === null ? null : <Figure label={t.credit.perShare}>{withUnit(formatPerShare(perShare, lang))}</Figure>}
        </dl>
        {perShare === null ? <p className="m-0 border-t border-line pt-3 text-[15px] leading-[1.45] text-ink-soft">{t.credit.poolUnavailable}</p> : null}
      </Step>
    </ol>
  );
}

function sharePctBps(share: number, launch: LaunchView): number {
  const total = launch.vault.users.reduce((sum, u) => sum + u.share, 0);
  return total === 0 ? 0 : Math.round((share * 10_000) / total);
}

function Check({ ok, testId, children }: { ok: boolean; testId?: string; children: ReactNode }) {
  return (
    <li data-testid={testId} data-ok={ok ? "true" : "false"} className={`flex items-start gap-2 ${ok ? "text-green-700" : "text-chili-700"}`}>
      {ok ? (
        <IconCheckCircle size={20} strokeWidth={2.2} className="mt-[2px] shrink-0" />
      ) : (
        <IconClose size={20} strokeWidth={2.2} className="mt-[2px] shrink-0" />
      )}
      <span>{children}</span>
    </li>
  );
}

type AddressRow = { label: string; address: string | null; pending?: string };

function Accounts({ rows, t }: { rows: AddressRow[]; t: LaunchCopy }) {
  return (
    <section aria-labelledby="launch-accounts-title" className="flex flex-col gap-5">
      <SectionHead id="launch-accounts-title" title={t.addresses.title} sub={t.addresses.sub} />
      <ul data-testid="launch-accounts" className="m-0 flex list-none flex-col rounded-[18px] border-[1.5px] border-line bg-white p-0">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-col gap-1 border-b border-line px-4 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="text-[16px] text-ink-soft">{row.label}</span>
            {row.address ? <ExplorerLink address={row.address} t={t} /> : <span className="inline-flex min-h-[44px] items-center text-[16px] text-ink-soft">{row.pending}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function programRows(t: LaunchCopy): AddressRow[] {
  return [
    { label: t.addresses.programDbc, address: PRESET_PROGRAMS.dbc },
    { label: t.addresses.programDammV2, address: PRESET_PROGRAMS.dammV2 },
    { label: t.addresses.programFeeSharing, address: PRESET_PROGRAMS.feeSharing },
  ];
}

function LaunchLive({ preset, t, lang }: { preset: PresetAddresses; t: LaunchCopy; lang: Lang }) {
  const { assetMint } = useAppConfig();
  const query = useLaunchQuery(preset);
  const poolQuery = usePoolQuery();
  const state = dataState(query);
  const result = query.data;
  const perShare = poolQuery.data?.kind === "ok" ? poolQuery.data.pool.perShare : null;

  const rows: AddressRow[] = [
    { label: t.addresses.dbcPool, address: preset.dbcPool },
    { label: t.addresses.dbcConfig, address: preset.dbcConfig },
    { label: t.addresses.baseToken, address: preset.baseMint },
    { label: t.addresses.quoteToken, address: assetMint },
    { label: t.addresses.feeVault, address: preset.feeVault },
    { label: t.addresses.treasury, address: preset.treasury },
    ...(result?.kind === "ok" ? [{ label: t.addresses.treasuryShareAccount, address: result.launch.treasuryShareAccount }] : []),
    { label: t.addresses.dammPool, address: preset.dammPool, pending: t.addresses.dammPending },
    ...programRows(t),
  ];

  let body: ReactNode;
  if (state === "loading") {
    body = (
      <section aria-busy="true" aria-label={t.flowTitle} className="flex flex-col gap-4" data-testid="launch-loading">
        <Loader label={t.loading} className="sr-only" />
        <SkeletonGrid count={4} lines={3} />
      </section>
    );
  } else if (!result) {
    body = (
      <Notice tone="error" role="alert">
        <span>{t.loadFailed}</span>
        <RetryButton label={t.retry} onClick={() => void query.refetch()} />
      </Notice>
    );
  } else if (result.kind === "mismatch") {
    body = (
      <div
        role="alert"
        data-testid="launch-mismatch"
        data-reason={result.reason}
        className="flex flex-col gap-2 rounded-[18px] border-[1.5px] border-chili-700/30 bg-chili-50 px-5 py-4"
      >
        <p className="m-0 font-display text-[20px] font-semibold text-chili-700">{t.mismatch.title}</p>
        <p className="m-0 text-[17px] leading-[1.55] text-ink">{t.mismatch[result.reason]}</p>
      </div>
    );
  } else {
    body = (
      <section aria-labelledby="launch-flow-title" className="flex flex-col gap-5">
        <SectionHead id="launch-flow-title" title={t.flowTitle} sub={t.flowSub} />
        {state === "stale" ? (
          <Notice tone="warn" role="status">
            <span>{t.stale}</span>
            <RetryButton label={t.retry} onClick={() => void query.refetch()} />
          </Notice>
        ) : null}
        <Flow launch={result.launch} perShare={perShare} lang={lang} t={t} />
      </section>
    );
  }

  return (
    <>
      {body}
      <Accounts rows={rows} t={t} />
    </>
  );
}

/**
 * `preset` defaults to the committed address book entry for the configured cluster; tests pass
 * one in. Null means not launched: the page says so and reads nothing.
 */
export function LaunchPage({ preset }: { preset?: PresetAddresses | null } = {}) {
  const { t, lang } = useLang();
  const l = t.app.launch;
  const { explorerCluster } = useAppConfig();
  const active = preset === undefined ? (PRESET[explorerCluster] ?? null) : preset;

  return (
    <PageBody>
      <PageHead title={l.title} sub={l.sub} />
      <p
        role="note"
        data-testid="launch-note"
        className="m-0 max-w-[72ch] rounded-[18px] border-[1.5px] border-corn-300 bg-corn-100 px-4 py-3 text-[17px] leading-[1.55] text-ink"
      >
        {l.note}
      </p>
      {active ? (
        <LaunchLive preset={active} t={l} lang={lang} />
      ) : (
        <>
          <div data-testid="launch-not-launched">
            <EmptyState title={l.notLaunched.title} body={l.notLaunched.body} />
          </div>
          <Accounts rows={programRows(l)} t={l} />
        </>
      )}
    </PageBody>
  );
}
