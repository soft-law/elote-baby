// Installments of a scheduled (version 2) line: number, due date (or "from the draw"), amount and
// paid, partly paid, overdue or upcoming. Renders nothing for a line without a usable schedule.
import { useId } from "react";
import { fillText } from "../fill";
import { formatDate, formatDuration } from "../../pool/format";
import type { LineView } from "../../pool/line";
import { installmentRows, usableSchedule, type InstallmentState } from "../../pool/schedule";
import type { Copy, Lang } from "../../translations";
import { Amount } from "./Amount";

const STATE_STYLE: Record<InstallmentState, string> = {
  paid: "bg-green-50 text-green-700",
  partial: "bg-teal-50 text-teal-800",
  overdue: "bg-chili-50 text-chili-700",
  pending: "bg-mist text-ink-soft",
};

export function ScheduleBlock({ line, now, t, lang }: { line: LineView; now: number; t: Copy; lang: Lang }) {
  const s = t.app.borrow.schedule;
  const titleId = useId();
  const schedule = line.schedule;
  if (!usableSchedule(schedule)) return null;
  const rows = installmentRows(line, BigInt(now));
  return (
    <section aria-labelledby={titleId} data-testid="schedule" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h4 id={titleId} className="app-h3 text-ink">
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
            className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-paper px-3 py-2"
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
              <span className={`inline-flex whitespace-nowrap rounded-[6px] px-2 py-0.5 font-mono text-[13px] font-medium uppercase tracking-[0.06em] ${STATE_STYLE[row.state]}`}>
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
