import type { Address } from "@solana/kit";
import type { ExplorerCluster } from "../../pool/format";

export type PresetAddresses = {
  dbcConfig: Address;
  dbcPool: Address;
  baseMint: Address;      // tELOTE
  feeVault: Address;      // Dynamic Fee Sharing PDA vault
  treasury: Address;      // 80% user of the vault
  dammPool: Address | null; // null until migration
};

export const PRESET_PROGRAMS = {
  dbc: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  dammV2: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
  feeSharing: "dfsdo2UqvwfN8DuUVrMRNfQe11VaiNoKcMqLHVvDPzh",
} as const;

/** Filled by the owner after the devnet launch. Null = the preset is not launched on this cluster. */
export const PRESET: Partial<Record<ExplorerCluster, PresetAddresses | null>> = {
  devnet: null,
  localnet: null,
};
