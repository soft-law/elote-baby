/**
 * Public routes for the sign page. The agreement id (128 random bits) is the
 * capability to read a record; a signature is accepted only from the wallet
 * named as that party, over the exact message stored with the agreement.
 */
import type { Hono } from 'hono'
import { SOLANA_SIGNATURE_METHOD, getTemplate, sameAddress, verifyPartySignature } from './engine'
import {
  addAnchor,
  addSignature,
  ANCHOR_KINDS,
  getAgreement,
  getAgreementByHash,
  hasSignature,
  isAgreementId,
  listAnchors,
  listSignatures,
  missingSignatures,
  type AgreementRecord,
  type AnchorKind,
  type PartyRole,
} from './store'
import { exportEvidence } from './evidence'
import { agreementRateLimit } from './rate-limit'

const MAX_SIGNATURE_BODY_BYTES = 8 * 1024
/** An X25519 public key, 32 bytes, base64url (43 chars, optional padding). */
const ENCRYPTION_PUBLIC_KEY = /^[A-Za-z0-9_-]{43}=?$/

type JsonBody = { ok: true; value: Record<string, unknown> } | { ok: false; status: 400 | 413; error: string }

/**
 * Reads the request body with the byte cap enforced on the bytes actually
 * received (a declared Content-Length is only a fast early refusal, so a
 * chunked body cannot bypass the cap), then parses a JSON object.
 */
export async function readJsonObject(request: Request, maxBytes: number): Promise<JsonBody> {
  const tooLarge = { ok: false as const, status: 413 as const, error: 'request body too large' }
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) return tooLarge
  const chunks: Uint8Array[] = []
  let total = 0
  if (request.body) {
    const reader = request.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return tooLarge
      }
      chunks.push(value)
    }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, status: 400, error: 'body must be a JSON object' }
    return { ok: true, value: value as Record<string, unknown> }
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON body' }
  }
}

/** A credit line id (u64) as a decimal string; null when absent, undefined when present but malformed. */
function parseRecordId(value: unknown): string | null | undefined {
  if (value === undefined) return null
  if (typeof value === 'string' && /^\d{1,20}$/.test(value) && BigInt(value) <= 18446744073709551615n) return BigInt(value).toString()
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  return undefined
}

export function publicAgreement(record: AgreementRecord) {
  return {
    id: record.id,
    chain: record.chain,
    template: { id: record.templateId, version: record.templateVersion },
    status: record.status,
    hash: record.hash,
    signMessage: record.signMessage,
    parties: record.parties,
    roles: record.roles,
    anchor: anchorPolicy(record),
    document: record.document,
    terms: record.terms,
    createdAt: record.createdAt,
    signatures: listSignatures(record.id).map(({ role, address, method, signedAt, encryptionPublicKey }) => ({
      role,
      address,
      method,
      signedAt,
      ...(encryptionPublicKey ? { encryptionPublicKey } : {}),
    })),
    encryptionKeys: encryptionKeysOf(record.id),
    anchors: listAnchors(record.id),
    consent: consentOf(record.id),
  }
}

/** An agreement hash as the pool program stores it: 64 hex characters, optional `0x`, lowercase only. */
const AGREEMENT_HASH = /^(?:0x)?([0-9a-f]{64})$/

/**
 * What a credit line page shows next to the hash it holds: template, status, how many parties
 * signed and the anchors. Never the document, the terms, the sign message or the encryption keys,
 * and never the agreement id or the evidence link: every line's hash is public on chain, and the id
 * opens the full signed agreement (names of the borrower and the guarantor) to whoever holds it.
 */
export function agreementSummary(record: AgreementRecord) {
  return {
    chain: record.chain,
    template: { id: record.templateId, version: record.templateVersion },
    status: record.status,
    roles: record.roles,
    partiesCount: Object.keys(record.parties).length,
    signaturesCount: listSignatures(record.id).length,
    createdAt: record.createdAt,
    // Without documentUri: it may point at the document itself.
    anchors: listAnchors(record.id).map(({ documentUri: _documentUri, ...anchor }) => anchor),
    // The owner may re-enable an evidence link for anchored agreements, with a privacy notice and the parties' consent.
  }
}

/** Whether every party has signed. Reported, never enforced here: the chain, not this service, decides what can be recorded. */
function consentOf(id: string): { complete: boolean; missingRoles: PartyRole[] } {
  const missingRoles = missingSignatures(id)
  return { complete: missingRoles.length === 0, missingRoles }
}

/** The encryption public keys the parties published so far, by role; a sender encrypts the document for these. */
function encryptionKeysOf(id: string): Record<PartyRole, string> {
  return Object.fromEntries(
    listSignatures(id)
      .filter(entry => entry.encryptionPublicKey)
      .map(entry => [entry.role, entry.encryptionPublicKey!]),
  )
}

/** Which on-chain act records this agreement and who executes it, from its template. */
export function anchorPolicy(record: AgreementRecord): { kind: AnchorKind; executor: PartyRole } {
  const template = getTemplate(record.templateId, record.templateVersion)
  if (!template) throw new Error(`unknown template ${record.templateId}`)
  return { kind: template.anchor.kind, executor: template.anchor.executor }
}

/** A Solana transaction signature: 64 bytes in base58. */
export function isChainReference(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(value)
}

export function mountAgreementRoutes(app: Hono): void {
  app.use('/api/agreements/*', agreementRateLimit)

  app.get('/api/agreements/by-hash/:hash', c => {
    const match = AGREEMENT_HASH.exec(c.req.param('hash'))
    if (!match) return c.json({ error: 'invalid agreement hash' }, 400)
    const record = getAgreementByHash(match[1]!)
    if (!record) return c.json({ error: 'agreement not found' }, 404)
    return c.json({ data: agreementSummary(record) })
  })

  app.get('/api/agreements/:id', c => {
    const id = c.req.param('id')
    if (!isAgreementId(id)) return c.json({ error: 'invalid agreement id' }, 400)
    const record = getAgreement(id)
    if (!record) return c.json({ error: 'agreement not found' }, 404)
    return c.json({ data: publicAgreement(record) })
  })

  app.get('/api/agreements/:id/evidence', async c => {
    const id = c.req.param('id')
    if (!isAgreementId(id)) return c.json({ error: 'invalid agreement id' }, 400)
    const record = getAgreement(id)
    if (!record) return c.json({ error: 'agreement not found' }, 404)
    c.header('Content-Disposition', `attachment; filename="agreement-${id}.json"`)
    return c.json(await exportEvidence(record))
  })

  app.post('/api/agreements/:id/anchors', async c => {
    const id = c.req.param('id')
    if (!isAgreementId(id)) return c.json({ error: 'invalid agreement id' }, 400)
    const record = getAgreement(id)
    if (!record) return c.json({ error: 'agreement not found' }, 404)
    const parsed = await readJsonObject(c.req.raw, MAX_SIGNATURE_BODY_BYTES)
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
    const body = parsed.value as { chain?: unknown; kind?: unknown; reference?: unknown; recordId?: unknown; documentUri?: unknown; signer?: unknown }
    if (body.chain !== undefined && body.chain !== record.chain) return c.json({ error: `this agreement lives on ${record.chain}` }, 400)
    const kind = body.kind as AnchorKind
    const policy = anchorPolicy(record)
    if (!ANCHOR_KINDS.includes(kind) || kind !== policy.kind) return c.json({ error: `this agreement anchors through ${policy.kind}` }, 400)
    if (typeof body.reference !== 'string' || !isChainReference(body.reference)) return c.json({ error: 'reference must be a Solana transaction signature' }, 400)
    if (body.documentUri !== undefined && (typeof body.documentUri !== 'string' || !/^(ipfs:\/\/|data:application\/json)/.test(body.documentUri) || body.documentUri.length > 4096))
      return c.json({ error: 'documentUri must be an ipfs:// or data:application/json URI' }, 400)
    const recordId = parseRecordId(body.recordId)
    if (recordId === undefined) return c.json({ error: 'recordId must be the credit line id: a non-negative integer (u64), as a number or a decimal string' }, 400)
    const executor = record.parties[policy.executor] ?? ''
    if (typeof body.signer !== 'string' || !sameAddress(body.signer, executor)) return c.json({ error: `only the ${policy.executor} (${executor}) anchors this agreement` }, 403)
    // The executor's own signature authenticates this claim; other parties' consent is reported (consent), not required: the line was already opened on chain.
    if (!hasSignature(id, policy.executor)) return c.json({ error: `the ${policy.executor} must sign before recording an anchor` }, 409)
    if (listAnchors(id).some(anchor => anchor.chain === record.chain && anchor.kind === kind)) return c.json({ error: 'already anchored' }, 409)
    addAnchor(id, { chain: record.chain, kind, reference: body.reference, recordId, documentUri: typeof body.documentUri === 'string' ? body.documentUri : '', signer: executor })
    return c.json({ data: publicAgreement(getAgreement(id)!) })
  })

  app.post('/api/agreements/:id/signatures', async c => {
    const id = c.req.param('id')
    if (!isAgreementId(id)) return c.json({ error: 'invalid agreement id' }, 400)
    const record = getAgreement(id)
    if (!record) return c.json({ error: 'agreement not found' }, 404)

    const parsed = await readJsonObject(c.req.raw, MAX_SIGNATURE_BODY_BYTES)
    if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status)
    const body = parsed.value as { role?: unknown; address?: unknown; signature?: unknown; encryptionPublicKey?: unknown }
    if (body.encryptionPublicKey !== undefined && (typeof body.encryptionPublicKey !== 'string' || !ENCRYPTION_PUBLIC_KEY.test(body.encryptionPublicKey)))
      return c.json({ error: 'encryptionPublicKey must be a base64url X25519 public key' }, 400)
    const role = body.role as PartyRole
    if (typeof role !== 'string' || !record.roles.includes(role)) return c.json({ error: `role must be one of ${record.roles.join(', ')}` }, 400)
    if (typeof body.address !== 'string' || typeof body.signature !== 'string' || body.signature.length > 512) return c.json({ error: 'address and signature are required' }, 400)
    if (!sameAddress(body.address, record.parties[role] ?? null)) return c.json({ error: `the ${role} of this agreement is ${record.parties[role]}` }, 403)
    if (hasSignature(id, role)) return c.json({ error: `${role} already signed` }, 409)
    if (!(await verifyPartySignature(record.chain, body.address, record.signMessage, body.signature))) return c.json({ error: 'signature does not verify for this message and address' }, 401)

    addSignature(id, {
      role,
      address: record.parties[role]!,
      signature: body.signature,
      method: SOLANA_SIGNATURE_METHOD,
      ...(typeof body.encryptionPublicKey === 'string' ? { encryptionPublicKey: body.encryptionPublicKey } : {}),
    })
    return c.json({ data: publicAgreement(getAgreement(id)!) })
  })
}
