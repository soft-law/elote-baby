// One figure with its label and an optional one-line hint. Values arrive formatted.
import type { ReactNode } from "react";

export type StatCardProps = {
  label: string;
  value: ReactNode;
  /** Unit after the value, in a smaller type (for example the token symbol). */
  unit?: string;
  hint?: string;
  icon?: ReactNode;
  /** "accent" draws attention to the headline figure. */
  tone?: "default" | "accent";
};

export function StatCard({ label, value, unit, hint, icon, tone = "default" }: StatCardProps) {
  const surface = tone === "accent" ? "bg-teal-50 border-teal-700/30" : "bg-white border-line";
  return (
    <div className={`flex h-full flex-col gap-2 rounded-[18px] border-[1.5px] p-4 md:p-5 ${surface}`}>
      <p className="m-0 flex items-center gap-2 text-ink-soft">
        {icon ? <span className="text-teal-700">{icon}</span> : null}
        <span className="label">{label}</span>
      </p>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2">
        <span className="num text-[26px] font-semibold leading-tight text-ink md:text-[30px]">{value}</span>
        {unit ? <span className="num text-[15px] text-ink-soft">{unit}</span> : null}
      </p>
      {hint ? <p className="m-0 text-[15px] leading-[1.45] text-ink-soft">{hint}</p> : null}
    </div>
  );
}
