// Redeem shares for test tokens. Max is min(your shares, maxRedeemableShares): when the vault
// cannot pay for all your shares right now, a notice says the pool's liquidity is the limit, and a
// larger amount is rejected here before any signature. The preview floor is the minAssetsOut sent.
import { Amount } from "../components/Amount";
import { fill } from "../fill";
import { formatAmount } from "../../pool/format";
import { DECIMALS } from "../../pool/math";
import type { Copy, Lang } from "../../translations";
import type { UseTx } from "../../tx/useTx";
import { AmountForm } from "./AmountForm";
import { fieldErrorText } from "./errors";
import { checkRedeem, redeemLimit, type PoolFigures } from "./validation";

export type RedeemFormProps = {
  pool: PoolFigures & { paused: boolean };
  /** Shares held, in base units; undefined while balances load. */
  shares: bigint | undefined;
  tx: UseTx;
  t: Copy;
  lang: Lang;
};

export function RedeemForm({ pool, shares, tx, t, lang }: RedeemFormProps) {
  const r = t.app.invest.redeem;
  const held = shares ?? 0n;
  const limit = redeemLimit(pool, held);
  const full = (units: bigint) => <span className="num font-semibold">{formatAmount(units, lang, DECIMALS)}</span>;

  let notes = null;
  if (shares !== undefined && held > 0n && limit.capped) {
    notes = (
      <p data-testid="liquidity-notice" role="note" className="m-0 rounded-[14px] bg-corn-100 px-4 py-3 text-[16px] leading-[1.55] text-ink">
        {limit.cap === 0n ? r.noLiquidity : fill(r.liquidityCap, { liquidity: full(pool.vaultAmount), max: full(limit.cap) })}
      </p>
    );
  }

  return (
    <AmountForm
      name="redeem"
      t={t}
      title={r.title}
      sub={r.sub}
      label={r.label}
      unit={t.app.invest.shareUnit}
      available={shares === undefined ? null : fill(r.available, { amount: <Amount units={shares} lang={lang} visibleDecimals={DECIMALS} /> })}
      maxText={r.max}
      maxLabel={r.maxLabel}
      max={shares === undefined ? null : limit.max}
      check={(input) => checkRedeem(input, pool, held)}
      preview={({ expected, min }) => (
        <span data-testid="redeem-quote" data-expected={expected.toString()} data-min={min.toString()}>
          {fill(r.preview, {
            expected: <span className="num font-semibold text-ink">{formatAmount(expected, lang, DECIMALS)}</span>,
            min: (
              <span className="num font-semibold text-ink" data-testid="redeem-min">
                {formatAmount(min, lang, DECIMALS)}
              </span>
            ),
          })}
        </span>
      )}
      previewEmpty={r.previewEmpty}
      notes={notes}
      errorText={(error) => fieldErrorText(error, t, lang)}
      blocked={pool.paused || shares === undefined}
      submitText={r.submit}
      toOp={({ units, min }) => ({ kind: "redeem", shares: units, minAssetsOut: min })}
      tx={tx}
    />
  );
}
