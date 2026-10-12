---
title: For borrowers
description: Draw an approved line, see what is due now, repay, follow the installment schedule and read the agreement summary.
---

The **Borrow** page of the pool app lists the credit lines opened for the wallet you connect, and the lines that wallet sponsors. All amounts are in tMXN, a test token with no value.

## Before a line appears

A line is opened by the pool admin after the credit agreement is signed by every party. The borrower signs the opening transaction together with the admin (and the sponsor, if one is named). See [Programmable loan contracts](/guides/loan-contracts). Until then the page says there are no lines for this wallet.

## Draw

An **Approved** line shows **Draw**. It moves the whole principal to your wallet; your wallet asks you to sign. The app explains when a draw is not possible:

| Note | Why |
|---|---|
| Draws are on hold | The pool is paused. |
| Not enough liquidity | The vault holds less than the principal right now. |
| The term has ended | A line cannot be drawn after its term end. |
| The last installment would fall after the term | For an installment line, due dates count from the draw. |

## Repay

**Repay** accepts partial repayments. Anyone may repay a line, so a sponsor uses the same form.

- **Due now** is what brings the line up to date: overdue installments plus late interest, else the next installment, else what remains.
- **Max** is the most the line takes now, up to your balance. The program never takes more than is due.
- On an installment line the payment settles late interest first, then interest, then principal. Late interest is an estimate at the moment you open the form; the app adds a small margin, and the exact amount is settled on chain when the repayment lands.
- On a single-maturity line the payment goes to principal first, then interest.

Repayments are never paused, also while the line is in collection.

## Schedule

An installment line shows **Installments**: number, due date, amount and status (Paid, Partly paid, Overdue, Upcoming), and under **Late interest** the yearly late rate, the late interest paid so far, what is due now and the grace period. See [Credit lines](/credit-lines#version-2-installments) for how this is computed.

## Agreement summary

Under **Agreement** each line shows its agreement hash (with a copy button) and, when the agreements server knows that hash, a summary: template, agreement status (Draft, Waiting for signatures, Signed, Recorded on Solana), signatures collected, the date it was drafted, and a link to its evidence. The summary never includes the document itself.

## History

**History** on each line lists its last 20 transactions, newest first: opened, schedule set, drawn, repaid (principal and interest), late interest paid, sent to collection, written off.
