// End-to-end demo of the elote_pool program: two investors deposit, a credit line is approved,
// drawn and repaid (principal by the borrower, interest by a sponsor), and the value of every
// share rises with the collected interest.
//
//   npx tsx scripts/demo-pool.ts --cluster local|devnet [--agreement-hash <64 hex>] [--sponsor]
//
// --agreement-hash  hash of the signed credit agreement recorded on the line (placeholder if absent)
// --sponsor         the sponsor co-signs the opening and is named on the line
//
// Keys live in .demo-keys/ (generated on first run, ignored by git) unless a path is given in
// ELOTE_ADMIN_KEYPAIR, ELOTE_INVESTOR_A_KEYPAIR, ELOTE_INVESTOR_B_KEYPAIR, ELOTE_BORROWER_KEYPAIR or
// ELOTE_SPONSOR_KEYPAIR. Only addresses are printed. ELOTE_RPC overrides the cluster's RPC URL.
//
// Demo on Solana devnet with test assets. Not an offer of securities.
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Address,
  type Instruction,
  type KeyPairSigner,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getCreateAccountInstruction, getTransferSolInstruction } from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS,
  fetchMint,
  fetchToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToInstruction,
} from "@solana-program/token";
import {
  LineStatus,
  fetchCreditLine,
  fetchPool,
  findDeadSharesPda,
  findLinePda,
  findPoolPda,
  findShareMintPda,
  findVaultPda,
  getDepositInstructionAsync,
  getDrawInstructionAsync,
  getInitPoolInstructionAsync,
  getOpenLineInstructionAsync,
  getRedeemInstructionAsync,
  getRepayInstructionAsync,
} from "../clients/js/src/index.ts";

const DISCLAIMER = "Demo on Solana devnet with test assets. Not an offer of securities.";
const ASSET = "tMXN (devnet test token, no value)";
const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);

// -- arguments ------------------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const cluster = arg("cluster") ?? "local";
if (cluster !== "local" && cluster !== "devnet") throw new Error("--cluster must be local or devnet");
const withSponsor = process.argv.includes("--sponsor");
const rpcUrl = process.env.ELOTE_RPC ?? (cluster === "devnet" ? "https://api.devnet.solana.com" : "http://127.0.0.1:8899");
const rpc = createSolanaRpc(rpcUrl);

function agreementHash(): Uint8Array {
  const given = arg("agreement-hash");
  if (given) {
    const hex = given.replace(/^0x/, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("--agreement-hash must be 32 bytes of hex");
    return Uint8Array.from(Buffer.from(hex, "hex"));
  }
  console.log("No --agreement-hash given: using a placeholder hash of a fixed demo text.");
  return Uint8Array.from(createHash("sha256").update("elote.fun demo credit agreement").digest());
}

// -- keys -----------------------------------------------------------------------------------------

const KEY_DIR = path.resolve(".demo-keys");

/** Loads a 64-byte Solana keypair file, creating one in .demo-keys/ if needed. Never printed. */
async function loadSigner(name: string, envVar: string): Promise<KeyPairSigner> {
  const fromEnv = process.env[envVar];
  let file = fromEnv ? fromEnv.replace(/^~/, os.homedir()) : path.join(KEY_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    if (fromEnv) throw new Error(`${envVar} points to a missing file`);
    fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const seed = Buffer.from(privateKey.export({ format: "jwk" }).d!, "base64url");
    const pub = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
    fs.writeFileSync(file, JSON.stringify([...seed, ...pub]), { mode: 0o600 });
  }
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
}

// -- transactions ---------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function explorer(signature: string): string {
  const c = cluster === "devnet" ? "devnet" : `custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  return `https://explorer.solana.com/tx/${signature}?cluster=${c}`;
}

async function send(label: string, feePayer: KeyPairSigner, instructions: Instruction[]): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const tx = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(feePayer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m)
    )
  );
  const signature = getSignatureFromTransaction(tx);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" })
    .send();
  for (let i = 0; i < 60; i++) {
    await sleep(1_000);
    const {
      value: [status],
    } = await rpc.getSignatureStatuses([signature]).send();
    if (status?.err) throw new Error(`${label} failed (${signature}): ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      console.log(`  ${label}\n    ${signature}\n    ${explorer(signature)}`);
      return signature;
    }
  }
  throw new Error(`${label}: not confirmed in time (${signature})`);
}

async function airdrop(to: Address, sol: number): Promise<void> {
  const want = BigInt(sol * 1e9);
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const { value: balance } = await rpc.getBalance(to, { commitment: "confirmed" }).send();
      if (balance >= want / 2n) return;
      await rpc.requestAirdrop(to, lamports(want)).send();
      for (let i = 0; i < 30; i++) {
        await sleep(1_000);
        const { value } = await rpc.getBalance(to, { commitment: "confirmed" }).send();
        if (value > balance) return;
      }
    } catch (e) {
      console.log(`  airdrop attempt ${attempt} failed: ${(e as Error).message}`);
    }
    await sleep(attempt * 3_000);
  }
  throw new Error(`could not fund ${to}; send it some SOL and run again`);
}

const fmt = (units: bigint) => {
  const whole = units / UNIT;
  const frac = (units % UNIT).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? "." + frac : ""}`;
};

// -- demo -----------------------------------------------------------------------------------------

console.log(`${DISCLAIMER}\nCluster: ${cluster} (${rpcUrl})\n`);
const hash = agreementHash();

const admin = await loadSigner("admin", "ELOTE_ADMIN_KEYPAIR");
const investorA = await loadSigner("investor-a", "ELOTE_INVESTOR_A_KEYPAIR");
const investorB = await loadSigner("investor-b", "ELOTE_INVESTOR_B_KEYPAIR");
const borrower = await loadSigner("borrower", "ELOTE_BORROWER_KEYPAIR");
const sponsor = await loadSigner("sponsor", "ELOTE_SPONSOR_KEYPAIR");
console.log(
  [
    `admin      ${admin.address}`,
    `investor A ${investorA.address}`,
    `investor B ${investorB.address}`,
    `borrower   ${borrower.address}`,
    `sponsor    ${sponsor.address}`,
  ].join("\n") + "\n"
);

console.log("Funding the admin with SOL for fees and rent");
await airdrop(admin.address, cluster === "devnet" ? 1 : 10);
await send(
  "SOL for the other wallets' fees",
  admin,
  [investorA, investorB, borrower, sponsor].map((w) =>
    getTransferSolInstruction({ source: admin, destination: w.address, amount: lamports(20_000_000n) })
  )
);

// The test asset: a fresh 6-decimal SPL mint per run, so every run gets its own pool.
console.log(`\nCreating the ${ASSET}`);
const assetMint = await generateKeyPairSigner();
const mintSpace = BigInt(getMintSize());
const mintRent = await rpc.getMinimumBalanceForRentExemption(mintSpace).send();
await send("create tMXN (devnet test token, no value)", admin, [
  getCreateAccountInstruction({
    payer: admin,
    newAccount: assetMint,
    lamports: mintRent,
    space: mintSpace,
    programAddress: TOKEN_PROGRAM_ADDRESS,
  }),
  getInitializeMint2Instruction({ mint: assetMint.address, decimals: DECIMALS, mintAuthority: admin.address }),
]);
console.log(`  tMXN (devnet test token, no value) address ${assetMint.address}`);

const [pool] = await findPoolPda({ admin: admin.address, assetMint: assetMint.address });
const [shareMint] = await findShareMintPda({ pool });
const ataOf = async (owner: Address, mint: Address) =>
  (await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0];
const [vault] = await findVaultPda({ pool });
const [deadShares] = await findDeadSharesPda({ pool });
// The first deposit locks this many shares in the pool's own share account (state::DEAD_SHARES).
const DEAD_SHARES = 1_000n;

console.log("\nCreating the pool");
await send("init_pool", admin, [
  await getInitPoolInstructionAsync({ admin, assetMint: assetMint.address, pool, shareMint, vault, deadShares }),
]);
console.log(`  pool ${pool}\n  share token ${shareMint}\n  vault ${vault}`);

console.log(`\nIssuing ${ASSET} to the investors and the sponsor`);
const issue: Instruction[] = [];
for (const [w, amount] of [
  [investorA, 10_000n * UNIT],
  [investorB, 5_000n * UNIT],
  [sponsor, 720n * UNIT],
] as const) {
  issue.push(await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: admin, owner: w.address, mint: assetMint.address }));
  issue.push(getMintToInstruction({ mint: assetMint.address, token: await ataOf(w.address, assetMint.address), mintAuthority: admin, amount }));
}
issue.push(await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: admin, owner: borrower.address, mint: assetMint.address }));
await send("issue tMXN (devnet test token, no value): A 10,000, B 5,000, sponsor 720", admin, issue);

async function snapshot() {
  const p = await fetchPool(rpc, pool);
  const v = await fetchToken(rpc, vault);
  const s = await fetchMint(rpc, shareMint);
  const nav = v.data.amount + p.data.outstandingPrincipal;
  const supply = s.data.supply;
  const perShare = supply === 0n ? 0n : (nav * UNIT) / supply;
  return { nav, supply, perShare, vault: v.data.amount, outstanding: p.data.outstandingPrincipal, interest: p.data.interestCollected };
}

/** Creates the depositor's share account if needed and deposits `assets` with an exact floor. */
async function deposit(label: string, who: KeyPairSigner, assets: bigint) {
  const { nav, supply } = await snapshot();
  const minSharesOut = supply === 0n ? assets - DEAD_SHARES : (assets * supply) / nav;
  await send(label, who, [
    await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: who, owner: who.address, mint: shareMint }),
    await getDepositInstructionAsync({
      depositor: who,
      pool,
      shareMint,
      vault,
      depositorAssetAccount: await ataOf(who.address, assetMint.address),
      depositorShareAccount: await ataOf(who.address, shareMint),
      deadShares,
      assets,
      minSharesOut,
    }),
  ]);
}

console.log("\nDeposits");
await deposit("investor A deposits 10,000 tMXN (devnet test token, no value)", investorA, 10_000n * UNIT);
await deposit("investor B deposits 5,000 tMXN (devnet test token, no value)", investorB, 5_000n * UNIT);
const before = await snapshot();

console.log(`\nCredit line: 6,000 tMXN (devnet test token, no value) at 12%${withSponsor ? ", co-signed by the sponsor" : ""}`);
const { lineCount } = (await fetchPool(rpc, pool)).data;
const [line] = await findLinePda({ pool, lineId: lineCount });
const termEnd = BigInt(Math.floor(Date.now() / 1000) + 90 * 86_400);
await send("open_line", admin, [
  await getOpenLineInstructionAsync({
    admin,
    borrower,
    ...(withSponsor ? { sponsor } : {}),
    pool,
    line,
    lineId: lineCount,
    principal: 6_000n * UNIT,
    rateBps: 1_200,
    termEnd,
    agreementHash: hash,
    sponsorArg: withSponsor ? sponsor.address : null,
  }),
]);
const borrowerAsset = await ataOf(borrower.address, assetMint.address);
await send("draw: 6,000 tMXN (devnet test token, no value) to the borrower", borrower, [
  await getDrawInstructionAsync({ borrower, pool, line, vault, borrowerAssetAccount: borrowerAsset }),
]);
const drawn = await snapshot();
await send("repay by the borrower: 6,000 tMXN (devnet test token, no value) of principal", borrower, [
  await getRepayInstructionAsync({ payer: borrower, pool, line, vault, payerAssetAccount: borrowerAsset, amount: 6_000n * UNIT }),
]);
await send("repay by the sponsor: 720 tMXN (devnet test token, no value) of interest", sponsor, [
  await getRepayInstructionAsync({
    payer: sponsor,
    pool,
    line,
    vault,
    payerAssetAccount: await ataOf(sponsor.address, assetMint.address),
    amount: 720n * UNIT,
  }),
]);
const repaid = await snapshot();
const status = (await fetchCreditLine(rpc, line)).data.status;

console.log("\nRedemption");
const redeemShares = 4_000n * UNIT;
await send("investor A redeems 4,000 shares", investorA, [
  await getRedeemInstructionAsync({
    holder: investorA,
    pool,
    shareMint,
    vault,
    holderShareAccount: await ataOf(investorA.address, shareMint),
    holderAssetAccount: await ataOf(investorA.address, assetMint.address),
    shares: redeemShares,
    minAssetsOut: (redeemShares * repaid.nav) / repaid.supply,
  }),
]);
const after = await snapshot();
const received = (redeemShares * repaid.nav) / repaid.supply;

const row = (label: string, s: Awaited<ReturnType<typeof snapshot>>) =>
  `${label.padEnd(26)}${fmt(s.nav).padStart(12)}${fmt(s.supply).padStart(12)}${fmt(s.perShare).padStart(14)}${fmt(s.interest).padStart(12)}`;
console.log(`\nAmounts in ${ASSET}; line status after repayment: ${LineStatus[status]}`);
console.log(`${"".padEnd(26)}${"NAV".padStart(12)}${"supply".padStart(12)}${"per share".padStart(14)}${"interest".padStart(12)}`);
console.log(row("after deposits", before));
console.log(row("line drawn", drawn));
console.log(row("line repaid", repaid));
console.log(row("after A redeems 4,000", after));
console.log(`\nInvestor A received ${fmt(received)} tMXN (devnet test token, no value) for 4,000 shares (value per share ${fmt(before.perShare)} -> ${fmt(repaid.perShare)}).`);
console.log(`\n${DISCLAIMER}`);
