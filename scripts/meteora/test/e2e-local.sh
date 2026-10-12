#!/usr/bin/env bash
# End-to-end run of the whole owner sequence on a local validator, with throwaway keys:
# fee vault, DBC config, tELOTE pool, swaps to graduation, migration to DAMM v2, a DAMM v2 trade,
# funding the vault from every source, the treasury's claim and its deposit into a local elote pool.
# Steps 1 to 3 first run without --send (a dry run must print the address --send then creates); every
# step runs twice with --send to prove it resumes (the second run must skip and print the same addresses).
#
# The validator clones from devnet: DBC, DAMM v2, Dynamic Fee Sharing, Token Metadata, elote_pool
# (BGdJ...) and the DAMM v2 config for the Customizable migration fee option (A8gM...). On devnet the
# DBC pool authority (FhVo...) already holds SOL to pay the DAMM v2 pool's rent during migration;
# locally it starts empty, so this script funds it (it gets the rent back in the same transaction).
#
#   cd scripts/meteora && bash test/e2e-local.sh [work dir]
#
# Needs solana-test-validator and spl-token (Solana CLI 3.1), network access to devnet for the clones,
# and `npm ci` at the repo root (for the elote client) and in scripts/meteora. Uses RPC port 8899; stop
# any other local validator first. Demo on Solana devnet with test assets. Not an offer of securities.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d -t elote-meteora-e2e)}"
mkdir -p "$WORK/keys"
LOG="$WORK/e2e.log"
RPC=http://127.0.0.1:8899
export ELOTE_RPC=$RPC ELOTE_KEY_DIR="$WORK/keys"
export ELOTE_ADMIN_KEYPAIR="$WORK/keys/admin.json" ELOTE_TREASURY_KEYPAIR="$WORK/keys/treasury.json" ELOTE_BUYER_KEYPAIR="$WORK/keys/buyer.json"
cd "$HERE"

say() { echo "== $*" | tee -a "$LOG"; }
step() { # step <label> <cmd...>: runs a script, keeps its output in the log, echoes the RESULT line
  local label="$1"; shift
  echo "-- $label: $*" >> "$LOG"
  local out
  if ! out="$("$@" 2>&1)"; then echo "$out" >> "$LOG"; echo "FAILED: $label (see $LOG)"; exit 1; fi
  echo "$out" >> "$LOG"
  echo "$out" | grep '^RESULT' | tail -1
}
field() { echo "$1" | tr ' ' '\n' | sed -n "s/^$2=//p"; }

if solana cluster-version -u $RPC >/dev/null 2>&1; then echo "a validator already answers on $RPC: stop it first"; exit 1; fi
for k in admin treasury buyer qtoken; do solana-keygen new --no-bip39-passphrase -s -f -o "$WORK/keys/$k.json" >/dev/null; done
ADMIN=$(solana-keygen pubkey "$WORK/keys/admin.json")

say "starting the validator (clones from devnet), ledger $WORK/ledger"
solana-test-validator --reset --quiet --ledger "$WORK/ledger" --url https://api.devnet.solana.com --mint "$ADMIN" \
  --clone-upgradeable-program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN \
  --clone-upgradeable-program cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG \
  --clone-upgradeable-program dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh \
  --clone-upgradeable-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
  --clone-upgradeable-program BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM \
  --clone A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck > "$WORK/validator.log" 2>&1 &
VPID=$!
trap 'kill $VPID 2>/dev/null || true' EXIT
for _ in $(seq 1 90); do solana cluster-version -u $RPC >/dev/null 2>&1 && break; sleep 1; done
solana cluster-version -u $RPC >/dev/null

say "funding the wallets, the DBC pool authority, and a local test quote token (6 decimals)"
for k in treasury buyer; do solana transfer -u $RPC -k "$WORK/keys/admin.json" --allow-unfunded-recipient "$(solana-keygen pubkey "$WORK/keys/$k.json")" 50 >/dev/null; done
solana transfer -u $RPC -k "$WORK/keys/admin.json" --allow-unfunded-recipient FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM 10 >/dev/null
QUOTE=$(solana-keygen pubkey "$WORK/keys/qtoken.json")
BUYER=$(solana-keygen pubkey "$WORK/keys/buyer.json")
spl-token create-token -u $RPC "$WORK/keys/qtoken.json" --decimals 6 --fee-payer "$WORK/keys/admin.json" --mint-authority "$ADMIN" >/dev/null
spl-token create-account -u $RPC "$QUOTE" --owner "$BUYER" --fee-payer "$WORK/keys/admin.json" >/dev/null
spl-token mint -u $RPC "$QUOTE" 10000 --recipient-owner "$BUYER" --mint-authority "$WORK/keys/admin.json" --fee-payer "$WORK/keys/admin.json" >/dev/null
echo "quote token $QUOTE" | tee -a "$LOG"

say "local elote pool for the quote token, with a first deposit of 1,000"
R=$(step seed npx tsx test/seed-elote.ts --quote-token "$QUOTE" --admin "$WORK/keys/admin.json" --investor "$WORK/keys/buyer.json"); echo "$R"
ELOTE=$(field "$R" elotePool)

say "1. fee vault (twice)"
D1=$(step fee-vault-dry npx tsx fee-vault.ts --cluster local --quote-token "$QUOTE"); echo "$D1"
R1=$(step fee-vault npx tsx fee-vault.ts --cluster local --send --quote-token "$QUOTE"); echo "$R1"
[ "$(field "$D1" vault)" = "$(field "$R1" vault)" ] || { echo "the dry run showed another vault than --send created"; exit 1; }
R1b=$(step fee-vault-again npx tsx fee-vault.ts --cluster local --send --quote-token "$QUOTE"); echo "$R1b"
[ "$(field "$R1" vault)" = "$(field "$R1b" vault)" ] || { echo "fee-vault rerun gave another vault"; exit 1; }

say "2. DBC config (twice)"
D2=$(step dbc-config-dry npx tsx dbc-config.ts --cluster local --quote-token "$QUOTE"); echo "$D2"
R2=$(step dbc-config npx tsx dbc-config.ts --cluster local --send --quote-token "$QUOTE"); echo "$R2"
[ "$(field "$D2" config)" = "$(field "$R2" config)" ] || { echo "the dry run showed another config than --send created"; exit 1; }
R2b=$(step dbc-config-again npx tsx dbc-config.ts --cluster local --send --quote-token "$QUOTE"); echo "$R2b"
[ "$(field "$R2" threshold)" = "2014035137" ] || { echo "unexpected threshold"; exit 1; }
[ "$(field "$R2" config)" = "$(field "$R2b" config)" ] || { echo "dbc-config rerun gave another config"; exit 1; }

say "3. tELOTE pool (twice)"
D3=$(step dbc-pool-dry npx tsx dbc-pool.ts --cluster local); echo "$D3"
R3=$(step dbc-pool npx tsx dbc-pool.ts --cluster local --send); echo "$R3"
[ "$(field "$D3" pool)" = "$(field "$R3" pool)" ] || { echo "the dry run showed another pool than --send created"; exit 1; }
R3b=$(step dbc-pool-again npx tsx dbc-pool.ts --cluster local --send); echo "$R3b"
[ "$(field "$R3" pool)" = "$(field "$R3b" pool)" ] || { echo "dbc-pool rerun gave another pool"; exit 1; }

say "4. swaps: buy 500, sell 100, buy 2,100 (partial fill stops at the threshold)"
step buy-500 npx tsx dbc-swap.ts --cluster local --send --amount 500
step sell-100 npx tsx dbc-swap.ts --cluster local --send --sell 100
R4=$(step buy-2100 npx tsx dbc-swap.ts --cluster local --send --amount 2100); echo "$R4"
[ "$(field "$R4" progressBps)" = "10000" ] || { echo "the curve did not reach the threshold"; exit 1; }

say "5. migration to DAMM v2 (twice)"
step dbc-migrate-dry npx tsx dbc-migrate.ts --cluster local
R5=$(step dbc-migrate npx tsx dbc-migrate.ts --cluster local --send); echo "$R5"
R5b=$(step dbc-migrate-again npx tsx dbc-migrate.ts --cluster local --send); echo "$R5b"
grep -q "b. migrateToDammV2: done already, skipped" "$LOG" || { echo "migration rerun did not skip"; exit 1; }

say "a trade on DAMM v2, so the vault's position earns fees"
step damm-buy npx tsx dbc-swap.ts --cluster local --send --amount 300

say "6. fund the vault (twice)"
step fund-vault-dry npx tsx fund-vault.ts --cluster local
R6=$(step fund-vault npx tsx fund-vault.ts --cluster local --send); echo "$R6"
R6b=$(step fund-vault-again npx tsx fund-vault.ts --cluster local --send); echo "$R6b"
[ "$(field "$R6" funded)" = "$(field "$R6b" funded)" ] || { echo "fund-vault rerun moved more"; exit 1; }

say "7. treasury claim and deposit (twice)"
step treasury-deposit-dry npx tsx treasury-deposit.ts --cluster local --elote-pool "$ELOTE"
R7=$(step treasury-deposit npx tsx treasury-deposit.ts --cluster local --send --elote-pool "$ELOTE"); echo "$R7"
R7b=$(step treasury-deposit-again npx tsx treasury-deposit.ts --cluster local --send --elote-pool "$ELOTE"); echo "$R7b"
[ "$(field "$R7" shares)" != "" ] && [ "$(field "$R7" shares)" != "0" ] || { echo "no shares received"; exit 1; }

say "8. status"
R8=$(step status npx tsx status.ts --cluster local --elote-pool "$ELOTE"); echo "$R8"
grep -A30 -- "-- status:" "$LOG" | sed -n '1,30p'

[ "$(grep -c "^Dry run: rerun with --send$" "$LOG")" -ge 6 ] || { echo "a dry run did not end with the --send hint"; exit 1; }
say "E2E PASS (log $LOG)"
