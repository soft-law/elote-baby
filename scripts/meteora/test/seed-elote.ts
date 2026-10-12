// Local e2e only: creates an elote pool for the local quote token (the admin is its admin) and a first
// investor deposit, so treasury-deposit.ts has a pool with a NAV to deposit into. Refuses any RPC that
// is not a local validator. Prints one RESULT line with the pool address.
//
//   npx tsx test/seed-elote.ts --quote-token <address> --admin <admin.json> --investor <investor.json>
import { address, createNoopSigner } from "@solana/kit";
import { Connection, PublicKey } from "@solana/web3.js";
import { findDeadSharesPda, findPoolPda, findShareMintPda, findVaultPda, getInitPoolInstructionAsync } from "../../../clients/js/src/index.ts";
import { DEAD_SHARES, depositInstructions, eloteRpc, snapshot, toWeb3 } from "../elote.ts";
import { type Ctx, UNIT, accountExists, parseArgs, parseAddress, readKeypair, result, submit } from "../lib.ts";

const args = parseArgs(process.argv.slice(2), { values: ["quote-token", "admin", "investor"], flags: [] });
const rpcUrl = process.env.ELOTE_RPC ?? "http://127.0.0.1:8899";
const host = new URL(rpcUrl).hostname;
if (host !== "127.0.0.1" && host !== "localhost") throw new Error("seed-elote runs against a local validator only");
const quote = parseAddress("--quote-token", args.values["quote-token"]!);
const admin = readKeypair("admin", args.values.admin!);
const investor = readKeypair("investor", args.values.investor!);
const conn = new Connection(rpcUrl, "confirmed");
const ctx: Ctx = { script: "seed-elote", cluster: "local", rpcUrl, conn, dryRun: false, args, cuPrice: 0 };

const [pool] = await findPoolPda({ admin: address(admin.publicKey.toBase58()), assetMint: address(quote.toBase58()) });
if (!(await accountExists(conn, new PublicKey(pool)))) {
  const [shareMint] = await findShareMintPda({ pool });
  const [vault] = await findVaultPda({ pool });
  const [deadShares] = await findDeadSharesPda({ pool });
  const ix = await getInitPoolInstructionAsync({
    admin: createNoopSigner(address(admin.publicKey.toBase58())),
    assetMint: address(quote.toBase58()),
    pool,
    shareMint,
    vault,
    deadShares,
    gracePeriodSeconds: 0,
  });
  await submit(ctx, "init_pool (local elote pool for the local quote token)", admin.publicKey, [toWeb3(ix)], [admin]);
  const s = await snapshot(eloteRpc(rpcUrl), pool);
  const assets = 1_000n * UNIT;
  await submit(ctx, "first investor deposit: 1,000", investor.publicKey, await depositInstructions(pool, s, investor.publicKey.toBase58(), assets, assets - DEAD_SHARES), [investor]);
}
result({ elotePool: pool });
