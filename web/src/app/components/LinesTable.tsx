// Credit lines as a table from 768 px up and as cards below. Rows come from the tolerant line
// adapter: a status or layout this code does not know shows as "Unknown", and an account it
// cannot read at all still gets its row with the line id. Lines carry no names here: the chain
// gives addresses, and the connected wallet's own address is tagged "You".
import { useContext } from "react";
import type { LineStatusView, LineView } from "../../pool/line";
import { explorerAddressUrl, formatDate, truncateMiddle, type ExplorerCluster } from "../../pool/format";
import type { Copy, Lang } from "../../translations";
import { WalletContext } from "../../wallet/useWallet";
import { useExplorerRpcUrl } from "../configContext";
import type { PoolLine } from "../queries";
import { Amount } from "./Amount";

type PoolCopy = Copy["app"]["pool"];

const PILL: Record<LineStatusView, string> = {
  approved: "st-approved",
  active: "st-active",
  repaid: "st-repaid",
  writtenOff: "st-written",
  inCollection: "st-collection",
  unknown: "st-unknown",
};

/** Status of a line: its word and a colour; colour is never the only signal. */
export function LineStatusBadge({ status, labels }: { status: LineStatusView; labels: PoolCopy["status"] }) {
  return (
    <span data-status={status} className={`app-pill ${PILL[status]}`}>
      {labels[status]}
    </span>
  );
}

/** Principal drawn so far: a draw moves the whole principal, so it is all or nothing. */
export function drawnAmount(line: LineView): bigint {
  return line.drawnAt !== null ? line.principal : 0n;
}

/** Principal and fixed interest paid back so far. */
export function repaidAmount(line: LineView): bigint {
  return line.principalRepaid + line.interestRepaid;
}

function AddressLink({ address, cluster, newTab, you }: { address: string; cluster: ExplorerCluster; newTab: string; you: string | null }) {
  const rpcUrl = useExplorerRpcUrl();
  return (
    <span className="inline-flex flex-wrap items-center">
      <a
        href={explorerAddressUrl(address, cluster, rpcUrl)}
        target="_blank"
        rel="noreferrer"
        title={address}
        className="num inline-flex min-h-[44px] items-center text-[14px] text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
      >
        {truncateMiddle(address)}
        <span className="sr-only"> ({newTab})</span>
      </a>
      {you ? <span className="app-you">{you}</span> : null}
    </span>
  );
}

export type LinesTableProps = {
  rows: PoolLine[];
  t: PoolCopy;
  lang: Lang;
  cluster: ExplorerCluster;
  /** Word for the tag next to the connected wallet's address. */
  youLabel?: string;
};

export function LinesTable({ rows, t, lang, cluster, youLabel = "" }: LinesTableProps) {
  const c = t.columns;
  // Optional: the pool page is public and also renders outside a wallet provider.
  const me = useContext(WalletContext)?.address ?? null;
  const you = (a: string | null) => (me !== null && a === me && youLabel ? youLabel : null);
  const showSponsor = rows.some((r) => r.view.readable && r.view.sponsor !== null);
  const amount = (units: bigint) => <Amount units={units} lang={lang} />;
  const date = (s: number | null) => (s === null ? t.noDate : formatDate(s, lang));
  const columns = 7 + (showSponsor ? 1 : 0);

  return (
    <div data-testid="lines">
      <div className="hidden overflow-x-auto md:block">
        <table className="app-tbl">
          <caption className="sr-only">{t.linesCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{c.line}</th>
              <th scope="col">{c.status}</th>
              <th scope="col">{c.borrower}</th>
              <th scope="col" className="num-col">{c.principal}</th>
              <th scope="col" className="num-col">{c.drawn}</th>
              <th scope="col" className="num-col">{c.repaid}</th>
              <th scope="col">{c.due}</th>
              {showSponsor ? <th scope="col">{c.sponsor}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lineId, view }) => (
              <tr key={lineId.toString()} data-line={lineId.toString()}>
                <th scope="row" className="num font-semibold">
                  #{lineId.toString()}
                </th>
                {view.readable ? (
                  <>
                    <td>
                      <LineStatusBadge status={view.status} labels={t.status} />
                    </td>
                    <td>
                      <AddressLink address={view.borrower} cluster={cluster} newTab={t.newTab} you={you(view.borrower)} />
                    </td>
                    <td className="num-col">{amount(view.principal)}</td>
                    <td className="num-col">{amount(drawnAmount(view))}</td>
                    <td className="num-col">{amount(repaidAmount(view))}</td>
                    <td className="num whitespace-nowrap">{date(view.termEnd)}</td>
                    {showSponsor ? (
                      <td>
                        {view.sponsor ? (
                          <AddressLink address={view.sponsor} cluster={cluster} newTab={t.newTab} you={you(view.sponsor)} />
                        ) : (
                          <span className="text-ink-soft">{t.noSponsor}</span>
                        )}
                      </td>
                    ) : null}
                  </>
                ) : (
                  <>
                    <td>
                      <LineStatusBadge status="unknown" labels={t.status} />
                    </td>
                    <td className="text-ink-soft" colSpan={columns - 2}>
                      {t.unreadable}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="m-0 flex list-none flex-col gap-[var(--density-card-gap)] p-0 md:hidden" aria-label={t.linesCaption}>
        {rows.map(({ lineId, view }) => (
          <li key={lineId.toString()} data-line={lineId.toString()} className="app-card flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <h3 className="app-h3 num">
                {c.line} #{lineId.toString()}
              </h3>
              <span className="flex items-center">
                <span className="sr-only">{c.status}:</span>
                <LineStatusBadge status={view.status} labels={t.status} />
              </span>
            </div>
            {view.readable ? (
              <dl className="app-kv">
                <div className="col-span-2">
                  <dt>{c.borrower}</dt>
                  <dd className="!mt-0">
                    <AddressLink address={view.borrower} cluster={cluster} newTab={t.newTab} you={you(view.borrower)} />
                  </dd>
                </div>
                <div>
                  <dt>{c.principal}</dt>
                  <dd>{amount(view.principal)}</dd>
                </div>
                <div>
                  <dt>{c.drawn}</dt>
                  <dd>{amount(drawnAmount(view))}</dd>
                </div>
                <div>
                  <dt>{c.repaid}</dt>
                  <dd>{amount(repaidAmount(view))}</dd>
                </div>
                <div>
                  <dt>{c.due}</dt>
                  <dd>{date(view.termEnd)}</dd>
                </div>
                {view.sponsor ? (
                  <div className="col-span-2">
                    <dt>{c.sponsor}</dt>
                    <dd className="!mt-0">
                      <AddressLink address={view.sponsor} cluster={cluster} newTab={t.newTab} you={you(view.sponsor)} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="m-0 text-[15px] text-ink-soft">{t.unreadable}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
