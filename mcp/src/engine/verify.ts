/**
 * Independent verification. Anyone holding an evidence package can recompute
 * the document hash and check every signature with this module alone, with no
 * service involved. Parties sign the UTF-8 message with Ed25519 (base58
 * signature and public key).
 */
import { ed25519 } from '@noble/curves/ed25519'
import { base58 } from '@scure/base'
import { isValidAddress, sameAddress } from './address'
import { computeDocumentHash } from './hash'
import type { ChainId } from './types'

/** A signing role named by the template (acreditante, acreditado). */
export type PartyRole = string

export interface EvidenceSignature {
  role: PartyRole
  address: string
  signature: string
  method: string
  signedAt: string
}

export interface EvidenceAnchor {
  chain: ChainId
  kind: string
  reference: string
  recordedAt: string
}

/** The portable record of an agreement: exact bytes, who signed, where it is recorded. */
export interface EvidencePackage {
  schemaVersion: 'softlaw-evidence/0.1'
  agreement: {
    id: string
    chain: ChainId
    template: { id: string; version: string }
    hash: string
    hashAlgorithm: string
    signMessage: string
    parties: Record<string, string>
    /** Roles that must sign for the agreement to be formed; packages without it use the parties' roles. */
    roles?: PartyRole[]
    status: string
    createdAt: string
  }
  document: Record<string, unknown>
  signatures: EvidenceSignature[]
  anchors: EvidenceAnchor[]
}

/** Ed25519 over the UTF-8 message; false (never a throw) for anything malformed or for another chain. */
export async function verifyPartySignature(chain: string, address: string, message: string, signature: string): Promise<boolean> {
  if (chain !== 'solana' || !isValidAddress(address)) return false
  try {
    const sig = base58.decode(signature)
    const pub = base58.decode(address)
    if (sig.length !== 64 || pub.length !== 32) return false
    return ed25519.verify(sig, new TextEncoder().encode(message), pub)
  } catch {
    return false
  }
}

export interface EvidenceVerification {
  ok: boolean
  hashMatches: boolean
  signatures: { role: PartyRole; address: string; valid: boolean; isParty: boolean }[]
  /** Every required role has a valid signature from its party. */
  complete: boolean
  missingRoles: PartyRole[]
  anchors: { chain: ChainId; kind: string; reference: string; checked: false }[]
}

/** Recompute and recheck everything the package claims. Anchors are listed, not checked (needs chain access). */
export async function verifyEvidencePackage(pkg: EvidencePackage): Promise<EvidenceVerification> {
  const hashMatches = computeDocumentHash(pkg.document) === pkg.agreement.hash
  const signatures = await Promise.all(
    pkg.signatures.map(async entry => ({
      role: entry.role,
      address: entry.address,
      valid: await verifyPartySignature(pkg.agreement.chain, entry.address, pkg.agreement.signMessage, entry.signature),
      isParty: sameAddress(entry.address, pkg.agreement.parties[entry.role] ?? null),
    })),
  )
  const anchors = pkg.anchors.map(anchor => ({ chain: anchor.chain, kind: anchor.kind, reference: anchor.reference, checked: false as const }))
  const required = pkg.agreement.roles ?? Object.keys(pkg.agreement.parties)
  const missingRoles = required.filter(role => !signatures.some(entry => entry.role === role && entry.valid && entry.isParty))
  const complete = missingRoles.length === 0
  return { ok: hashMatches && complete && signatures.every(entry => entry.valid && entry.isParty), hashMatches, signatures, complete, missingRoles, anchors }
}
