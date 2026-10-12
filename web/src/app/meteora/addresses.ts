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
  // Launched 2026-10-12 (sitting 1): fee vault, config and tELOTE pool created on devnet.
  devnet: {
    dbcConfig: "4o1BnhCfXANHucdsS8iEhqkX2hG9XH4VLXQfDArMo9Xk" as Address,
    dbcPool: "Gs1rHiCU97DoCBJDKoAKFo13AGk2pi6F6Q21ZKeY3L8N" as Address,
    baseMint: "DYtABv8u8WxK9eyQAjn76xTzdMucfbxqHu1NL5P1QLsG" as Address,
    feeVault: "AKnMbcf34KBAiHxuH1RzZMP9J75bBrGKwYE8Cod95dmK" as Address,
    treasury: "6XUwKz4ccBLaCLuFGddjvPmZ6BBzSbXau7rQbVdEMBXp" as Address,
    dammPool: null,
  },
  localnet: null,
};
