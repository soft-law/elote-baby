// Credit lines as a table from 768 px up and as cards below. Rows come from the tolerant line
// adapter: a status or layout this code does not know shows as "Unknown", and an account it
// cannot read at all still gets its row with the line id.
import type { LineStatusView, LineView } from "../../pool/line";
import { explorerAddressUrl, formatDate, truncateMiddle, type ExplorerCluster } from "../../pool/format";
import type { Copy, Lang } from "../../translations";
import { useExplorerRpcUrl } from "../configContext";
import type { PoolLine } from "../queries";
import { Amount } from "./Amount";

type PoolCopy = Copy["app"]["pool"];

const BADGE: Record<LineStatusView, string> = {
  approved: "bg-teal-50 text-teal-800 border-teal-700/30",
  active: "bg-white text-teal-800 border-teal-700",
  repaid: "bg-green-50 text-green-700 border-green-700/30",
  writtenOff: "bg-mist text-ink-soft border-fog",
  inCollection: "bg-corn-100 text-ink border-corn-300",
  unknown: "bg-white text-ink-soft border-dashed border-fog-dim",
};

/** Neutral status label of a line. */
export function LineStatusBadge({ status, labels }: { status: LineStatusView; labels: PoolCopy["status"] }) {
  return (
    <span
      data-status={status}
      className={`inline-flex items-center whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-0.5 text-[14px] font-semibold ${BADGE[status]}`}
    >
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

function AddressLink({ address, cluster, newTab }: { address: string; cluster: ExplorerCluster; newTab: string }) {
  const rpcUrl = useExplorerRpcUrl();
  return (
    <a
      href={explorerAddressUrl(address, cluster, rpcUrl)}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="num inline-flex min-h-[44px] items-center text-[15px] text-teal-700 underline decoration-teal-700/40 underline-offset-4 hover:decoration-teal-700"
    >
      {truncateMiddle(address)}
      <span className="sr-only"> ({newTab})</span>
    </a>
  );
}

export type LinesTableProps = {
  rows: PoolLine[];
  t: PoolCopy;
  lang: Lang;
  cluster: ExplorerCluster;
};

export function LinesTable({ rows, t, lang, cluster }: LinesTableProps) {
  const c = t.columns;
  const showSponsor = rows.some((r) => r.view.readable && r.view.sponsor !== null);
  const amount = (units: bigint) => <Amount units={units} lang={lang} />;
  const date = (s: number | null) => (s === null ? t.noDate : formatDate(s, lang));
  const columns = 7 + (showSponsor ? 1 : 0);
  const th = "label px-3 py-3 text-left font-medium text-ink-soft";
  const td = "px-3 py-2 align-middle";

  return (
    <div data-testid="lines">
      <div className="hidden overflow-x-auto rounded-[18px] border-[1.5px] border-line bg-white md:block">
        <table className="w-full border-collapse text-[16px]">
          <caption className="sr-only">{t.linesCaption}</caption>
          <thead className="border-b border-line bg-mist">
            <tr>
              <th scope="col" className={th}>{c.line}</th>
              <th scope="col" className={th}>{c.borrower}</th>
              <th scope="col" className={th}>{c.status}</th>
              <th scope="col" className={`${th} text-right`}>{c.principal}</th>
              <th scope="col" className={`${th} text-right`}>{c.drawn}</th>
              <th scope="col" className={`${th} text-right`}>{c.repaid}</th>
              <th scope="col" className={th}>{c.due}</th>
              {showSponsor ? <th scope="col" className={th}>{c.sponsor}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lineId, view }) => (
              <tr key={lineId.toString()} data-line={lineId.toString()} className="border-b border-line last:border-b-0">
                <th scope="row" className={`${td} num text-left font-semibold`}>
                  #{lineId.toString()}
                </th>
                {view.readable ? (
                  <>
                    <td className={td}>
                      <AddressLink address={view.borrower} cluster={cluster} newTab={t.newTab} />
                    </td>
                    <td className={td}>
                      <LineStatusBadge status={view.status} labels={t.status} />
                    </td>
                    <td className={`${td} num text-right`}>{amount(view.principal)}</td>
                    <td className={`${td} num text-right`}>{amount(drawnAmount(view))}</td>
                    <td className={`${td} num text-right`}>{amount(repaidAmount(view))}</td>
                    <td className={`${td} whitespace-nowrap`}>{date(view.termEnd)}</td>
                    {showSponsor ? (
                      <td className={td}>
                        {view.sponsor ? <AddressLink address={view.sponsor} cluster={cluster} newTab={t.newTab} /> : t.noSponsor}
                      </td>
                    ) : null}
                  </>
                ) : (
                  <>
                    <td className={td} />
                    <td className={td}>
                      <LineStatusBadge status="unknown" labels={t.status} />
                    </td>
                    <td className={`${td} text-ink-soft`} colSpan={columns - 3}>
                      {t.unreadable}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden" aria-label={t.linesCaption}>
        {rows.map(({ lineId, view }) => (
          <li key={lineId.toString()} data-line={lineId.toString()} className="flex flex-col gap-3 rounded-[18px] border-[1.5px] border-line bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="num font-semibold">
                {c.line} #{lineId.toString()}
              </span>
              <span className="flex items-center gap-2">
                <span className="sr-only">{c.status}:</span>
                <LineStatusBadge status={view.status} labels={t.status} />
              </span>
            </div>
            {view.readable ? (
              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-[16px]">
                <div className="col-span-2 flex flex-col">
                  <dt className="label text-ink-soft">{c.borrower}</dt>
                  <dd className="m-0">
                    <AddressLink address={view.borrower} cluster={cluster} newTab={t.newTab} />
                  </dd>
                </div>
                <div className="flex flex-col">
                  <dt className="label text-ink-soft">{c.principal}</dt>
                  <dd className="num m-0">{amount(view.principal)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="label text-ink-soft">{c.drawn}</dt>
                  <dd className="num m-0">{amount(drawnAmount(view))}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="label text-ink-soft">{c.repaid}</dt>
                  <dd className="num m-0">{amount(repaidAmount(view))}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="label text-ink-soft">{c.due}</dt>
                  <dd className="m-0">{date(view.termEnd)}</dd>
                </div>
                {view.sponsor ? (
                  <div className="col-span-2 flex flex-col">
                    <dt className="label text-ink-soft">{c.sponsor}</dt>
                    <dd className="m-0">
                      <AddressLink address={view.sponsor} cluster={cluster} newTab={t.newTab} />
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="m-0 text-[16px] text-ink-soft">{t.unreadable}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
