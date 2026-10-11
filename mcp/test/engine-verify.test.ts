import { describe, expect, test } from 'bun:test'
import {
  buildCreditSignMessage,
  computeDocumentHash,
  generateCreditAgreement,
  hashToHex64,
  verifyEvidencePackage,
  verifyPartySignature,
  type CreditAgreementParams,
  type EvidencePackage,
} from '../src/engine'
import { CREDIT_TERMS, wallet } from './helpers'

const lender = wallet(1)
const borrower = wallet(2)

describe('document hash', () => {
  test('is keccak256 over the UTF-8 JSON, byte-identical to the Soft.Law engine (fixed vector)', () => {
    // Vector computed with the backend engine: keccak256(toHex(JSON.stringify(document))).
    const vector = '0x0b9bac80605a3168989266eb02e02e8929a0090b98fa53f6299375c0f0f9401a'
    expect(computeDocumentHash({ document_type: 'credit_agreement', title: 'Contrato de crédito', n: 2500000 })).toBe(vector)
    expect(hashToHex64(vector)).toBe(vector.slice(2))
    expect(hashToHex64(vector)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('evidence packages verify offline with Ed25519', () => {
  function signedPackage(): EvidencePackage {
    const params = { ...CREDIT_TERMS, acreditante: lender.address, acreditado: borrower.address } as unknown as CreditAgreementParams
    const document = generateCreditAgreement(params) as Record<string, unknown>
    const hash = computeDocumentHash(document)
    const signMessage = buildCreditSignMessage({ acreditante: lender.address, acreditado: borrower.address, principal: '$25,000.00 MXN', hash })
    return {
      schemaVersion: 'softlaw-evidence/0.1',
      agreement: {
        id: 'a'.repeat(32),
        chain: 'solana',
        template: { id: 'credit-agreement', version: '0.1.0' },
        hash,
        hashAlgorithm: 'keccak256(utf8(JSON.stringify(document)))',
        signMessage,
        parties: { acreditante: lender.address, acreditado: borrower.address },
        roles: ['acreditante', 'acreditado'],
        status: 'signed',
        createdAt: '2026-10-10',
      },
      document,
      signatures: [
        { role: 'acreditante', address: lender.address, signature: lender.sign(signMessage), method: 'Solana off-chain message (Ed25519)', signedAt: '2026-10-10' },
        { role: 'acreditado', address: borrower.address, signature: borrower.sign(signMessage), method: 'Solana off-chain message (Ed25519)', signedAt: '2026-10-10' },
      ],
      anchors: [],
    }
  }

  test('a genuine package verifies: hash recomputed, every signature valid for its party', async () => {
    expect(await verifyEvidencePackage(signedPackage())).toMatchObject({
      ok: true,
      hashMatches: true,
      complete: true,
      missingRoles: [],
      signatures: [
        { role: 'acreditante', valid: true, isParty: true },
        { role: 'acreditado', valid: true, isParty: true },
      ],
    })
  })

  test('a changed document, a swapped signer or a missing role is detected without any server', async () => {
    const tampered = signedPackage()
    ;(tampered.document as { clauses: unknown[] }).clauses.pop()
    expect((await verifyEvidencePackage(tampered)).hashMatches).toBe(false)
    const forged = signedPackage()
    forged.signatures[1]!.address = lender.address
    const report = await verifyEvidencePackage(forged)
    expect(report.ok).toBe(false)
    expect(report.signatures[1]).toMatchObject({ role: 'acreditado', isParty: false })
    const partial = signedPackage()
    partial.signatures.pop()
    expect(await verifyEvidencePackage(partial)).toMatchObject({ ok: false, hashMatches: true, complete: false, missingRoles: ['acreditado'] })
  })

  test('verifyPartySignature rejects malformed input and other chains instead of throwing', async () => {
    const message = 'hello'
    expect(await verifyPartySignature('solana', lender.address, message, lender.sign(message))).toBe(true)
    expect(await verifyPartySignature('solana', lender.address, message, borrower.sign(message))).toBe(false)
    expect(await verifyPartySignature('solana', 'not-a-key', 'm', 'zz')).toBe(false)
    expect(await verifyPartySignature('solana', lender.address, 'm', '0OIl')).toBe(false)
    expect(await verifyPartySignature('other', lender.address, message, lender.sign(message))).toBe(false)
  })
})
