---
title: Program reference
description: The elote_pool Solana program. Instructions, accounts, PDAs, errors 6000 to 6018 and events.
---

`elote_pool` is an Anchor 1.1.2 program on Solana. Program id `BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM`. A TypeScript client generated from the IDL with Codama lives in `clients/js`.

## Instructions

| Instruction | Signers | Paused? | Effect |
|---|---|---|---|
| `init_pool(grace_period_seconds)` | admin | n/a | Creates the pool, its share token, its vault and its dead-shares account for one asset. The grace period is fixed for the life of the pool. |
| `deposit(assets, min_shares_out)` | depositor | blocked | Assets in, shares out at the current NAV. The first deposit is at least 1.0 and locks 1,000 base units of shares. |
| `redeem(shares, min_assets_out)` | holder | blocked | Shares burned, assets out at the current NAV, up to the vault's balance. |
| `open_line(line_id, principal, rate_bps, term_end, agreement_hash, sponsor, schedule)` | admin, borrower, sponsor if named | blocked | Approves the next line in sequence. Moves no money. With `schedule` the line is an installment line (version 2). |
| `draw` | borrower | blocked | Pays the whole principal from the vault to the borrower, before the term ends (and, for an installment line, early enough for the last installment to fall within the term). |
| `repay(amount)` | anyone | never | Version 1: principal, then interest. Version 2: late interest, then interest, then principal, never more than is due. The line is repaid when nothing remains. |
| `mark_in_collection` | anyone | never | Moves an installment line to collection once enough installments are missed and the grace period of the last of them has run. |
| `write_off` | admin | never | Recognises the unpaid principal as a loss, after the term plus grace, or for a line in collection after its oldest missed due date plus grace. |
| `set_paused(paused)` | admin | never | Pauses or resumes deposits, redemptions, openings and draws. |

`ScheduleParams` for `open_line`: `interval_seconds` (i64), `installments` (u16, 1 to 120), `late_bps` (u16, yearly, at most 10,000), `max_missed` (u8, at least 3 and at most `installments`). See [Credit lines](/credit-lines).

## Accounts and PDAs

| Account | Address | Holds |
|---|---|---|
| `Pool` | PDA `["pool", admin, asset_mint]` | admin, asset, vault, share token, dead-shares account, principal lent out, running totals (interest collected, written off), line count, pause flag, grace period |
| Share token | PDA `["shares", pool]` | SPL token with the asset's decimals; only the pool can issue shares |
| Vault | PDA token account `["vault", pool]`, owned by the pool | the pool's liquid assets |
| Dead shares | PDA token account `["dead", pool]`, owned by the pool | the 1,000 base units of shares locked by the first deposit; nothing can move them |
| `CreditLine` | PDA `["line", pool, line_id as u64 little-endian]` | borrower, sponsor, agreement hash, principal, rate, interest, term end, amounts repaid, status, opening, draw and close times, installment schedule (version 2) |

The admin is part of the pool's address, so it cannot be changed. Both `Pool` and `CreditLine` keep 32 reserved bytes for new parameters, so the layouts do not change:

| Account | Bytes | Field |
|---|---|---|
| `Pool` | 0..4 | `grace_period_seconds`, u32 LE (zero: no grace) |
| `CreditLine` v2 | 0..8 | `interval_seconds`, i64 LE |
| | 8..10 | `installments`, u16 LE |
| | 10..12 | `late_bps`, u16 LE, yearly |
| | 12 | `max_missed`, u8 |
| | 13 | `flags`, u8, zero (reserved) |
| | 14..22 | `late_collected`, u64 LE |
| | 22..30 | `late_paid_until`, i64 LE: late interest is settled up to this time |

A version-1 line has all 32 bytes at zero. `clients/js/src/schedule.ts` reads them and computes arrears exactly as the program does.

Line statuses, in on-chain order: `Approved`, `Active`, `Repaid`, `WrittenOff`, `InCollection`.

## Errors

Anchor numbers the program's errors from 6000, in order. Messages are quoted as the program returns them.

| Code | Name | Message |
|---|---|---|
| 6000 | `Paused` | The pool is paused |
| 6001 | `Unauthorized` | Only the pool admin may do this |
| 6002 | `WrongAmount` | Amount is zero or exceeds what is due |
| 6003 | `InsufficientLiquidity` | Not enough liquidity in the vault |
| 6004 | `LineStatus` | The line is not in the required status |
| 6005 | `TermNotEnded` | The term has not ended |
| 6006 | `Overflow` | Arithmetic overflow |
| 6007 | `SponsorRequired` | The sponsor named on this line must sign |
| 6008 | `ZeroShares` | The deposit would mint zero shares |
| 6009 | `FirstDepositTooSmall` | First deposit below the minimum |
| 6010 | `WrongAccount` | Wrong mint or token account |
| 6011 | `SlippageExceeded` | The result is below the minimum the caller accepts |
| 6012 | `TermEnded` | The term has ended |
| 6013 | `InvalidSchedule` | The installment schedule is not valid |
| 6014 | `ScheduleEndsAfterTerm` | The last installment would fall due after the term |
| 6015 | `NotScheduled` | The line has no installment schedule |
| 6016 | `NotEnoughMissed` | Fewer installments missed than the line allows before collection |
| 6017 | `LateInterestUnpaid` | The repayment must cover the late interest due |
| 6018 | `WriteOffTooEarly` | A line in collection is written off only after its oldest missed due date plus grace, or after the term plus grace |

`WrongAccount` (6010) is also returned when `open_line` is given a `line_id` other than the next in sequence. `WrongAmount` (6002) covers a zero principal, a rate above 10,000, a term end in the past and an empty agreement hash.

## Events

Every instruction emits its events through Anchor's `emit_cpi` macro (a self-CPI), so they survive log truncation. Events are append-only: existing events never change fields; new information comes as new events.

| Event | Emitted by | Fields |
|---|---|---|
| `PoolInitialized` | `init_pool` | pool, asset_mint, share_mint, admin |
| `PoolConfigured` | `init_pool`, after `PoolInitialized` | pool, grace_period_seconds |
| `Deposited` | `deposit` | pool, depositor, assets, shares, nav_after, supply_after |
| `Redeemed` | `redeem` | pool, holder, shares, assets, nav_after, supply_after |
| `LineOpened` | `open_line` | pool, line_id, borrower, sponsor, agreement_hash, principal, rate_bps, interest_due, term_end |
| `LineScheduled` | `open_line` with a schedule, after `LineOpened` | pool, line_id, interval_seconds, installments, late_bps, max_missed |
| `LineDrawn` | `draw` | pool, line_id, amount, outstanding_after |
| `LateInterestCollected` | `repay` with late interest, before `LineRepaid` | pool, line_id, amount |
| `LineRepaid` | `repay` | pool, line_id, payer, principal_part, interest_part, remaining (without late interest), nav_after |
| `LineInCollection` | `mark_in_collection` | pool, line_id, missed, remaining |
| `LineWrittenOff` | `write_off` | pool, line_id, loss, nav_after |
| `PoolPaused` | `set_paused` | pool, paused |
