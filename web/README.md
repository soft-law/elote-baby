# web: the landing page

One static page, English by default with a Spanish toggle (`?lang=es`). Vite, React 19,
TypeScript and Tailwind v4. No CMS, no cookies, no tracking, no analytics.

The public name of the site is the `BRAND` constant in `src/config.ts`. Title, metadata,
header, footer and copy all read it, so a rename is one line. `APP_URL`, `TERMS_URL` and
`PRIVACY_URL` live in the same file.

## Run

```sh
bun install
bun run dev        # http://localhost:5173
bun test tests     # i18n keys, claims words, metadata, source hygiene
bun run typecheck  # tsc --noEmit
bun run build      # typecheck + vite build into dist/
bun run preview    # serves dist/ on http://localhost:4322
bun run smoke      # Playwright smoke test against the preview server (see below)
bun run brand      # regenerates the lockup icon, favicons and apple-touch-icon from public/corn-mark.png
```

The smoke test (`scripts/smoke.mjs`) runs under Node, starts nothing by itself and expects
`bun run preview` to be running. It loads `playwright` from the `web/` dependencies if present,
otherwise from the path in `PLAYWRIGHT_FROM` (a directory whose `node_modules` holds Playwright).

## The pool app (`/app`)

A second Vite entry, `app.html` -> `src/app/main.tsx`, rendered in the browser only (never
prerendered). `/app` and `/app/*` answer with `app.html`: `vite.config.ts` rewrites them in the
dev and preview servers, `vercel.json` in production. Routes live in `src/app/routes.tsx`
(React Router, basename `/app`). Copy `.env.example` to `.env.local` and fill in the `VITE_*`
values; with a missing or invalid value the app shows a configuration screen instead of loading.
The landing (`src/App.tsx`, `src/main.tsx`, `scripts/prerender.tsx`) never imports `src/app`,
`src/pool`, `src/wallet` or `src/tx`; `tests/isolation.test.ts` enforces it.

### End-to-end run against a local validator

```sh
PLAYWRIGHT_FROM=/path/with/playwright bun run e2e   # or: node scripts/e2e.mjs [--port 4322]
```

`scripts/e2e.mjs` runs the pool app against a throwaway local chain, start to finish:

1. starts `solana-test-validator` with a fresh ledger in the OS temp dir and the built program
   from `target/deploy/elote_pool.so`, and waits for `getHealth`;
2. runs `scripts/demo-pool.ts --cluster local --sponsor --grace-seconds 432000` from the repo root
   and reads the test token and pool addresses it prints; then `scripts/e2e-setup.ts` gives a
   freshly generated e2e wallet test tokens (the demo admin is the token authority locally) and
   opens an approved credit line for it, signed by the admin and the wallet;
3. builds with `VITE_EXPLORER_CLUSTER=localnet`, the local pool, `VITE_TEST_WALLET=1` and the e2e
   wallet's key, and `VITE_API_URL` pointing nowhere so the test token button must degrade;
4. serves the build with `vite preview` on `E2E_PORT` or `--port` (default 4322, else the next unused
   port, printed);
5. drives Chromium with Playwright: connect the test wallet, pool figures, the test token button
   without a faucet, deposit 100 tMXN, redeem 10 shares, the activity list, draw and repay 50 on
   the wallet's line, its history, then Pool, Invest and Borrow at 375 px with screenshots. Any
   console or page error fails the run, except the refused requests to the unreachable API;
6. always stops the browser and every child process, also on Ctrl-C or SIGTERM (exit 130 or 143),
   and deletes the e2e build from `dist/`, since it holds the throwaway key. Run `bun run build`
   afterwards for a normal build.

Every step is logged with a timestamp; the exit code is non-zero on the first failed step, named
in the last line. Logs (validator, demo, build, preview) and screenshots go to a temp dir that
teardown removes after a passing run. After a failed step or an interrupt it stays, without the
ledger, and its path is printed; set `KEEP_E2E_ARTIFACTS=1` to keep it after a pass too, or
`E2E_SHOTS_DIR` to write the screenshots somewhere else. A second Ctrl-C during teardown exits at
once; the exit hook still kills every child process group.

Needs: `solana-test-validator` on `PATH` with port 8899 unused, the program built into
`target/deploy`, the repo root's `node_modules` (the demo runs with `npx tsx`), bun, and
Playwright with Chromium (a `web/` dependency or `PLAYWRIGHT_FROM`, as for the smoke test). The
e2e wallet key is generated per run and lives only in memory and in that build. The SOL for the
demo admin and the e2e wallet is set at genesis (`--account`), because the local faucet behind
`requestAirdrop` fails on some macOS hosts. Not part of `bun test`.

## Copy

Every visible string is in `src/translations.ts`, with identical keys for `en` and `es`.
`tests/i18n.test.ts` fails if a key is missing in one language or if a
value contains a banned word.

## Deploy on Vercel

1. Import the repository in Vercel.
2. Set **Root Directory** to `web`.
3. Framework preset: Vite. Install command `bun install`, build command `bun run build`,
   output directory `dist`.
4. Deploy a preview and check it on a phone.
5. The owner connects the domain named by `BRAND` in the Vercel project settings once the
   preview is approved. Nothing here buys or configures a domain.

## Claims rules (verbatim from the brief)

### What is true (say nothing beyond this)
On Solana devnet with test assets: investors deposit into a pool and receive a share token; credit lines for entrepreneurs are approved from the pool (admin and borrower sign; a public program may co-sign and pay the interest); the borrower draws; repayments from the borrower's wallet or sales return to the pool and raise the value of every share; a write-off lowers it; holders redeem when liquidity allows; each line stores the hash of the credit agreement an agent drafted from a template through MCP and every party signed with their own wallet; disputes land on a public docket and a human arbitrator signs the award. Early conversations with a municipal entrepreneur program in Baja California, no agreement signed, nobody named.

Owner decisions 2026-10-11 that supersede parts of the rules below: no "APY" anywhere; the card label is "Example"; the hero carries no small print, and the single compliance line "Devnet demo with test assets. Not an offer of securities." sits in the footer next to the legal links.

Owner decision 2026-10-11: this site shows no arbitration. Disputes appear only as a roadmap chip in "Where we are", and the page says nothing else about disputes, dockets or arbitrators.

### What is NOT true (never claim, never imply with visuals)
"dividend", "stablecoin", "pegged", "backed", "government-backed", "guaranteed", "risk-free", "zero interest", "tokenized loan", "NFT", "mint", "APY" outside the example card, counters of value locked, charts going up, coins, chains, handshakes, any city, office, official or coat of arms, any yield figure except the example card labeled "Example, devnet". Never "automatic" for anything legal; never "free". "Demo on Solana devnet with test assets. Not an offer of securities." in the hero small print and the footer.
