/**
 * The MCP surface over HTTP, the way an MCP host speaks it (raw JSON-RPC to a
 * stateless Streamable HTTP endpoint gated by a per-tenant API key), plus the
 * public routes the sign page uses to post signatures and the anchor.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import type { Hono } from 'hono'
import { createApp } from '../src/app'
import { agreementsDatabase, closeAgreementsStore, getAgreement, initAgreementsStore } from '../src/store'
import { insertApiKey, revokeApiKey } from '../src/api-keys'
import { ANCHOR_NOTE, SERVER_INSTRUCTIONS } from '../src/mcp/server'
import { resetAgreementRateLimits } from '../src/rate-limit'
import { CREDIT_TERMS, txSignature, wallet } from './helpers'

const TOOLS = ['draft_credit_agreement', 'export_evidence', 'export_markdown', 'get_agreement', 'list_templates', 'request_anchor', 'request_signatures']
const READ_ONLY = ['list_templates', 'get_agreement', 'request_anchor', 'export_markdown', 'export_evidence']

const lender = wallet(11)
const borrower = wallet(12)
const DRAFT = { ...CREDIT_TERMS, acreditante: lender.address, acreditado: borrower.address }

let KEY = ''
let KEY_B = ''
let app: Hono

beforeAll(() => {
  process.env.APP_BASE_URL = 'http://localhost:5176'
  process.env.API_BASE_URL = 'http://localhost:3010'
  initAgreementsStore(':memory:')
  KEY = insertApiKey({ tenant: 'credit-firm', label: 'suite' }).plaintext
  KEY_B = insertApiKey({ tenant: 'other-firm', label: 'suite' }).plaintext
  app = createApp()
})
afterAll(() => {
  closeAgreementsStore()
  delete process.env.APP_BASE_URL
  delete process.env.API_BASE_URL
})

let nextId = 1
const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
async function rpc(method: string, params: Record<string, unknown> = {}, key: string | null = KEY, target: Hono = app) {
  const headers: Record<string, string> = { ...HEADERS }
  if (key) headers.authorization = `Bearer ${key}`
  const res = await target.request('/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }) })
  return { status: res.status, headers: res.headers, body: res.status === 200 ? await res.json() : await res.json().catch(() => null) }
}
const call = (name: string, args: Record<string, unknown>, key: string = KEY) => rpc('tools/call', { name, arguments: args }, key)
const out = async (name: string, args: Record<string, unknown>, key: string = KEY) => (await call(name, args, key)).body.result.structuredContent

async function post(path: string, body: unknown) {
  resetAgreementRateLimits()
  const res = await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}

describe('MCP endpoint', () => {
  test('rejects a missing, unknown or revoked key before touching the engine, with the bearer challenge', async () => {
    for (const key of [null, 'nobody:wrong', 'elote_notARealKey']) {
      const res = await rpc('initialize', {}, key)
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer realm="elote", error="invalid_token"')
      expect(res.body).toEqual({ error: 'unauthorized', message: 'Missing or invalid API key. Ask the server operator for one (bun run create-key).' })
    }
    const created = insertApiKey({ tenant: 'acct:firm-a', label: 'laptop' })
    const drafted = await call('draft_credit_agreement', DRAFT, created.plaintext)
    expect(drafted.status).toBe(200)
    expect(getAgreement(drafted.body.result.structuredContent.agreementId)?.tenant).toBe('acct:firm-a')
    revokeApiKey(created.id, 'acct:firm-a')
    const revoked = await rpc('initialize', {}, created.plaintext)
    expect(revoked.status).toBe(401)
    expect(revoked.body.message).toMatch(/revoked/)
    expect(JSON.stringify(revoked.body)).not.toMatch(/firm-a|laptop|elote_/)
  })

  test('initialize returns the Solana-only, credit-first instructions and the claims', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
    expect(init.status).toBe(200)
    expect(init.body.result.serverInfo.name).toBe('elote-agreements')
    const instructions = init.body.result.instructions as string
    expect(instructions).toBe(SERVER_INSTRUCTIONS)
    for (const phrase of [
      'draft_credit_agreement',
      'request_signatures',
      'request_anchor',
      'get_agreement',
      'export_evidence',
      'never signs and holds no keys',
      'does not replace the signature of the original instrument',
      'Demo on Solana devnet with test assets. Not an offer of securities.',
      'pilot',
      '`open_line(agreement_hash)` in the elote_pool program',
      'registerCreditAgreement anchor',
    ]) {
      expect(instructions).toContain(phrase)
    }
  })

  test('lists exactly the seven tools, each annotated, none destructive', async () => {
    const tools = (await rpc('tools/list')).body.result.tools as { name: string; title: string; description: string; annotations: Record<string, unknown> }[]
    expect(tools).toHaveLength(7)
    expect(tools.map(tool => tool.name).sort()).toEqual(TOOLS)
    for (const tool of tools) {
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']) expect(typeof tool.annotations[hint]).toBe('boolean')
      expect(tool.annotations.destructiveHint).toBe(false)
      expect(`${tool.title} ${tool.description}`.toLowerCase()).not.toMatch(/\bip\b|licen|\bmint|nft|token|dividend|stablecoin|backed|guaranteed/)
    }
    for (const name of READ_ONLY) expect(tools.find(tool => tool.name === name)!.annotations.readOnlyHint).toBe(true)
    expect(tools.find(tool => tool.name === 'request_anchor')!.description.startsWith('Does NOT submit anything on chain')).toBe(true)
  })
})

describe('credit agreement flow', () => {
  test('findings come first; a clean draft is an encrypted-by-default Solana agreement with the credit sign message', async () => {
    const bad = await out('draft_credit_agreement', { ...DRAFT, principalInWords: 'veinte mil pesos 00/100 M.N.' })
    expect(bad.findings.map((f: { code: string }) => f.code)).toEqual(['AMOUNT_WORDS_MISMATCH'])
    const good = await out('draft_credit_agreement', DRAFT)
    expect(good).toMatchObject({ template: { id: 'credit-agreement', version: '0.1.0' }, chain: 'solana', findings: [], encrypted: true })
    expect(good.hash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(good.agreementId).toMatch(/^[0-9a-f]{32}$/)
    expect(good.signMessage).toContain(good.hash)
    expect(good.signMessage).toMatch(/Firmo el registro de este documento/)
    expect(good.nextStep).toContain('request_signatures')
    const templates = await out('list_templates', { family: 'credit' })
    expect(templates.templates.map((t: { id: string; version: string }) => `${t.id}@${t.version}`)).toEqual(['credit-agreement@0.1.0', 'credit-agreement@0.2.0'])
  })

  test('templateVersion: 0.1 without support fields, 0.2 when any is given, and 0.1 refuses support fields', async () => {
    const SUPPORT = {
      acreditanteKind: 'private',
      interestRateAnnualPct: '18',
      moratoryRateAnnualPct: '36',
      supportProgram: { name: 'Programa Ejemplo', authority: 'Ayuntamiento de Ciudad Ejemplo' },
      eligibilityLetter: { folio: 'ELIG-1', issuedBy: 'Dirección Ejemplo', issuedAt: '2026-10-20', sha256: 'c'.repeat(64) },
      interestSubsidy: { payer: 'Ayuntamiento de Ciudad Ejemplo', subsidizedPoints: '10', borrowerRatePct: '8', condition: 'punctualPayment', paymentTiming: 'quarterly', paidTo: 'acreditante' },
      subsidyLapseRule: 'borrowerMayPrepay',
      noticeDays: 30,
      supportDisclaimerAccepted: true,
    }
    const plain = await out('draft_credit_agreement', DRAFT)
    expect(plain.template).toEqual({ id: 'credit-agreement', version: '0.1.0' })
    const supported = await out('draft_credit_agreement', { ...DRAFT, ...SUPPORT })
    expect(supported.template).toEqual({ id: 'credit-agreement', version: '0.2.0' })
    expect(supported.findings).toEqual([])
    expect(supported.document.clauses.map((c: { title: string }) => c.title)).toContain('De la no alteración de la obligación del acreditado')
    const explicit = await out('draft_credit_agreement', { ...DRAFT, templateVersion: '0.2' })
    expect(explicit.template.version).toBe('0.2.0')
    expect(explicit.document.clauses.map((c: { title: string }) => c.title)).not.toContain('Del apoyo a la tasa de interés')
    const refused = (await call('draft_credit_agreement', { ...DRAFT, ...SUPPORT, templateVersion: '0.1' })).body.result
    expect(refused.isError).toBe(true)
    expect(refused.structuredContent.stored).toBe(false)
    const flagged = await out('draft_credit_agreement', {
      ...DRAFT,
      ...SUPPORT,
      supportProgram: undefined,
      interestSubsidy: { ...SUPPORT.interestSubsidy, borrowerRatePct: '20', subsidizedPoints: '0' },
    })
    expect(flagged.findings.map((f: { code: string }) => f.code).sort()).toEqual(['SUBSIDY_COVERS_PRINCIPAL', 'SUBSIDY_WITHOUT_PROGRAM'])
    for (const bad of [
      { interestSubsidy: { ...SUPPORT.interestSubsidy, condition: 'always' } },
      { interestSubsidy: { ...SUPPORT.interestSubsidy, paidTo: 'acreditado' } },
      { noticeDays: 0 },
      { supportProgram: { name: 'x', authority: 'y', extra: 1 } },
    ]) {
      expect((await call('draft_credit_agreement', { ...DRAFT, ...SUPPORT, ...bad })).body.result.isError).toBe(true)
    }
    const anchor = await out('request_anchor', { agreementId: supported.agreementId })
    expect(anchor).toMatchObject({ action: 'registerCreditAgreement', signer: 'acreditante', hash: supported.hash })
    expect((await out('get_agreement', { agreementId: supported.agreementId })).template).toEqual({ id: 'credit-agreement', version: '0.2.0' })
  })

  test('the schema refuses other chains, blank names, non-http rule links, long rates and long wallets', async () => {
    const plain = await out('draft_credit_agreement', { ...DRAFT, encrypted: false })
    expect(plain.encrypted).toBe(false)
    expect(plain.findings.map((f: { code: string }) => f.code)).toEqual(['PLAINTEXT_PERSONAL_DATA'])
    for (const bad of [
      { chain: 'ethereum' },
      { acreditadoName: '   ' },
      { programRulesUrl: 'ftp://example.org/reglas.pdf' },
      { interestRateAnnualPct: '1'.repeat(13) },
      { acreditado: 'x'.repeat(65) },
    ]) {
      expect((await call('draft_credit_agreement', { ...DRAFT, ...bad })).body.result.isError).toBe(true)
    }
    const invalidWallet = await out('draft_credit_agreement', { ...DRAFT, acreditado: 'O0Il' + 'x'.repeat(40) })
    expect(invalidWallet.findings.map((f: { code: string }) => f.code)).toEqual(['INVALID_ADDRESS'])
  })

  test('draft, sign on the public routes, register on chain and export verifiable evidence', async () => {
    const drafted = await out('draft_credit_agreement', DRAFT)
    const agreementId = drafted.agreementId as string
    const links = { acreditante: `http://localhost:5176/sign/${agreementId}?as=acreditante`, acreditado: `http://localhost:5176/sign/${agreementId}?as=acreditado` }

    expect(await out('get_agreement', { agreementId })).toMatchObject({ status: 'draft', nextAction: 'share sign links', missingRoles: ['acreditante', 'acreditado'], signLinks: links })
    const round = await out('request_signatures', { agreementId })
    expect(round).toMatchObject({ status: 'pending_signatures', signLinks: links, hash: drafted.hash })
    expect(await out('request_signatures', { agreementId })).toEqual(round)

    const notYet = await out('request_anchor', { agreementId })
    expect(notYet).toMatchObject({
      action: 'registerCreditAgreement',
      signer: 'acreditante',
      signerAddress: lender.address,
      ready: false,
      missingRoles: ['acreditante', 'acreditado'],
      hash: drafted.hash,
      agreementHashHex: drafted.hash.slice(2),
    })
    expect(notYet.note).toBe(ANCHOR_NOTE)
    expect(notYet.anchorEndpoint).toBe(`http://localhost:3010/api/agreements/${agreementId}/anchors`)

    const path = `/api/agreements/${agreementId}/signatures`
    expect((await post(path, { role: 'acreditante', address: borrower.address, signature: borrower.sign(round.signMessage) })).status).toBe(403)
    expect((await post(path, { role: 'acreditante', address: lender.address, signature: borrower.sign(round.signMessage) })).status).toBe(401)
    expect((await post(path, { role: 'acreditante', address: lender.address, signature: lender.sign(round.signMessage) })).status).toBe(200)
    expect((await post(path, { role: 'acreditante', address: lender.address, signature: lender.sign(round.signMessage) })).status).toBe(409)
    expect(await out('get_agreement', { agreementId })).toMatchObject({ status: 'pending_signatures', nextAction: 'wait for signatures', missingRoles: ['acreditado'] })

    expect((await post(path, { role: 'acreditado', address: borrower.address, signature: borrower.sign(round.signMessage) })).status).toBe(200)
    const ready = await out('request_anchor', { agreementId })
    expect(ready).toMatchObject({ ready: true, missingRoles: [] })
    expect(ready.nextStep).toContain('own wallet')
    expect(await out('get_agreement', { agreementId })).toMatchObject({ status: 'signed', nextAction: 'register on chain' })

    const anchors = `/api/agreements/${agreementId}/anchors`
    const anchor = { kind: 'registerCreditAgreement', reference: txSignature(7), recordId: '3', signer: lender.address }
    expect((await post(anchors, { ...anchor, kind: 'otherKind' })).status).toBe(400)
    expect((await post(anchors, { ...anchor, reference: 'f'.repeat(64) })).status).toBe(400)
    for (const recordId of ['line-3', '', '-1', 1.5, -1, null, '1'.repeat(21), '18446744073709551616']) {
      expect((await post(anchors, { ...anchor, recordId })).status).toBe(400)
    }
    expect((await post(anchors, [anchor])).status).toBe(400)
    expect((await post(anchors, { ...anchor, chain: 'ethereum' })).status).toBe(400)
    expect((await post(anchors, { ...anchor, signer: borrower.address })).status).toBe(403)
    const recorded = await post(anchors, anchor)
    expect(recorded.status).toBe(200)
    expect(recorded.body.data.anchors[0]).toMatchObject({ chain: 'solana', kind: 'registerCreditAgreement', reference: anchor.reference, recordId: '3', signer: lender.address })
    expect((await post(anchors, anchor)).status).toBe(409)

    const done = await out('get_agreement', { agreementId })
    expect(done).toMatchObject({ status: 'anchored', nextAction: 'done', missingRoles: [] })
    const evidence = (await call('export_evidence', { agreementId })).body.result
    expect(evidence.isError).toBeFalsy()
    expect(evidence.structuredContent.verification).toMatchObject({ ok: true, hashMatches: true, complete: true, missingRoles: [] })
    expect(evidence.structuredContent.downloadUrl).toBe(`http://localhost:3010/api/agreements/${agreementId}/evidence`)
    const download = await app.request(`/api/agreements/${agreementId}/evidence`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toContain(agreementId)

    const md = await out('export_markdown', { agreementId })
    expect(md).toMatchObject({ agreementId, hash: drafted.hash, title: 'Contrato de crédito' })
    expect(md.markdown).toMatch(/## \d+\. Transparencia y padrón/)
  })

  test('the 8 KiB body cap applies to the bytes received, so a chunked body without Content-Length cannot bypass it', async () => {
    const { agreementId } = await out('draft_credit_agreement', DRAFT)
    const streamed = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          const bytes = new TextEncoder().encode(text)
          for (let i = 0; i < bytes.length; i += 1024) controller.enqueue(bytes.slice(i, i + 1024))
          controller.close()
        },
      })
    const send = (path: string, text: string) => {
      resetAgreementRateLimits()
      const request = new Request(`http://localhost${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: streamed(text), duplex: 'half' } as RequestInit)
      expect(request.headers.get('content-length')).toBeNull()
      return app.request(request)
    }
    const oversized = JSON.stringify({ role: 'acreditante', address: lender.address, signature: 'x', padding: 'p'.repeat(9000) })
    for (const route of ['signatures', 'anchors']) {
      expect((await send(`/api/agreements/${agreementId}/${route}`, oversized)).status).toBe(413)
    }
    const small = await send(`/api/agreements/${agreementId}/signatures`, JSON.stringify({ role: 'nobody' }))
    expect(small.status).toBe(400)
    expect(await small.json()).toEqual({ error: 'role must be one of acreditante, acreditado' })
    resetAgreementRateLimits()
    const declared = await app.request(`/api/agreements/${agreementId}/signatures`, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '9000' }, body: '{}' })
    expect(declared.status).toBe(413)
  })

  test('the acreditante must have signed before an anchor is recorded', async () => {
    const { agreementId } = await out('draft_credit_agreement', DRAFT)
    const res = await post(`/api/agreements/${agreementId}/anchors`, { kind: 'registerCreditAgreement', reference: txSignature(9), recordId: '4', signer: lender.address })
    expect(res.status).toBe(409)
  })

  test('another account gets the same not-found answer as an id that does not exist, and changes nothing', async () => {
    const { agreementId } = await out('draft_credit_agreement', DRAFT)
    const missing = '0'.repeat(32)
    for (const name of ['get_agreement', 'request_signatures', 'request_anchor', 'export_markdown', 'export_evidence']) {
      const foreign = (await call(name, { agreementId }, KEY_B)).body.result
      const absent = (await call(name, { agreementId: missing }, KEY_B)).body.result
      expect(foreign.isError).toBe(true)
      expect(foreign.structuredContent).toEqual({ found: false, agreementId, reason: 'No agreement with that id for this account.' })
      expect(absent.structuredContent).toEqual({ found: false, agreementId: missing, reason: foreign.structuredContent.reason })
    }
    expect(getAgreement(agreementId)?.status).toBe('draft')
  })

  test('a malformed agreementId names the expected format', async () => {
    const res = await call('get_agreement', { agreementId: 'not-an-id' })
    expect(res.body.result.isError).toBe(true)
    expect(JSON.stringify(res.body)).toContain('agreementId must be the 32-character hex id returned by a draft tool')
  })
})

describe('request budget', () => {
  const initialize = (target: Hono, key: string | null) => rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }, key, target)

  test('each key tenant has its own budget; a request without a valid key is refused before it counts', async () => {
    const bare = createApp({ limit: 2 })
    for (let i = 0; i < 3; i++) expect((await initialize(bare, null)).status).toBe(401)
    expect((await initialize(bare, KEY)).status).toBe(200)
    expect((await initialize(bare, KEY)).status).toBe(200)
    const limited = await initialize(bare, KEY)
    expect(limited.status).toBe(429)
    expect(limited.body).toEqual({ error: 'rate limited' })
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await initialize(bare, KEY_B)).status).toBe(200)
  })

  test('a batch counts each call and is refused whole when it does not fit; a body over 1 MiB is refused by the transport', async () => {
    const bare = createApp({ limit: 2 })
    const key = insertApiKey({ tenant: 'batch-firm', label: 'batch' }).plaintext
    const count = () => (agreementsDatabase().query('SELECT COUNT(*) AS n FROM agreements').get() as { n: number }).n
    const before = count()
    const headers = { ...HEADERS, authorization: `Bearer ${key}` }
    const batch = Array.from({ length: 5 }, () => ({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: 'draft_credit_agreement', arguments: DRAFT } }))
    expect((await bare.request('/mcp', { method: 'POST', headers, body: JSON.stringify(batch) })).status).toBe(429)
    expect(count()).toBe(before)
    const big = await bare.request('/mcp', { method: 'POST', headers: { ...headers, 'content-length': '2000000' }, body: JSON.stringify(batch.slice(0, 1)) })
    expect(big.status).toBe(413)
    expect(count()).toBe(before)
    expect((await initialize(bare, key)).status).toBe(200)
    expect((await initialize(bare, key)).status).toBe(429)
  })
})
