---
title: How the pool works
description: Deposits and shares, value per share, credit lines, draws and repayments, write-offs, the pause, and liquidity for redemptions.
---

The pool holds one asset (tMXN on devnet) in a vault the program controls. Investors own the pool through shares. Borrowers draw from the vault and repay into it.

## Net asset value and value per share

The pool's net asset value (NAV) is:

| Term | Meaning |
|---|---|
| NAV | vault balance + principal lent out and not yet repaid or written off |
| Supply | all pool shares in existence |
| Value per share | NAV / supply |

Interest is counted when it is repaid. Nothing accrues in the NAV between repayments, and there is no price feed.

## Deposits and shares

A deposit moves tMXN into the vault and issues shares at the current value per share: `shares = assets * supply / NAV`. A redemption burns shares and pays out `assets = shares * NAV / supply`. Both results round down, in favour of the pool. This is the accounting of the ERC-4626 vault standard.

- **First deposit.** While the pool has no shares, one tMXN buys one share. The first deposit must be at least 1 tMXN, and 1,000 base units of its shares (0.001 share) are locked forever in an account the pool owns. The supply can never return below that floor, so a donation to the vault cannot round later deposits down to zero shares.
- **Minimums.** Every deposit and redemption names the least the caller accepts (`min_shares_out`, `min_assets_out`). If the result would be lower, the transaction fails and nothing moves.

## Lines, draws and repayments

1. **Open.** The pool admin approves a credit line for a borrower: principal, fixed interest, the end of the term, and the hash of the signed credit agreement. The admin and the borrower sign the opening together; a named sponsor signs too. Opening moves no money.
2. **Draw.** The borrower takes the whole principal from the vault, before the term ends. The vault balance falls and the principal lent out rises by the same amount, so the NAV does not change.
3. **Repay.** Anyone may repay a line on the borrower's behalf; the payer is recorded. Principal coming back lowers the principal lent out and raises the vault by the same amount. Interest coming back raises the vault only, so the NAV and the value of every share rise.

See [Credit lines](/credit-lines) for single-maturity and installment lines.

### Example (devnet demo script, test tokens)

| Step | Vault | Lent out | NAV | Supply | Value per share |
|---|---|---|---|---|---|
| Two investors deposit 10,000 and 5,000 | 15,000 | 0 | 15,000 | 15,000 | 1.000 |
| A 6,000 line with 720 of interest is drawn | 9,000 | 6,000 | 15,000 | 15,000 | 1.000 |
| 6,000 principal and 720 interest repaid | 15,720 | 0 | 15,720 | 15,000 | 1.048 |

The figures illustrate the formula with tMXN, a test token with no value. They are not a forecast.

## Interest counts when it is repaid

Because interest enters the NAV only when it arrives, a deposit made just before a repayment shares in that interest as if it had been in the pool all along, and can be redeemed right after. This is a known property of the demo; see [Roadmap and limits](/reference/roadmap).

## Write-off

When a line is overdue past the rules in [Credit lines](/credit-lines#write-off), the admin may write it off. The unpaid principal leaves the principal lent out, so the NAV falls once and every share is worth less. Until the admin records the write-off, the line counts at full value. The operator procedure is: pause, write off, unpause, so nobody redeems at the value before the loss.

After a total loss (NAV zero with shares still outstanding) deposits fail: the value per share is undefined and the pool cannot be refilled.

## Pause

The admin can pause the pool.

| Paused | Never paused |
|---|---|
| deposit, redeem, open a line, draw | repay, move a line to collection, write off, unpause |

A borrower can always pay and cure arrears.

## Liquidity and redemptions

A redemption is paid from the vault only. If most of the pool is lent out, holders can redeem up to what the vault holds now, first come first served; more becomes available as loans are repaid. The app shows the most you can redeem at the moment.
