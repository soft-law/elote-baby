// Step 7 of the elote credit preset: the treasury claims its share of the fee vault (claimUserFee2,
// to its own tMXN account) and deposits it into the elote credit pool, with min_shares_out 10 bps
// below the shares the current NAV gives. Prints the shares received and the value per share before
// and after. Resumable: the claim is skipped when nothing is claimable; the deposit then uses
// --amount, or stops.
//
//   cd scripts/meteora && npx tsx treasury-deposit.ts --cluster devnet|local [--vault <address>]
//        [--elote-pool <address>] [--amount <tMXN>] [--tolerance-bps 10] [--keypair <treasury.json>]
//        [--as <address>] [--send]
//
// --elote-pool     default 5bndQsto8p3rXEcG2Crz2zRSk2KN2fKwBsk5S2k2ndET on devnet
// --amount         tMXN to deposit (default: the amount just claimed)
// --keypair        the treasury (default ELOTE_TREASURY_KEYPAIR, .demo-keys/treasury.json)
//
// Without --send every write is only simulated (accounts and compute units are printed).
// Only addresses, signatures and explorer links are printed.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import { DynamicFeeSharingClient } from "@meteora-ag/dynamic-fee-sharing-sdk";
import { sharesFor } from "./curve.ts";
import { DEAD_SHARES, ata, depositInstructions, eloteRpc, snapshot, tokenAmount } from "./elote.ts";
import { DEVNET, DRY_RUN_END, UsageError, actor, addressFrom, fmt, parseAmount, parseNumber, readBook, result, run, signersOf, start, submit } from "./lib.ts";

const SCRIPT = "treasury-deposit";
const USAGE =
  "npx tsx treasury-deposit.ts --cluster devnet|local [--vault <address>] [--elote-pool <address>] [--amount <tMXN>] [--tolerance-bps 10] [--keypair <treasury.json>] [--as <address>] [--send]";

run(SCRIPT, async () => {
  const ctx = await start(SCRIPT, USAGE, { values: ["vault", "elote-pool", "amount", "tolerance-bps"], flags: [] });
  const book = readBook(ctx.cluster);
  const vault = addressFrom(ctx.args, "vault", book, "vault");
  const pool = addressFrom(ctx.args, "elote-pool", {}, "vault", ctx.cluster === "devnet" ? DEVNET.elotePool : undefined).toBase58();
  const toleranceBps = BigInt(parseNumber("--tolerance-bps", ctx.args.values["tolerance-bps"] ?? "10", 0, 500));
  const treasury = actor(ctx, "ELOTE_TREASURY_KEYPAIR", "treasury");
  const rpc = eloteRpc(ctx.rpcUrl);
  const dfs = new DynamicFeeSharingClient(ctx.conn, "confirmed");

  const before = await snapshot(rpc, pool);
  const fv = await dfs.getFeeVault(vault);
  if (fv.tokenMint.toBase58() !== before.assetMint) throw new Error(`the vault holds ${fv.tokenMint.toBase58()}, the elote pool takes ${before.assetMint}`);
  if (before.paused) throw new Error("the elote pool is paused: deposits are refused");
  const assetAccount = await ata(treasury.publicKey.toBase58(), before.assetMint);
  const shareAccount = await ata(treasury.publicKey.toBase58(), before.shareMint);
  console.log(`Treasury:   ${treasury.publicKey.toBase58()}`);
  console.log(`Fee vault:  ${vault.toBase58()}`);
  console.log(`Elote pool: ${pool}\n`);

  // 1. claim
  const row = (await dfs.getFeeBreakdown(vault)).userFees.find((u) => u.address.equals(treasury.publicKey));
  if (!row) throw new UsageError(`${treasury.publicKey.toBase58()} is not a user of the vault`);
  let claimed = 0n;
  if (row.feeUnclaimed.isZero()) {
    console.log(`1. claim: nothing claimable (claimed so far ${fmt(row.feeClaimed)} tMXN), skipped`);
  } else {
    console.log(`1. claim: ${fmt(row.feeUnclaimed)} tMXN claimable (claimed so far ${fmt(row.feeClaimed)})`);
    const balance0 = await tokenAmount(rpc, assetAccount);
    const tx = await dfs.claimUserFee2({ feeVault: vault, user: treasury.publicKey, payer: treasury.publicKey, receiver: treasury.publicKey });
    await submit(ctx, "1. claim the treasury's share (claimUserFee2)", treasury.publicKey, tx.instructions, signersOf(treasury), { resend: false });
    claimed = ctx.dryRun ? BigInt(row.feeUnclaimed.toString()) : (await tokenAmount(rpc, assetAccount)) - balance0;
    if (!ctx.dryRun) console.log(`    received ${fmt(claimed)} tMXN`);
  }

  // 2. deposit
  const assets = ctx.args.values.amount ? parseAmount("--amount", ctx.args.values.amount) : claimed;
  if (assets === 0n) {
    // A rerun after a claim that landed and a deposit that did not: the claimed tMXN sits in the
    // treasury's account, so name the balance and the flag that deposits it.
    const balance = await tokenAmount(rpc, assetAccount);
    console.log("2. deposit: nothing claimed in this run and no --amount, skipped");
    console.log(`   the treasury holds ${fmt(balance)} tMXN (claimed from the vault so far: ${fmt(row.feeClaimed)})`);
    if (balance > 0n) console.log(`   to deposit it, rerun with --amount ${fmt(balance).replace(/,/g, "")}`);
    result({ claimed: claimed.toString(), deposited: "0", treasuryBalance: balance.toString(), ...(ctx.dryRun ? { dryRun: "yes" } : {}) });
    if (ctx.dryRun) console.log(`\n${DRY_RUN_END}`);
    return;
  }
  const held = await tokenAmount(rpc, assetAccount);
  if (!ctx.dryRun && held < assets) throw new Error(`the treasury holds ${fmt(held)} tMXN, less than ${fmt(assets)}`);
  const { expected, minSharesOut } = sharesFor(assets, before.nav, before.supply, DEAD_SHARES, toleranceBps);
  console.log(`2. deposit ${fmt(assets)} tMXN: about ${fmt(expected)} shares, at least ${fmt(minSharesOut)} (${toleranceBps} bps tolerance)`);
  if (ctx.dryRun && held < assets) {
    console.log("    deposit not simulated: the claim above has not happened yet, so the treasury does not hold the tMXN");
    result({ claimed: claimed.toString(), dryRun: "yes" });
    console.log(`\n${DRY_RUN_END}`);
    return;
  }
  const shares0 = await tokenAmount(rpc, shareAccount);
  const ixs = await depositInstructions(pool, before, treasury.publicKey.toBase58(), assets, minSharesOut);
  await submit(ctx, "2. deposit into the elote pool (deposit)", treasury.publicKey, ixs, signersOf(treasury), { resend: false });
  if (ctx.dryRun) {
    result({ claimed: claimed.toString(), dryRun: "yes" });
    console.log(`\n${DRY_RUN_END}`);
    return;
  }
  const after = await snapshot(rpc, pool);
  const received = (await tokenAmount(rpc, shareAccount)) - shares0;
  console.log(`\nShares received: ${fmt(received)} (treasury now holds ${fmt(shares0 + received)})`);
  console.log(`Value per share: ${fmt(before.perShare)} -> ${fmt(after.perShare)} tMXN`);
  console.log(`Pool NAV:        ${fmt(before.nav)} -> ${fmt(after.nav)} tMXN; share supply ${fmt(before.supply)} -> ${fmt(after.supply)}`);
  result({ claimed: claimed.toString(), deposited: assets.toString(), shares: received.toString(), perShareBefore: before.perShare.toString(), perShareAfter: after.perShare.toString() });
});

