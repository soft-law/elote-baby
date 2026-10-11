// Chain setup for scripts/e2e.mjs, run with bun against a local validator after
// scripts/demo-pool.ts has created the pool. Funds the end-to-end wallet (SOL from the validator's
// faucet, test tokens from the pool admin, who is the test token's authority on a local run) and
// opens an approved credit line for it, signed by the admin and the wallet, so the borrower page
// has a line to draw and repay. Prints one JSON line with the addresses the run needs.
//
// Env: E2E_RPC, E2E_POOL, E2E_MINT, E2E_ADMIN_KEYPAIR (path to a 64-byte keypair file),
// E2E_WALLET_SECRET (the wallet's 64 bytes as a JSON array). Nothing secret is printed.
// Local validator only: it refuses any other RPC URL.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  type Address,
  type Instruction,
  type KeyPairSigner,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getMintToInstruction,
} from "@solana-program/token";
import { fetchPool, findLinePda, findShareMintPda, getOpenLineInstructionAsync } from "@elote/pool-client";

const UNIT = 1_000_000n;
/** Test tokens given to the wallet: enough for the 100 deposit and the 50 repayment. */
const WALLET_TOKENS = 1_000n * UNIT;
/** Principal of the wallet's own line. */
const LINE_PRINCIPAL = 500n * UNIT;

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const rpcUrl = need("E2E_RPC");
const host = new URL(rpcUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error("e2e-setup runs against a local validator only");
const rpc = createSolanaRpc(rpcUrl);
const pool = need("E2E_POOL") as Address;
const mint = need("E2E_MINT") as Address;
const admin = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(need("E2E_ADMIN_KEYPAIR"), "utf8"))));
const wallet = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(need("E2E_WALLET_SECRET"))));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(label: string, feePayer: KeyPairSigner, instructions: Instruction[]): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const tx = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(feePayer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
  const signature = getSignatureFromTransaction(tx);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const {
      value: [status],
    } = await rpc.getSignatureStatuses([signature]).send();
    if (status?.err) throw new Error(`${label} failed (${signature}): ${JSON.stringify(status.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
  }
  throw new Error(`${label}: not confirmed in time (${signature})`);
}

// SOL for fees and rent: 2 SOL keeps the low-SOL band (under 0.01 SOL) away. e2e.mjs funds the
// wallet at genesis; the airdrop is the fallback when it did not.
const want = 2_000_000_000n;
const { value: funded } = await rpc.getBalance(wallet.address, { commitment: "confirmed" }).send();
if (funded < want) await rpc.requestAirdrop(wallet.address, lamports(want)).send();
for (let i = 0; ; i++) {
  const { value } = await rpc.getBalance(wallet.address, { commitment: "confirmed" }).send();
  if (value >= want) break;
  if (i >= 60) throw new Error("the airdrop to the e2e wallet did not land");
  await sleep(500);
}

const [walletAsset] = await findAssociatedTokenPda({ owner: wallet.address, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
await send("test tokens for the e2e wallet", admin, [
  await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: admin, owner: wallet.address, mint }),
  getMintToInstruction({ mint, token: walletAsset, mintAuthority: admin, amount: WALLET_TOKENS }),
]);

const { lineCount } = (await fetchPool(rpc, pool, { commitment: "confirmed" })).data;
const [line] = await findLinePda({ pool, lineId: lineCount });
await send("open_line for the e2e wallet", admin, [
  await getOpenLineInstructionAsync({
    admin,
    borrower: wallet,
    pool,
    line,
    lineId: lineCount,
    principal: LINE_PRINCIPAL,
    rateBps: 1_200,
    termEnd: BigInt(Math.floor(Date.now() / 1000) + 90 * 86_400),
    agreementHash: Uint8Array.from(createHash("sha256").update("pool app end-to-end credit agreement").digest()),
    sponsorArg: null,
    schedule: null,
  }),
]);

const [shareMint] = await findShareMintPda({ pool });
console.log(
  JSON.stringify({ wallet: wallet.address, shareMint, lineId: lineCount.toString(), line, tokens: WALLET_TOKENS.toString(), principal: LINE_PRINCIPAL.toString() }),
);
