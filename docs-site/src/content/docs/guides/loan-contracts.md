---
title: Programmable loan contracts
description: The agreements server drafts the credit agreement from a template, collects wallet signatures, gives the hash to anchor on open_line, and exports evidence. MCP tools and routes.
---

Each credit line carries the hash of a signed credit agreement. The agreement is produced by the agreements server in `mcp/`: an MCP server (Bun and Hono) that lets an AI agent draft the agreement from a template and follow it through signature and anchoring. The agent holds no keys and never signs: every signature and every on-chain act comes from the party's own wallet.

:::caution[Pilot templates]
The templates are pilot versions pending legal review. Not legal advice.
:::

## The flow

| Step | Who | What happens |
|---|---|---|
| 1. Draft | Agent | `draft_credit_agreement` fills the template with typed terms and returns the document, its keccak256 hash, deterministic findings (amount in words, dates, schedule, penalty cap, rates) and the exact message each party signs. If there are findings, fix the terms and draft again. Each draft is a new agreement. |
| 2. Sign | Lender and borrower | `request_signatures` returns one sign link per party. Each party opens it and signs the stored message with their own wallet (Ed25519). |
| 3. Hash | Agent | `request_anchor` checks that everyone signed and returns the hash to pass as `agreement_hash`. It submits nothing. |
| 4. Anchor | Pool admin, borrower, sponsor | The admin opens the credit line with that hash in `open_line`; the borrower (and a named sponsor) co-sign. The lender named in the agreement should be the pool admin wallet. |
| 5. Record | Lender | The transaction signature and the line id are recorded as the agreement's anchor. |
| 6. Evidence | Anyone | `export_evidence` returns the portable record with a verification report and the steps anyone can repeat. |

The wallet signature records the document in the credit file. It does **not** replace the signature of the original instrument: the contract and the promissory note are signed by hand or with an advanced electronic signature and kept by the lender. Money is disbursed and repaid in pesos outside the chain; on devnet the pool moves only tMXN, a test token.

## Templates

| Template | Version | Adds |
|---|---|---|
| `credit-agreement` | 0.1.0 | A simple credit agreement between a lender and a borrower. |
| `credit-agreement` | 0.2.0 | An optional support program: eligibility letter and interest subsidy. Chosen by default when any support field is given. |

Fields, clauses, findings and rendered samples are in `mcp/docs/contracts` in the repository.

## MCP tools

| Tool | What it does |
|---|---|
| `list_templates` | Templates the server can draft, with author, jurisdiction, review scope, chain and typed fields. |
| `draft_credit_agreement` | Drafts an agreement from typed terms; returns document, hash, findings and the message each party signs. |
| `request_signatures` | One sign link per party. |
| `request_anchor` | Read-only readiness check. Returns the signer (the lender), the hash and `agreementHashHex` (the same 32 bytes without prefix) for `open_line`, and the anchor route. |
| `get_agreement` | Status, parties, signatures, missing roles, sign links, anchors and the next action. |
| `export_markdown` | A readable Markdown view. The signed object is the JSON document and its hash. |
| `export_evidence` | The portable record (document, hash, signatures, anchors) with a verification report. |

Connect an MCP host to the server's `/mcp` endpoint (Streamable HTTP) with the header `Authorization: Bearer <key>`.

## HTTP routes

| Route | Use |
|---|---|
| `GET /api/agreements/<id>` | The agreement, for the sign page. |
| `POST /api/agreements/<id>/signatures` | A party's Ed25519 signature over the stored message, from the wallet named for that role. |
| `POST /api/agreements/<id>/anchors` | Records the anchor after `open_line`: kind `registerCreditAgreement`, the transaction signature, the line id and the lender's wallet. The lender must have signed first. |
| `GET /api/agreements/<id>/evidence` | The evidence package. |
| `GET /api/agreements/by-hash/<hash>` | A summary of the agreement a credit line holds: template, status, signature count, anchors, evidence link. Never the document. 64 lowercase hex, optional `0x`; 404 when unknown, 400 when malformed. The app uses it for the agreement summary. |
| `POST /api/faucet` | Devnet only. Sends 1,000 tMXN to `{ "address": "<wallet>" }`. One request per wallet per 24 hours and 5 per minute per client; answers 429 with `Retry-After` when limited, 503 when the faucet is not configured. |
| `GET /health` | `{ ok: true }` |

## API keys

`bun run create-key <account> [label]` creates a key and prints it once. Only its sha256 digest is stored, so a lost key can be replaced, not recovered. Every agreement belongs to the account whose key drafted it; another account gets the same not-found answer as an id that does not exist. At most five active keys per account, and 120 JSON-RPC messages per minute per account.
