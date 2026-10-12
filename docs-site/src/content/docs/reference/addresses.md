---
title: Addresses
description: The elote_pool program, the published devnet pool, the tMXN test token and the pool's share token, with Solana Explorer links.
---

All addresses are on **Solana devnet**. tMXN is a test token with no value.

| What | Address | Explorer |
|---|---|---|
| Program `elote_pool` | `BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM` | [View](https://explorer.solana.com/address/BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM?cluster=devnet) |
| Devnet pool | `5bndQsto8p3rXEcG2Crz2zRSk2KN2fKwBsk5S2k2ndET` | [View](https://explorer.solana.com/address/5bndQsto8p3rXEcG2Crz2zRSk2KN2fKwBsk5S2k2ndET?cluster=devnet) |
| tMXN test token | `5RyA7YFdhqHz4CLSAyep2w3fJMFvjg4i3s2UmgRUrmYb` | [View](https://explorer.solana.com/address/5RyA7YFdhqHz4CLSAyep2w3fJMFvjg4i3s2UmgRUrmYb?cluster=devnet) |
| Pool share token | `573YhQpuHAgWpR36ehRWWHFGd2yzTUyZEYJdiYPATS1n` | [View](https://explorer.solana.com/address/573YhQpuHAgWpR36ehRWWHFGd2yzTUyZEYJdiYPATS1n?cluster=devnet) |

The program's IDL is published on devnet with the program.

## Deriving the other accounts

The vault, the dead-shares account and every credit line are PDAs of the program, derived from the pool address. See [Program reference](/reference/program#accounts-and-pdas). The generated client in `clients/js` has a `find…Pda` helper for each.

## Deployment shape

| Part | Where it runs |
|---|---|
| Program | Solana devnet, at the program id above. |
| Pool and tMXN | Created once by the demo script on devnet and kept as the published pool. Running the script again creates a new pool and a new test token. |
| Agreements server and faucet (`mcp/`) | A server running Bun behind HTTPS. The pool app calls it for test tokens and agreement summaries. |
| Pool app and landing (`web/`) | A static site on Vercel, configured with the pool and tMXN addresses above. The app refuses to run if the pool holds a different asset. |
