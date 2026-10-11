// Deposit test tokens for shares. The preview floor ("minimum Y") is the minSharesOut sent; on an
// empty pool the form explains the 1 tMXN minimum and the 1,000 locked base units, and rejects a
// smaller amount with the same copy the program's FirstDepositTooSmall maps to.
import { Amount } from "../components/Amount";
import { fill } from "../fill";
import { formatAmount } from "../../pool/format";
import { DECIMALS } from "../../pool/math";
import type { Copy, Lang } from "../../translations";
import type { UseTx } from "../../tx/useTx";
import { AmountForm } from "./AmountForm";
import { checkDeposit, type FieldError, type PoolFigures } from "./validation";

export const ASSET_SYMBOL = "tMXN";

/** Field message for a validation error. Shared by both forms. */
export function fieldErrorText(error: FieldError, t: Copy, lang: Lang): string {
  const e = t.app.invest.errors;
  switch (error.code) {
    case "firstDepositTooSmall":
      return t.app.tx.errors.program.firstDepositTooSmall;
    case "zeroShares":
      return t.app.tx.errors.program.zeroShares;
    case "aboveLiquidity":
      return e.aboveLiquidity.replace("{max}", formatAmount(error.max, lang, DECIMALS));
    default:
      return e[error.code];
  }
}

export type DepositFormProps = {
  pool: PoolFigures & { paused: boolean };
  /** Test token balance in base units; undefined while it loads. */
  balance: bigint | undefined;
  tx: UseTx;
  t: Copy;
  lang: Lang;
};

export function DepositForm({ pool, balance, tx, t, lang }: DepositFormProps) {
  const d = t.app.invest.deposit;
  const first = pool.supply === 0n;
  return (
    <AmountForm
      name="deposit"
      t={t}
      title={d.title}
      sub={d.sub}
      label={d.label}
      unit={ASSET_SYMBOL}
      available={balance === undefined ? null : fill(d.available, { amount: <Amount units={balance} lang={lang} visibleDecimals={DECIMALS} /> })}
      maxText={d.max}
      maxLabel={d.maxLabel}
      max={balance ?? null}
      check={(input) => checkDeposit(input, pool, balance ?? 0n)}
      preview={({ expected, min }) => (
        <span data-testid="deposit-quote" data-expected={expected.toString()} data-min={min.toString()}>
          {fill(d.preview, {
            expected: <span className="num font-semibold text-ink">{formatAmount(expected, lang, DECIMALS)}</span>,
            min: (
              <span className="num font-semibold text-ink" data-testid="deposit-min">
                {formatAmount(min, lang, DECIMALS)}
              </span>
            ),
          })}
        </span>
      )}
      previewEmpty={d.previewEmpty}
      notes={
        first ? (
          <p data-testid="first-deposit-note" className="m-0 rounded-[14px] bg-corn-100 px-4 py-3 text-[16px] leading-[1.55] text-ink">
            {d.firstNote}
          </p>
        ) : null
      }
      errorText={(error) => fieldErrorText(error, t, lang)}
      blocked={pool.paused || balance === undefined}
      submitText={d.submit}
      toOp={({ units, min }) => ({ kind: "deposit", assets: units, minSharesOut: min })}
      tx={tx}
    />
  );
}
