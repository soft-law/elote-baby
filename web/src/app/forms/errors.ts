// Field messages for the amount forms (deposit, redeem, and later repay). The first-deposit and
// zero-share messages reuse the program error copy, so the form and the program say the same thing.
import { formatAmount } from "../../pool/format";
import { DECIMALS } from "../../pool/math";
import type { Copy, Lang } from "../../translations";
import { fillText } from "../fill";
import type { FieldError } from "./validation";

export function fieldErrorText(error: FieldError, t: Copy, lang: Lang): string {
  const e = t.app.invest.errors;
  switch (error.code) {
    case "firstDepositTooSmall":
      return t.app.tx.errors.program.firstDepositTooSmall;
    case "zeroShares":
      return t.app.tx.errors.program.zeroShares;
    case "aboveLiquidity":
      return fillText(e.aboveLiquidity, { max: formatAmount(error.max, lang, DECIMALS) });
    default:
      return e[error.code];
  }
}
