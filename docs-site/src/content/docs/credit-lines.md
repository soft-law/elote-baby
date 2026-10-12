---
title: Credit lines
description: Single-maturity and installment lines, the schedule, grace period, late interest, collection, the sponsor co-signer and the agreement hash.
---

Every credit line is its own account on chain. Lines are numbered in order from 0 within a pool. A line holds the borrower, the principal, a fixed interest amount, the end of the term, the agreement hash, what was repaid, and its status.

## Terms common to every line

| Term | Meaning |
|---|---|
| Principal | Paid out in full by one draw. |
| Rate | `rate_bps`, at most 10,000 (100%). It is a rate over the whole term, not a yearly rate: the interest is `principal * rate_bps / 10,000`, fixed at opening. |
| Term end | The draw must happen before it. |
| Agreement hash | The 32-byte hash of the signed credit agreement. It cannot be empty. See [Programmable loan contracts](/guides/loan-contracts). |
| Sponsor | Optional. See [below](#sponsor-co-signer). |

## Statuses

| Status | Meaning |
|---|---|
| Approved | Opened, not drawn. A line can stay here if the borrower never draws; there is no cancel yet. |
| Active | Drawn, with principal or interest still due. |
| In collection | An installment line with too many missed installments. Repayments are still accepted. |
| Repaid | Nothing remains. |
| Written off | The admin recognised the unpaid principal as a loss. |

## Version 1: single maturity

A line opened without a schedule is repaid at one maturity, the end of the term. Each repayment goes to principal first, then to interest. A repayment can never exceed what remains. The line is repaid when principal and interest are both paid.

## Version 2: installments

A line opened with a schedule is repaid in installments.

| Schedule term | Meaning | Limits |
|---|---|---|
| Interval | Seconds between due dates. Installment `k` falls due `k` intervals after the draw. | positive |
| Installments | `(principal + interest)` is split into this many equal installments, rounded down; the last one carries the remainder, so they add up exactly. | 1 to 120, at least one base unit each |
| Late rate | `late_bps`, a yearly rate (365 days) on overdue amounts. | at most 10,000 |
| Missed before collection | How many missed installments allow collection. | at least 3, at most the number of installments |

Due dates count from the draw. The last one must fall no later than the term end: the program checks this at opening and again at the draw, so a line drawn too late cannot be drawn.

**Repayment order:** late interest first, then interest, then principal. The program never takes more than is due; if you send more, the rest stays in your account.

### Missed installments

Missed installments are computed, never stored: installments that have fallen due, minus installments fully covered by what was repaid. At its due second an installment already counts as due. A repayment ahead of time counts toward the next installments.

### Grace period

Each pool has one grace period, fixed when the pool is created. It delays late interest, collection and write-off. It does not change the count of missed installments.

### Late interest

Late interest accrues on each overdue amount from its due date plus the grace period (or from the last repayment, whichever is later), by the second, at the late rate.

- Each repayment must cover the late interest due at that second. Late interest grows every second, so the app adds a small margin; the program takes only what is due.
- Within one repayment, the late interest on an overdue amount never exceeds that amount.
- Over the life of the line, late interest collected never exceeds the principal.
- Late interest goes to the vault and raises the NAV like interest. It is counted only when it is paid, and unpaid late interest is not part of a write-off.

### In collection

Once the allowed number of installments is missed and the grace period of the last of them has run, anyone may move the line to **In collection**. This only records the fact. It does not bring the remaining installments forward: they keep their due dates. Repayments are still accepted; a full repayment moves the line to Repaid. A payment that cures the arrears leaves the status as it is, but then nothing is missed and a write-off is not allowed on that ground.

## Write-off

Only the admin may write off a line, and only:

- for an **Active** line, after the term end plus the grace period; or
- for a line **In collection**, after its oldest missed due date plus the grace period, or after the term end plus the grace period.

The policy behind it: after the third month in arrears the line goes to out-of-court collection, and the admin records the write-off. The loss is the principal not yet repaid.

## Sponsor co-signer

A line can name a sponsor, such as a public support program for small businesses. A named sponsor must sign the opening together with the admin and the borrower. Like anyone, the sponsor may repay; in the demo it pays the interest. A sponsor never touches the pool's money otherwise. The app lists lines a wallet sponsors under "Lines you sponsor".

## Agreement hash

The line stores the hash of the credit agreement every party signed with their own wallet, and the `LineOpened` event repeats it. Anyone holding the signed agreement, or its evidence package, can recompute the hash and compare it with the line. The document itself never goes on chain, and nothing personal is stored on the line besides the borrower's wallet address.
