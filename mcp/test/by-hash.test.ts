/**
 * GET /api/agreements/by-hash/:hash: the summary a credit line page shows for the agreement hash
 * the line holds. Public, rate limited, and never the document or anything needed to read it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Hono } from 'hono'
import { createApp } from '../src/app'
import { CREDIT_TEMPLATE_VERSION, computeDocumentHash, hashToHex64 } from '../src/engine'
import { resetAgreementRateLimits } from '../src/rate-limit'
import { addAnchor, addSignature, agreementsDatabase, closeAgreementsStore, createAgreement, initAgreementsStore, type AgreementRecord } from '../src/store'
import { txSignature, wallet } from './helpers'

const lender = wallet(21)
const borrower = wallet(22)
let app: Hono
let record: AgreementRecord

beforeAll(() => {
  process.env.APP_BASE_URL = 'http://localhost:5176'
  process.env.API_BASE_URL = 'http://localhost:3010'
  initAgreementsStore(':memory:')
  app = createApp()
  const document = { title: 'Contrato de crédito', clauses: ['uno'] }
  record = createAgreement({
    tenant: 'credit-firm',
    chain: 'solana',
    templateId: 'credit-agreement',
    templateVersion: CREDIT_TEMPLATE_VERSION,
    document,
    hash: computeDocumentHash(document),
    signMessage: 'sign this exact message',
    parties: { acreditante: lender.address, acreditado: borrower.address },
    terms: { principalCents: 2500000 },
  })
  addSignature(record.id, { role: 'acreditante', address: lender.address, signature: 'sig', method: 'ed25519', encryptionPublicKey: 'k'.repeat(43) })
  addAnchor(record.id, { chain: 'solana', kind: 'registerCreditAgreement', reference: txSignature(5), recordId: '0', documentUri: 'ipfs://document-cid', signer: lender.address })
})
afterAll(() => {
  closeAgreementsStore()
  delete process.env.APP_BASE_URL
  delete process.env.API_BASE_URL
})

const text = (value: unknown) => JSON.stringify(value)

async function get(hash: string) {
  resetAgreementRateLimits()
  const res = await app.request(`/api/agreements/by-hash/${hash}`)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('agreement summary by hash', () => {
  test('200 with the summary, with or without the 0x prefix', async () => {
    const hex = hashToHex64(record.hash)
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
    const plain = await get(hex)
    expect(plain.status).toBe(200)
    expect(plain.body).toEqual({
      data: {
        chain: 'solana',
        template: { id: 'credit-agreement', version: CREDIT_TEMPLATE_VERSION },
        status: 'anchored',
        roles: ['acreditante', 'acreditado'],
        partiesCount: 2,
        signaturesCount: 1,
        createdAt: record.createdAt,
        anchors: [expect.objectContaining({ chain: 'solana', kind: 'registerCreditAgreement', recordId: '0' })],
      },
    })
    expect((await get(`0x${hex}`)).body).toEqual(plain.body)
  })

  test('the summary never carries the document, terms, sign message or keys', async () => {
    const { body } = await get(hashToHex64(record.hash))
    const data = body.data as Record<string, unknown>
    for (const key of ['document', 'terms', 'signMessage', 'encryptionKeys', 'signatures', 'parties', 'hash', 'id', 'evidenceUrl']) {
      expect(key in data).toBe(false)
    }
    // Nothing that leads to the full agreement: not its id, not the evidence route.
    expect(text(body)).not.toContain(record.id)
    expect(text(body)).not.toContain('/evidence')
    for (const anchor of data.anchors as Record<string, unknown>[]) expect('documentUri' in anchor).toBe(false)
    const json = text(body)
    expect(json).not.toContain('sign this exact message')
    expect(json).not.toContain('k'.repeat(43))
    expect(json).not.toContain('principalCents')
    expect(json).not.toContain('ipfs://document-cid')
  })

  test('404 for a well-formed hash nobody drafted', async () => {
    const res = await get('ab'.repeat(32))
    expect(res).toEqual({ status: 404, body: { error: 'agreement not found' } })
  })

  test('400 for anything that is not 64 lowercase hex characters', async () => {
    for (const bad of ['abc', 'AB'.repeat(32), 'zz'.repeat(32), `0X${'ab'.repeat(32)}`, `${'ab'.repeat(32)}00`, '0x']) {
      const res = await get(bad)
      expect({ bad, status: res.status, body: res.body }).toEqual({ bad, status: 400, body: { error: 'invalid agreement hash' } })
    }
  })

  test('the hash lookup uses the lower(hash) index', () => {
    const plan = agreementsDatabase()
      .query('EXPLAIN QUERY PLAN SELECT id FROM agreements WHERE lower(hash) IN (?, ?)')
      .all('0x' + 'ab'.repeat(32), 'ab'.repeat(32)) as { detail: string }[]
    expect(plan.map(row => row.detail).join(' ')).toContain('agreements_hash_lower')
  })

  test('the id route still answers next to it', async () => {
    resetAgreementRateLimits()
    expect((await app.request(`/api/agreements/${record.id}`)).status).toBe(200)
  })
})
