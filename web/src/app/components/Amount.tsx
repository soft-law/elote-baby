// An amount shown with up to `visibleDecimals` decimals. When that hides digits (for example
// 0.004 shown as 0), the full value is the tooltip and what a screen reader hears.
import { formatAmount } from "../../pool/format";
import { DECIMALS } from "../../pool/math";
import type { Lang } from "../../translations";

export type AmountProps = { units: bigint; lang: Lang; visibleDecimals?: number };

export function Amount({ units, lang, visibleDecimals = 2 }: AmountProps) {
  const short = formatAmount(units, lang, visibleDecimals);
  const full = formatAmount(units, lang, DECIMALS);
  if (short === full) return <>{short}</>;
  return (
    <span title={full} data-full={full}>
      <span aria-hidden="true">{short}</span>
      <span className="sr-only">{full}</span>
    </span>
  );
}
