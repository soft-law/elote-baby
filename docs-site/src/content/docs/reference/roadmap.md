---
title: Roadmap and limits
description: Known limits of the devnet demo and the changes planned before a pilot with real credit lines. Plans, not shipped.
---

elote.baby is a devnet demo. The program has not been audited yet. This page lists what it does not do today and what is planned. Everything under "Planned" is a plan, not a shipped feature; each program change is planned to go through review and an independent audit before it is deployed.

## Known limits of the demo

| Limit | Effect today |
|---|---|
| One admin key | The pool admin is part of the pool's address and cannot be changed. A compromised admin could open a line to its own wallet and draw the liquidity. |
| One upgrade key | The program's upgrade authority is a single key. |
| Interest counts when repaid | A deposit placed right before a known repayment shares in that interest and can be redeemed right after. |
| Losses count when written off | An overdue line stays at full value until the admin writes it off. Moving a line to collection does not lower the NAV. |
| Pause scope | The pause blocks deposit, redeem, opening and draw only. Repayments, collection and write-off always run. |
| Any SPL asset | `init_pool` accepts any classic SPL token, including tokens with a freeze authority, and assumes 6 decimals for the first-deposit minimum. |
| Late interest | Collected only when a repayment arrives, never counted in the NAV before; unpaid late interest is not part of a write-off. |
| No acceleration | Collection does not bring remaining installments forward. |
| No cancel | A line can stay Approved forever if the borrower never draws. |
| No recoveries | After a write-off, a later recovery cannot be recorded as such; the line no longer takes repayments. |
| Redemptions | First come first served against the vault, with no queue or reserve. |
| History | The app reads the last 20 transactions per address from public RPC; there is no archive yet. |

## Planned before a pilot

These come from a review of what a first pool of real credit lines needs. Capacity is not the issue: nothing in the program iterates over lines and each line is its own account. The work is about fit.

| Plan | Why |
|---|---|
| **Two-step origination.** The admin offers a line alone; the borrower accepts it later from their own wallet, confirming the agreement hash. Sponsor confirmation becomes optional and separate. | Today the admin and the borrower must sign the same transaction, which does not work with a multisig admin or with borrowers who sign days later. |
| **Amortisation table that fits the signed agreement.** Each line carries its installment table (due date, principal and interest per installment) from the same document whose hash it stores, with payments applied per installment and prepayment as the agreement says. | Today interest is a flat amount fixed at opening, installments are level and count from the draw. A real agreement uses interest on the outstanding balance and calendar due dates, so the chain and the contract would state different amounts. |
| **Multisig** as pool admin and as program upgrade authority, with separate roles: an operator for offers within per-line and per-pool limits, a pauser that cannot unpause. | Removes the single key. |
| **A real asset with token checks.** A new pool on a real asset, with checks at creation for the token program, decimals and freeze policy, and a first-deposit minimum derived from the decimals. | Today any SPL token is accepted. |
| **Keeper and archival indexer.** A daily job computes arrears, sends reminders and moves lines to collection when eligible; an indexer stores every event for statements and reconciliation. | Someone has to call collection on time, and 20 transactions per address is not an archive. |
| **Recovery after write-off** and **cancel for undrawn lines.** | Money recovered after a write-off should return to the pool as such; an unused offer should be withdrawable. |
| **Liquidity rules.** A reserve the vault keeps on each draw, or redemption windows. | Redemptions today are first come first served. |

Further out: sponsor escrow and interest accounting, and collateral in SPL tokens.

## Languages

These docs are in English. A Spanish version is planned.
