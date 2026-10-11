import { EVIDENCE_HASH_ALGORITHM, verifyEvidencePackage, type EvidencePackage, type EvidenceVerification } from './engine'
import { listAnchors, listSignatures, type AgreementRecord } from './store'

/** Public base URL of this server as seen from outside (evidence download links). */
export function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3010}`).replace(/\/$/, '')
}

export function buildEvidencePackage(record: AgreementRecord): EvidencePackage {
  return {
    schemaVersion: 'softlaw-evidence/0.1',
    agreement: {
      id: record.id,
      chain: record.chain,
      template: { id: record.templateId, version: record.templateVersion },
      hash: record.hash,
      hashAlgorithm: EVIDENCE_HASH_ALGORITHM,
      signMessage: record.signMessage,
      parties: record.parties,
      roles: record.roles,
      status: record.status,
      createdAt: record.createdAt,
    },
    document: record.document,
    signatures: listSignatures(record.id),
    anchors: listAnchors(record.id).map(anchor => ({
      chain: anchor.chain,
      kind: anchor.kind,
      reference: anchor.reference,
      recordedAt: anchor.recordedAt,
      recordId: anchor.recordId,
      documentUri: anchor.documentUri,
      signer: anchor.signer,
    })),
  }
}

/** The package plus the server's own verification run, so a reader sees both the claim and a check they can repeat. */
export async function exportEvidence(record: AgreementRecord): Promise<EvidencePackage & { verification: EvidenceVerification; downloadUrl: string; howToVerify: string[] }> {
  const pkg = buildEvidencePackage(record)
  return {
    ...pkg,
    verification: await verifyEvidencePackage(pkg),
    downloadUrl: `${apiBaseUrl()}/api/agreements/${record.id}/evidence`,
    howToVerify: [
      `Recompute ${EVIDENCE_HASH_ALGORITHM} over "document" and compare with agreement.hash.`,
      'For each signature, verify "signature" (base58) over the UTF-8 bytes of agreement.signMessage with Ed25519, using the signer address (base58 public key).',
      'Check each signer address equals agreement.parties[role].',
      'Check every role in agreement.roles has such a signature: the agreement is formed only when all of them signed.',
      'Check that the registerCreditAgreement anchor names a Solana transaction that opened the credit line with agreement.hash as agreement_hash.',
      'The verifyEvidencePackage function in src/engine/verify.ts performs the first four steps.',
    ],
  }
}
