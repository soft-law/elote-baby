// Step 1 of the elote credit preset: creates the Dynamic Fee Sharing vault (PDA variant) for tMXN with
// two users, the treasury (8000 of 10000) and the admin (2000). The vault receives the DBC partner
// trading fees, the 20% migration fee, the surplus and the DAMM v2 position fees; each user claims
// its own share. Idempotent: if the vault exists, it is printed and the script exits 0.
//
//   cd scripts/meteora && npx tsx fee-vault.ts --cluster devnet|local [--treasury <address>]
//        [--quote-token <address>] [--treasury-bps 8000] [--keypair <admin.json>] [--dry-run [--as <address>]]
//
// --treasury      treasury address (default: the address book, else .demo-keys/treasury.json's address)
// --quote-token   the vault's token (default tMXN 5RyA... on devnet; required on local)
// --treasury-bps  treasury share in basis points; the admin gets the rest (default 8000)
// --keypair       the admin, owner and payer of the vault (default ELOTE_ADMIN_KEYPAIR, .demo-keys/admin.json)
//
// The vault address is a PDA of (base, token); the base keypair is kept in .demo-keys/fee-vault-base.json
// so a rerun finds the same vault. Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import fs from "node:fs";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { DYNAMIC_FEE_SHARING_PROGRAM_ID, DynamicFeeSharingClient, deriveFeeVaultPdaAddress } from "@meteora-ag/dynamic-fee-sharing-sdk";
import {
  DEVNET,
  TOKEN_PROGRAM,
  UsageError,
  accountExists,
  actor,
  addressFrom,
  explorer,
  keyDir,
  loadOrCreateKeypair,
  parseAddress,
  parseNumber,
  readBook,
  readKeypair,
  result,
  run,
  signersOf,
  start,
  submit,
  writeBook,
} from "./lib.ts";

const SCRIPT = "fee-vault";
const USAGE = "npx tsx fee-vault.ts --cluster devnet|local [--treasury <address>] [--quote-token <address>] [--treasury-bps 8000] [--keypair <admin.json>] [--dry-run [--as <address>]]";

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, { values: ["treasury", "quote-token", "treasury-bps"], flags: [] });
  const book = readBook(ctx.cluster);
  const admin = actor(ctx, "ELOTE_ADMIN_KEYPAIR", "admin");
  const token = addressFrom(ctx.args, "quote-token", {}, "vault", ctx.cluster === "devnet" ? DEVNET.tmxn : undefined);
  const treasuryBps = parseNumber("--treasury-bps", ctx.args.values["treasury-bps"] ?? "8000", 1, 9999);
  if (!Number.isInteger(treasuryBps)) throw new UsageError("--treasury-bps must be a whole number");

  let treasury: PublicKey;
  if (ctx.args.values.treasury) treasury = parseAddress("--treasury", ctx.args.values.treasury);
  else if (book.treasury) treasury = parseAddress("treasury in the address book", book.treasury);
  else {
    const file = process.env.ELOTE_TREASURY_KEYPAIR ?? path.join(keyDir(), "treasury.json");
    if (!fs.existsSync(file)) throw new UsageError("--treasury is required (no .demo-keys/treasury.json)");
    treasury = readKeypair("treasury", file).publicKey;
  }
  if (treasury.equals(admin.publicKey)) throw new UsageError("the treasury and the admin must be different addresses");

  const client = new DynamicFeeSharingClient(ctx.conn, "confirmed");
  if (book.vault && (await accountExists(ctx.conn, new PublicKey(book.vault)))) {
    console.log(`The address book's vault exists: ${book.vault}. Nothing to do.`);
    console.log(`  ${explorer(ctx, "address", book.vault)}`);
    result({ vault: book.vault });
    return;
  }
  const baseFile = path.join(keyDir(), "fee-vault-base.json");
  const { keypair: base, created } = loadOrCreateKeypair(baseFile, !ctx.dryRun);
  const vault = deriveFeeVaultPdaAddress(base.publicKey, token);

  console.log(`Program:   ${DYNAMIC_FEE_SHARING_PROGRAM_ID.toBase58()}`);
  console.log(`Token:     ${token.toBase58()}`);
  console.log(`Owner:     ${admin.publicKey.toBase58()} (admin, pays)`);
  console.log(`Users:     treasury ${treasury.toBase58()} ${treasuryBps}, admin ${admin.publicKey.toBase58()} ${10_000 - treasuryBps}`);
  console.log(`Vault PDA: ${vault.toBase58()}${created && ctx.dryRun ? " (throwaway base: a placeholder)" : ""}\n`);

  if (await accountExists(ctx.conn, vault)) {
    const state = await client.getFeeVault(vault);
    if (!state.tokenMint.equals(token)) throw new Error(`the vault at ${vault.toBase58()} holds another token`);
    console.log("The vault exists already: nothing to do.");
    console.log(`  ${explorer(ctx, "address", vault.toBase58())}`);
    if (!ctx.dryRun) writeBook(ctx.cluster, { vault: vault.toBase58(), treasury: treasury.toBase58() });
    result({ vault: vault.toBase58() });
    return;
  }

  const tx = await client.createFeeVaultPda({
    base: base.publicKey,
    tokenMint: token,
    tokenProgram: TOKEN_PROGRAM,
    owner: admin.publicKey,
    payer: admin.publicKey,
    userShare: [
      { address: treasury, share: treasuryBps },
      { address: admin.publicKey, share: 10_000 - treasuryBps },
    ],
  });
  await submit(ctx, "create the fee vault (initializeFeeVaultPda)", admin.publicKey, tx.instructions, signersOf(admin, base));
  if (ctx.dryRun) {
    console.log("\nDry run: nothing was sent.");
    result({ vault: vault.toBase58(), dryRun: "yes" });
    return;
  }
  writeBook(ctx.cluster, { vault: vault.toBase58(), treasury: treasury.toBase58() });
  console.log(`  vault ${explorer(ctx, "address", vault.toBase58())}`);
  result({ vault: vault.toBase58() });
});
