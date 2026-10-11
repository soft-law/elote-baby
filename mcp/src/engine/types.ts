/** The only chain this build anchors on. Kept as a type so records and evidence packages carry it explicitly. */
export type ChainId = 'solana'

/** A deterministic finding about a draft: what is wrong, where, and why. Never a thrown error. */
export interface Finding {
  code: string
  field: string
  message: string
}

/** Named in the consent text and recorded with each signature. */
export const SOLANA_SIGNATURE_METHOD = 'Solana off-chain message (Ed25519)'
