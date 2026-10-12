# elote.baby docs

Source of the elote.baby documentation, built with [Starlight](https://starlight.astro.build)
(Astro, static output).

```sh
bun install
bun run dev      # local preview on http://localhost:4321
bun run build    # static site in dist/, with the search index
bun run preview  # serves dist/ (search works here, not in dev)
```

Pages live in `src/content/docs/`; the sidebar order is set in `astro.config.mjs`. Brand
colours and fonts are in `src/styles/brand.css`, taken from `web/src/index.css`. The footer note
is in `src/components/Footer.astro`. Favicons and the corn mark are copies of the files in
`web/public/`.

Writing rules: English only for now; short pages, tables for reference data; explain behaviour,
do not restate code. The words banned on the landing (`web/tests/i18n.test.ts`) are banned here
too, in prose; program identifiers and the program's own error messages are quoted as they are.

Deploy: a Vercel project with Root Directory `docs-site`. `vercel.json` sets the Astro preset,
`bun install`, `bun run build` and `dist`.

> Devnet demo with test assets. Not an offer of securities.
