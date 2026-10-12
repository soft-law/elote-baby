---
title: For investors
description: Use the pool app on devnet to connect a wallet, get test tokens, deposit, redeem and read your history.
---

The pool app lives at `/app` on the elote.baby site. It has four pages: Start, Pool, Invest and Borrow. Everything is on Solana devnet with test tokens.

:::caution[Test assets only]
tMXN is a test token with no value. Deposits earn only as loans are repaid and lose value when a loan is written off. Not an offer of securities.
:::

## 1. Connect a wallet

1. Install a Solana wallet in your browser, such as Phantom, and set it to **devnet**.
2. Open **Invest** and choose your wallet. Your balances and shares are read for that wallet; nothing is sent until you sign.
3. If the wallet is on another network, the app asks you to switch.

## 2. Get test tokens

| You need | How |
|---|---|
| Devnet SOL, for network fees | When your SOL is low the app offers **Get test SOL**. If the network declines, it links to the Solana faucet. |
| tMXN, to deposit | **Get test tokens** sends 1,000 tMXN to your wallet. One request per wallet per day. |

Both are test assets with no value.

## 3. Deposit

1. In **Deposit**, enter an amount of tMXN, or use **Max**.
2. The preview shows the shares you receive and the minimum you accept. If the value per share moves before your transaction lands and you would receive less than that minimum, the deposit fails and nothing moves.
3. Sign in your wallet. A notice follows the transaction from signing to confirmation, with a link to Solana Explorer.

The first deposit in a new pool must be at least 1 tMXN, and 0.001 share of it stays locked in the pool for good. See [How the pool works](/how-the-pool-works#deposits-and-shares).

## 4. Redeem

1. In **Redeem**, enter a number of shares, or use **Max**.
2. The preview shows the tMXN you receive and the minimum you accept.
3. You can redeem only up to what the pool holds on hand. If most of the pool is lent out, the app shows the most you can redeem now; more becomes available as loans are repaid.

Redemptions are on hold while the pool is paused.

## 5. Your position and history

| Figure | Meaning |
|---|---|
| Your shares | Pool shares in your wallet. |
| Value of your shares | Your shares times the value per share. |
| Test token balance | Your tMXN. |
| SOL balance | For network fees. |

**Activity** lists your last 20 transactions with this pool's shares, newest first, each with a link to the explorer.

## The Pool page

**Pool** shows the pool figures (value per share, pool value, which is the NAV, liquidity, principal lent out, interest collected, losses recognized, number of credit lines) and a table of every credit line with its borrower, status, principal, amounts drawn and repaid, due date and sponsor. If the pool is paused, a notice says so.
