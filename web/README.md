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
bun run logo       # regenerates public/logo.webp from public/logo.png
```

The smoke test (`scripts/smoke.mjs`) runs under Node, starts nothing by itself and expects
`bun run preview` to be running. It loads `playwright` from the `web/` dependencies if present,
otherwise from the path in `PLAYWRIGHT_FROM` (a directory whose `node_modules` holds Playwright).

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
