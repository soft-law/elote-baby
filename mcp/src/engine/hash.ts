import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex } from '@noble/hashes/utils'

export const EVIDENCE_HASH_ALGORITHM = 'keccak256(utf8(JSON.stringify(document)))'

/**
 * keccak256 over the UTF-8 bytes of the exact JSON, as lowercase hex with the
 * usual prefix. Byte-identical to the hash the Soft.Law sign page shows, so a
 * party sees the same value here and there.
 */
export function computeDocumentHash(document: object): string {
  return `0x${bytesToHex(keccak_256(new TextEncoder().encode(JSON.stringify(document))))}`
}

/** The 32 bytes of a document hash as 64 hex characters without prefix: the form the pool program takes as `agreement_hash`. */
export function hashToHex64(hash: string): string {
  return hash.replace(/^0x/, '')
}
