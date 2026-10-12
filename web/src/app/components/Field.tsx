// One label and value of a details list (<dl>), and an amount in the mono numeral style.
import type { ReactNode } from "react";
import type { Lang } from "../../translations";
import { Amount } from "./Amount";

export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="label text-ink-soft">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-[16px] text-ink">{children}</dd>
    </div>
  );
}

export function money(units: bigint, lang: Lang) {
  return (
    <span className="num">
      <Amount units={units} lang={lang} />
    </span>
  );
}
