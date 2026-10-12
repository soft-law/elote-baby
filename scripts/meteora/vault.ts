// Checks that an address is the R1 fee vault: a Dynamic Fee Sharing PDA vault for the quote token
// with exactly two users, the treasury and the admin, at the expected shares. Used before the vault
// is written into a DBC config (where a wrong address could never be changed) and on fee-vault reruns.
import type { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { DYNAMIC_FEE_SHARING_PROGRAM_ID, DynamicFeeSharingClient } from "@meteora-ag/dynamic-fee-sharing-sdk";

export type VaultExpect = { token: PublicKey; admin: PublicKey; treasury?: PublicKey; treasuryBps?: number };

/** Pure part of the check, on the decoded fields; returns the problems found (empty = fine). */
export function vaultProblems(
  vault: string,
  owner: string,
  state: { tokenMint: PublicKey; feeVaultType: number; users: { address: PublicKey; share: number }[] },
  e: VaultExpect,
): string[] {
  const out: string[] = [];
  if (owner !== DYNAMIC_FEE_SHARING_PROGRAM_ID.toBase58()) out.push(`${vault} is owned by ${owner}, not the Dynamic Fee Sharing program`);
  if (!state.tokenMint.equals(e.token)) out.push(`vault ${vault} holds ${state.tokenMint.toBase58()}, the quote token is ${e.token.toBase58()}`);
  if (state.feeVaultType !== 1) out.push(`vault ${vault} is not a PDA vault (type ${state.feeVaultType}); the DBC and DAMM v2 claims need one`);
  const users = state.users.filter((u) => u.share > 0);
  const treasuryBps = e.treasuryBps ?? 8000;
  const admin = users.find((u) => u.address.equals(e.admin));
  if (!admin || admin.share !== 10_000 - treasuryBps) {
    out.push(`vault ${vault} does not give the admin ${e.admin.toBase58()} ${10_000 - treasuryBps} of 10000`);
  }
  const others = users.filter((u) => !u.address.equals(e.admin));
  if (others.length !== 1 || others[0].share !== treasuryBps) {
    out.push(`vault ${vault} must have one other user (the treasury) at ${treasuryBps} of 10000; it has ${others.map((u) => `${u.address.toBase58()}=${u.share}`).join(", ") || "none"}`);
  } else if (e.treasury && !others[0].address.equals(e.treasury)) {
    out.push(`vault ${vault} pays ${others[0].address.toBase58()}, not the treasury ${e.treasury.toBase58()}`);
  }
  return out;
}

export async function verifyFeeVault(conn: Connection, vault: PublicKey, e: VaultExpect): Promise<void> {
  const info = await conn.getAccountInfo(vault, "confirmed");
  if (!info) throw new Error(`no account at ${vault.toBase58()}: create the fee vault first (fee-vault.ts)`);
  if (!info.owner.equals(DYNAMIC_FEE_SHARING_PROGRAM_ID)) {
    throw new Error(`${vault.toBase58()} is owned by ${info.owner.toBase58()}, not the Dynamic Fee Sharing program: it is not a fee vault`);
  }
  const state = await new DynamicFeeSharingClient(conn, "confirmed").getFeeVault(vault);
  const problems = vaultProblems(vault.toBase58(), info.owner.toBase58(), state, e);
  if (problems.length) throw new Error(problems.join("; "));
}

/**
 * Guards the inverted-check workaround in fund-vault.ts: the Dynamic Fee Sharing instruction must
 * carry DBC withdraw_migration_fee with flag 0 (partner) as the last payload byte, and the sender
 * account of the DBC instruction (remaining account 6, after the 6 fixed accounts fee_vault,
 * token_vault, signer, source_program, event_authority, program) must be the vault.
 */
export function partnerMigrationFeeProblems(ixs: TransactionInstruction[], vault: PublicKey, withdrawMigrationFeeDisc: ArrayLike<number>): string[] {
  const dfsIx = ixs.find((ix) => ix.programId.equals(DYNAMIC_FEE_SHARING_PROGRAM_ID));
  if (!dfsIx) return ["no Dynamic Fee Sharing instruction in the transaction"];
  const out: string[] = [];
  const data = Buffer.from(dfsIx.data);
  // 8-byte instruction discriminator, u32 payload length, then the payload (8-byte DBC discriminator + flag).
  const len = data.length >= 12 ? data.readUInt32LE(8) : -1;
  const payload = data.subarray(12);
  if (len !== payload.length || payload.length !== 9) out.push(`unexpected payload length ${payload.length}`);
  else {
    if (!payload.subarray(0, 8).equals(Buffer.from(Array.from(withdrawMigrationFeeDisc)))) out.push("the payload is not DBC withdraw_migration_fee");
    if (payload[8] !== 0) out.push(`the payload's flag is ${payload[8]}, not 0 (partner)`);
  }
  const sender = dfsIx.keys[12]?.pubkey;
  if (!sender || !sender.equals(vault)) out.push(`the sender account is ${sender?.toBase58() ?? "missing"}, not the vault ${vault.toBase58()}`);
  return out;
}
