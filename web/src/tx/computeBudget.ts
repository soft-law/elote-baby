// SetComputeUnitLimit, hand-built (discriminator 2 + u32 little endian) to avoid one more program
// package. The limit comes from the simulation, with headroom, so the transaction asks for what it
// uses instead of the 200,000 per instruction default.
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

/** Simulated units plus 20% and a fixed margin, capped at the per-transaction maximum. */
export function computeUnitsWithHeadroom(simulated: bigint | number): number {
  const units = Number(simulated);
  return Math.min(MAX_COMPUTE_UNITS, Math.ceil(units * 1.2) + 5_000);
}
