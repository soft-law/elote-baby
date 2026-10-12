// Reads and instructions for the elote_pool program through the repo's Codama client on @solana/kit
// (clients/js, the same path as scripts/demo-pool.ts). @solana/kit and @solana-program/token come
// from the repo root's node_modules (`npm ci` at the root). Instructions are converted to
// @solana/web3.js form so one transaction path (lib.ts submit) signs, sends or simulates them.
import {
  AccountRole,
  type Address,
  type Instruction,
  address,
  createNoopSigner,
  createSolanaRpc,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS, fetchMint, fetchToken, findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync } from "@solana-program/token";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { fetchPool, getDepositInstructionAsync } from "../../clients/js/src/index.ts";
import { UNIT } from "./lib.ts";

/** state::DEAD_SHARES: shares locked by the first deposit. */
export const DEAD_SHARES = 1_000n;

export function toWeb3(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isSigner: a.role === AccountRole.READONLY_SIGNER || a.role === AccountRole.WRITABLE_SIGNER,
      isWritable: a.role === AccountRole.WRITABLE || a.role === AccountRole.WRITABLE_SIGNER,
    })),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

export type EloteSnapshot = {
  assetMint: Address;
  shareMint: Address;
  vault: Address;
  deadShares: Address;
  paused: boolean;
  nav: bigint;
  supply: bigint;
  /** Value of one share in asset base units, scaled by UNIT (1.000000 = 1_000_000). */
  perShare: bigint;
};

export function eloteRpc(rpcUrl: string) {
  return createSolanaRpc(rpcUrl);
}

/** NAV = vault balance + outstanding principal, as in scripts/demo-pool.ts. */
export async function snapshot(rpc: ReturnType<typeof eloteRpc>, pool: string): Promise<EloteSnapshot> {
  const p = (await fetchPool(rpc, address(pool), { commitment: "confirmed" })).data;
  const v = await fetchToken(rpc, p.vault, { commitment: "confirmed" });
  const s = await fetchMint(rpc, p.shareMint, { commitment: "confirmed" });
  const nav = v.data.amount + p.outstandingPrincipal;
  const supply = s.data.supply;
  return {
    assetMint: p.assetMint,
    shareMint: p.shareMint,
    vault: p.vault,
    deadShares: p.deadShares,
    paused: p.paused,
    nav,
    supply,
    perShare: supply === 0n ? 0n : (nav * UNIT) / supply,
  };
}

export async function ata(owner: string, mint: Address): Promise<Address> {
  return (await findAssociatedTokenPda({ owner: address(owner), mint, tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0];
}

export async function tokenAmount(rpc: ReturnType<typeof eloteRpc>, account: Address): Promise<bigint> {
  try {
    return (await fetchToken(rpc, account, { commitment: "confirmed" })).data.amount;
  } catch {
    return 0n;
  }
}

/** The share account (created if needed) and the deposit, as web3 instructions; the depositor signs later. */
export async function depositInstructions(pool: string, s: EloteSnapshot, depositor: string, assets: bigint, minSharesOut: bigint) {
  const signer = createNoopSigner(address(depositor));
  const createShares = await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: signer, owner: address(depositor), mint: s.shareMint });
  const deposit = await getDepositInstructionAsync({
    depositor: signer,
    pool: address(pool),
    shareMint: s.shareMint,
    vault: s.vault,
    deadShares: s.deadShares,
    depositorAssetAccount: await ata(depositor, s.assetMint),
    depositorShareAccount: await ata(depositor, s.shareMint),
    assets,
    minSharesOut,
  });
  return [toWeb3(createShares), toWeb3(deposit)];
}
