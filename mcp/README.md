# elote.baby agreements MCP

> Demo on Solana devnet with test assets. Not an offer of securities.

A Solana-only build of the Soft.Law agreements engine for elote.baby: an MCP server (Bun + Hono)
that lets an agent draft a Mexican credit agreement (contrato de crédito simple) from a template,
collect the wallet signatures of the lender (acreditante) and the borrower (acreditado), and record
the on-chain registration of the signed agreement.

The signed agreement is recorded on chain when the lender opens the credit line in the `elote_pool`
program with the agreement hash (`open_line(..., agreement_hash, ...)`). The transaction signature
and the line id are then recorded as the anchor of the agreement. `open_line` is signed by the pool
admin and the borrower (and the sponsor, if one is named), so the acreditante wallet named in the
agreement should be the pool admin wallet.

- The wallet signature records the document in the credit file and does **not** replace the
  signature of the original instrument (the contract and the promissory note are signed by hand or
  with an advanced electronic signature and kept by the lender).
- Money is disbursed and repaid in pesos outside the chain.
- The agent holds no keys and never signs: every signature and every on-chain act comes from the
  party's own wallet.
- The templates (`credit-agreement` 0.1.0, and 0.2.0 with an optional support program) are pilot
  versions pending legal review. Fields, clauses, findings and rendered samples:
  [docs/contracts](docs/contracts/README.md).
- The engine (template, checks, hashing, evidence format) is Soft.Law's. The template names
  Soft.Law as author and evidence packages keep the `softlaw-evidence/0.1` schema version, so
  documents hash identically and packages verify the same way as with the hosted Soft.Law engine.

## Where people sign

Sign links point to `APP_BASE_URL` (default `https://app.soft.law`). The hosted Soft.Law sign page
reads and writes agreements through its own API, not through this server. To use it with
agreements drafted here, run this server as that API, or point a sign page at this server's
`/api/agreements/*` routes. For the hackathon demo the hosted engine is used; this package is the
published Solana-only source of that engine.

Set `API_BASE_URL` in every deployment: evidence download links are built from it.

## Tools

| Tool | What it does |
|---|---|
| `list_templates` | Templates the engine can draft (today: `credit-agreement` 0.1.0 and 0.2.0), with author, jurisdiction, review scope, chain and typed fields. |
| `draft_credit_agreement` | Fills the template with typed terms. `templateVersion` is `0.2` (support program: eligibility letter, interest subsidy) by default when any support field is given, `0.1` otherwise. Returns the document, its keccak256 hash, deterministic findings (amount in words, dates, schedule, penalty cap, rates) and the exact message each party signs. Each call stores a new agreement. |
| `request_signatures` | One sign link per party (`APP_BASE_URL/sign/<id>?as=<role>`). |
| `request_anchor` | Read-only readiness check. Returns `action: registerCreditAgreement`, `signer: acreditante`, the `hash` (and `agreementHashHex`, the same 32 bytes without prefix) to pass as `agreement_hash` to `open_line`, and the anchor endpoint. Submits nothing. |
| `get_agreement` | Status, parties, signatures, missing roles, sign links, anchors and `nextAction`. |
| `export_markdown` | A readable Markdown view of the agreement. It is a view; the signed object is the JSON document and its hash. |
| `export_evidence` | The portable record (document, hash, signatures, anchors) with a verification report and the steps anyone can repeat. |

Recording the anchor after `open_line` (the acreditante must have signed first):

```
POST /api/agreements/<id>/anchors
{ "kind": "registerCreditAgreement", "reference": "<transaction signature>", "recordId": "<line id>", "signer": "<acreditante wallet>" }
```

Other public routes, used by the sign page: `GET /api/agreements/<id>`,
`POST /api/agreements/<id>/signatures` (Ed25519 over the stored message, from the wallet named for
that role), `GET /api/agreements/<id>/evidence`. `GET /health` answers `{ ok: true }`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3010` | Port to listen on. |
| `HOST` | `127.0.0.1` | Interface to listen on. |
| `AGREEMENTS_DB` | `elote-agreements.db` | SQLite file for agreements, signatures, anchors and API key digests. |
| `APP_BASE_URL` | `https://app.soft.law` | Where sign links point. |
| `API_BASE_URL` | `http://localhost:$PORT` | Public URL of this server, used in evidence download links. Set it in every deployment. |
| `CORS_ORIGINS` | origin of `APP_BASE_URL` | Comma-separated origins allowed to call `/api/*` (agreements and the faucet). |
| `FAUCET_KEYPAIR` | unset | Faucet key, base64 of the 64-byte secret key. See [Faucet (devnet)](#faucet-devnet). |
| `FAUCET_ASSET_MINT` | unset | Address of the fixed tMXN test token the faucet sends. |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Solana RPC the faucet sends through. |

See `.env.example`.

## Faucet (devnet)

`POST /api/faucet` with `{ "address": "<base58 wallet>" }` sends 1,000 tMXN (devnet test token, no
value) to that wallet: one transaction, signed by the faucet key, creates the wallet's associated
token account if it does not exist and issues 1,000 test tokens (6 decimals) into it.
The answer is `{ "signature": "<base58>", "amount": "1000000000", "mint": "<tMXN address>" }`: `amount` is in base units, as a string; `mint` is the token program's name for the test token address.

| Status | When |
|---|---|
| 200 | Sent and confirmed. |
| 400 | The body is not JSON or `address` is not a Solana wallet address. |
| 429 | This wallet already asked in the last 24 hours (`retryAfterSeconds` and `Retry-After` say when to come back), or the client address sent more than 5 requests in a minute. |
| 502 | The RPC failed or the transaction did not confirm; the wallet may try again. |
| 503 | The faucet is not configured (`FAUCET_KEYPAIR` or `FAUCET_ASSET_MINT` missing or malformed). |

Limits are devnet-grade, and the faucet is for devnet only: one request per wallet per 24 hours,
kept in memory (a restart forgets them; several server instances do not share them), plus 5
requests per minute per client address. The client address is read from `x-forwarded-for` (else
`x-real-ip`), which a caller can set freely: the per-client limit is only meaningful behind a proxy
that overwrites that header. CORS preflights do not count against it.
Errors never carry the key or a stack trace, and the key is never logged.

Setup, once, by the owner:

1. Create a dedicated faucet key (never the pool admin key) and fund it with devnet SOL: it pays
   the fee and the account rent (about 0.002 SOL for each wallet seen for the first time).
2. Move the issuing authority of the published tMXN test token to the faucet key. The current
   authority (the key that created the test token) signs:

   ```sh
   bun run scripts/faucet-authority.ts --asset <tMXN address> \
     --new-authority <faucet public key> --authority-keypair <current authority JSON keypair>
   ```

3. Set `FAUCET_KEYPAIR`, `FAUCET_ASSET_MINT` and, if needed, `SOLANA_RPC_URL` in the server's
   environment. `FAUCET_KEYPAIR` is the base64 of the 64 raw bytes, not of the JSON text; from a
   Solana JSON keypair file, without printing it to a shared terminal:

   ```sh
   bun -e 'process.stdout.write(Buffer.from(JSON.parse(await Bun.file(process.argv[1]).text())).toString("base64"))' faucet.json
   ```
4. `CORS_ORIGINS` must include the origin of the pool app (for example `https://elote.baby` and
   `http://localhost:4322` for the preview), or browsers block the request.

## Run locally

```sh
cd mcp
bun install
bun run create-key my-account laptop   # prints the API key once
bun run dev                            # http://127.0.0.1:3010/mcp
```

Point an MCP host at `http://127.0.0.1:3010/mcp` (Streamable HTTP) with the header
`Authorization: Bearer <key>`.

## API keys

`bun run create-key <tenant> [label]` creates a key for an account in `AGREEMENTS_DB` and prints it
once. Only its sha256 digest is stored, so a lost key cannot be recovered, only replaced. Every
agreement is scoped to the account of the key that drafted it; another account gets the same
not-found answer as an id that does not exist. At most five active keys per account; each account
gets 120 JSON-RPC messages per minute.

## Checks

```sh
bun test
bunx tsc --noEmit
```

## Licence

Licence to be set by the owner.
