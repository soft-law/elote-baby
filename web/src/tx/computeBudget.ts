// Compute budget instructions, hand-built to avoid one more program package:
// SetComputeUnitLimit (discriminator 2 + u32 little endian) and SetComputeUnitPrice
// (discriminator 3 + u64 little endian, micro-lamports per unit). The limit comes from the
// simulation, with headroom. The price is set by the app so the message already carries a fee
// budget: a wallet then has no reason to add one, and a wallet that changes the message anyway is
// refused by the signing guard.
import { address, type Instruction } from "@solana/kit";

export const COMPUTE_BUDGET_PROGRAM = address("ComputeBudget111111111111111111111111111111");
export const MAX_COMPUTE_UNITS = 1_400_000;

export function setComputeUnitLimitInstruction(units: number): Instruction {
  if (!Number.isInteger(units) || units < 0 || units > 0xffff_ffff) throw new RangeError("Compute unit limit must be a u32");
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data, accounts: [] };
}

/** Priority fee the app sets, in micro-lamports per compute unit (about 0.0000001 SOL per op). */
export const PRIORITY_FEE_MICROLAMPORTS = 1_000n;

export function setComputeUnitPriceInstruction(microLamports: bigint): Instruction {
  if (microLamports < 0n || microLamports > 0xffff_ffff_ffff_ffffn) throw new RangeError("Compute unit price must be a u64");
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, microLamports, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, data, accounts: [] };
}

/** Simulated units plus 20% and a fixed margin, capped at the per-transaction maximum. */
export function computeUnitsWithHeadroom(simulated: bigint | number): number {
  const units = Number(simulated);
  return Math.min(MAX_COMPUTE_UNITS, Math.ceil(units * 1.2) + 5_000);
}
