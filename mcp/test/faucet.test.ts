/**
 * The devnet faucet route: body validation, the unconfigured answer, the
 * per-wallet daily limit, the success shape with the network sender stubbed,
 * and the RPC failure answer (no key, no stack in the response or the log).
 */
import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test'
import { ed25519 } from '@noble/curves/ed25519'
import { base58 } from '@scure/base'
import type { Address } from '@solana/kit'
import { createApp } from '../src/app'
import { FAUCET_AMOUNT, FAUCET_WINDOW_MS, type FaucetSender } from '../src/faucet'
import { txSignature, wallet } from './helpers'

const ASSET = wallet(40).address
const RECIPIENT = wallet(41).address
const OTHER = wallet(42).address
const CONFIGURED = { FAUCET_ASSET_MINT: ASSET }

function post(app: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = {}) {
  return app.request('/api/faucet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

/** A sender stub that records its calls and returns a fixed signature. */
function stubSender(signature = txSignature(7)) {
  const calls: Array<{ recipient: Address; asset: Address }> = []
  const sender: FaucetSender = async (recipient, asset) => {
    calls.push({ recipient, asset })
    return signature
  }
  return { calls, sender, signature }
}

const SAVED = {
  FAUCET_KEYPAIR: process.env.FAUCET_KEYPAIR,
  FAUCET_ASSET_MINT: process.env.FAUCET_ASSET_MINT,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
}
let errorLog: ReturnType<typeof spyOn>

beforeAll(() => {
  delete process.env.FAUCET_KEYPAIR
  delete process.env.FAUCET_ASSET_MINT
  delete process.env.SOLANA_RPC_URL
})
afterAll(() => {
  for (const [key, value] of Object.entries(SAVED)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})
afterEach(() => {
  errorLog?.mockRestore()
})

describe('POST /api/faucet', () => {
  test('rejects a missing, malformed or non-wallet address with 400', async () => {
    const { sender, calls } = stubSender()
    const app = createApp({ faucet: { sender, env: CONFIGURED, clientLimit: 100 } })
    for (const body of [{}, { address: 42 }, { address: 'not-a-wallet' }, { address: '0'.repeat(44) }, { address: '11111111111111111111111111111111' }]) {
      const res = await post(app, body)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: string }).error).toContain('address')
    }
    expect((await post(app, 'not json')).status).toBe(400)
    expect((await post(app, '[1,2]')).status).toBe(400)
    expect(calls).toHaveLength(0)
  })

  test('answers 503 when the faucet is not configured', async () => {
    errorLog = spyOn(console, 'error').mockImplementation(() => {})
    // Nothing in process.env (cleared in beforeAll).
    let res = await post(createApp(), { address: RECIPIENT })
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: string }).error).toBe('Test tokens are not available right now.')
    // An asset but no key, and a key that is not 64 bytes.
    res = await post(createApp({ faucet: { env: { FAUCET_ASSET_MINT: ASSET } } }), { address: RECIPIENT })
    expect(res.status).toBe(503)
    res = await post(createApp({ faucet: { env: { FAUCET_ASSET_MINT: ASSET, FAUCET_KEYPAIR: Buffer.alloc(32).toString('base64') } } }), {
      address: RECIPIENT,
    })
    expect(res.status).toBe(503)
    // A sender but no asset.
    res = await post(createApp({ faucet: { sender: stubSender().sender, env: {} } }), { address: RECIPIENT })
    expect(res.status).toBe(503)
  })

  test('sends 1,000 test tokens once and answers with the signature, amount and asset', async () => {
    const { sender, calls, signature } = stubSender()
    const app = createApp({ faucet: { sender, env: CONFIGURED } })
    const res = await post(app, { address: RECIPIENT })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signature, amount: '1000000000', mint: ASSET })
    expect(FAUCET_AMOUNT).toBe(1_000_000_000n)
    expect(calls).toEqual([{ recipient: RECIPIENT as Address, asset: ASSET as Address }])
  })

  test('limits each wallet to one request per 24 hours with 429 and retryAfterSeconds', async () => {
    let clock = 1_000_000
    const { sender, calls } = stubSender()
    const app = createApp({ faucet: { sender, env: CONFIGURED, now: () => clock, clientLimit: 100 } })
    expect((await post(app, { address: RECIPIENT })).status).toBe(200)

    clock += 60_000
    const second = await post(app, { address: RECIPIENT })
    expect(second.status).toBe(429)
    const body = (await second.json()) as { error: string; retryAfterSeconds: number }
    expect(body.retryAfterSeconds).toBe((FAUCET_WINDOW_MS - 60_000) / 1000)
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(86_400)
    expect(second.headers.get('retry-after')).toBe(String(body.retryAfterSeconds))
    expect(body.error).toContain('test tokens')

    // Another wallet is not affected; the first may ask again after the window.
    expect((await post(app, { address: OTHER })).status).toBe(200)
    clock += FAUCET_WINDOW_MS
    expect((await post(app, { address: RECIPIENT })).status).toBe(200)
    expect(calls.map(call => call.recipient)).toEqual([RECIPIENT, OTHER, RECIPIENT] as Address[])
  })

  test('applies the per-client-address limit', async () => {
    const { sender } = stubSender()
    const app = createApp({ faucet: { sender, env: CONFIGURED, clientLimit: 2 } })
    const headers = { 'x-forwarded-for': '203.0.113.9' }
    expect((await post(app, { address: wallet(50).address }, headers)).status).toBe(200)
    expect((await post(app, { address: wallet(51).address }, headers)).status).toBe(200)
    expect((await post(app, { address: wallet(52).address }, headers)).status).toBe(429)
    expect((await post(app, { address: wallet(52).address }, { 'x-forwarded-for': '203.0.113.10' })).status).toBe(200)
  })

  test('a CORS preflight answers with CORS headers and does not use the per-client limit', async () => {
    const saved = process.env.CORS_ORIGINS
    process.env.CORS_ORIGINS = 'http://localhost:4322'
    try {
      const app = createApp({ faucet: { sender: stubSender().sender, env: CONFIGURED, clientLimit: 1 } })
      const headers = { origin: 'http://localhost:4322', 'x-forwarded-for': '203.0.113.20' }
      for (let i = 0; i < 3; i++) {
        const preflight = await app.request('/api/faucet', {
          method: 'OPTIONS',
          headers: { ...headers, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
        })
        expect(preflight.status).toBe(204)
        expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:4322')
        expect(preflight.headers.get('access-control-allow-methods')).toContain('POST')
      }
      expect((await post(app, { address: wallet(60).address }, headers)).status).toBe(200)
      expect((await post(app, { address: wallet(61).address }, headers)).status).toBe(429)
    } finally {
      if (saved === undefined) delete process.env.CORS_ORIGINS
      else process.env.CORS_ORIGINS = saved
    }
  })

  test('two concurrent requests for one wallet send once; the second gets 429', async () => {
    let calls = 0
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const sender: FaucetSender = async () => {
      calls += 1
      await gate
      return txSignature(9)
    }
    const app = createApp({ faucet: { sender, env: CONFIGURED, clientLimit: 100 } })
    const first = post(app, { address: RECIPIENT })
    const second = post(app, { address: RECIPIENT })
    // Let both requests reach the handler before the slow sender finishes.
    await new Promise(resolve => setTimeout(resolve, 20))
    release()
    const statuses = (await Promise.all([first, second])).map(res => res.status).sort()
    expect(statuses).toEqual([200, 429])
    expect(calls).toBe(1)
  })

  test('answers 502 when sending fails and lets the wallet try again', async () => {
    errorLog = spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    const sender: FaucetSender = async () => {
      if (fail) throw new Error('fetch failed')
      return txSignature(8)
    }
    const app = createApp({ faucet: { sender, env: CONFIGURED } })
    const res = await post(app, { address: RECIPIENT })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Could not send test tokens. Try again in a minute.' })
    fail = false
    expect((await post(app, { address: RECIPIENT })).status).toBe(200)
  })

  test('with a real key and an unreachable RPC, answers 502 without leaking the key', async () => {
    errorLog = spyOn(console, 'error').mockImplementation(() => {})
    const secret = new Uint8Array(32).fill(43)
    const keypair = Buffer.concat([Buffer.from(secret), Buffer.from(ed25519.getPublicKey(secret))]).toString('base64')
    const app = createApp({
      faucet: { env: { FAUCET_ASSET_MINT: ASSET, FAUCET_KEYPAIR: keypair, SOLANA_RPC_URL: 'http://127.0.0.1:9' } },
    })
    const res = await post(app, { address: RECIPIENT })
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).not.toContain(keypair)
    expect(text).not.toContain('at ')
    const logged = errorLog.mock.calls.flat().join('\n')
    expect(logged).not.toContain(keypair)
    expect(logged).toContain('faucet: send failed')
  })

  test('the network sender signs one transaction with the faucet key, sends it and waits for confirmation', async () => {
    const secret = new Uint8Array(32).fill(44)
    const faucetKey = ed25519.getPublicKey(secret)
    const keypair = Buffer.concat([Buffer.from(secret), Buffer.from(faucetKey)]).toString('base64')
    const methods: string[] = []
    let sent: Uint8Array | null = null
    const rpc = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(request) {
        const { id, method, params } = (await request.json()) as { id: number; method: string; params: unknown[] }
        methods.push(method)
        const reply = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result })
        if (method === 'getLatestBlockhash') return reply({ context: { slot: 1 }, value: { blockhash: wallet(45).address, lastValidBlockHeight: 100 } })
        if (method === 'sendTransaction') {
          sent = Uint8Array.from(Buffer.from(params[0] as string, 'base64'))
          return reply(base58.encode(sent.slice(1, 65)))
        }
        if (method === 'getSignatureStatuses') return reply({ context: { slot: 2 }, value: [{ slot: 2, confirmations: 1, err: null, confirmationStatus: 'confirmed' }] })
        return Response.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'unexpected' } })
      },
    })
    try {
      const app = createApp({ faucet: { env: { FAUCET_ASSET_MINT: ASSET, FAUCET_KEYPAIR: keypair, SOLANA_RPC_URL: `http://127.0.0.1:${rpc.port}` } } })
      const res = await post(app, { address: RECIPIENT })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { signature: string; amount: string; mint: string }
      expect(methods).toEqual(['getLatestBlockhash', 'sendTransaction', 'getSignatureStatuses'])
      expect(sent).not.toBeNull()
      const wire = sent as unknown as Uint8Array
      // One signature (the faucet key is the only signer and the fee payer), and it is the one returned.
      expect(wire[0]).toBe(1)
      expect(body.signature).toBe(base58.encode(wire.slice(1, 65)))
      expect(body).toMatchObject({ amount: '1000000000', mint: ASSET })
      const message = wire.slice(65)
      const hex = Buffer.from(message).toString('hex')
      expect(hex).toContain(Buffer.from(faucetKey).toString('hex'))
      expect(hex).toContain(Buffer.from(base58.decode(RECIPIENT)).toString('hex'))
      expect(hex).toContain(Buffer.from(base58.decode(ASSET)).toString('hex'))
      expect(ed25519.verify(wire.slice(1, 65), message, faucetKey)).toBe(true)
    } finally {
      await rpc.stop(true)
    }
  })

  test('the faucet answers cross-origin requests from the allowed origin', async () => {
    const saved = process.env.CORS_ORIGINS
    process.env.CORS_ORIGINS = 'http://localhost:4322'
    try {
      const app = createApp({ faucet: { sender: stubSender().sender, env: CONFIGURED } })
      const res = await post(app, { address: RECIPIENT }, { origin: 'http://localhost:4322' })
      expect(res.status).toBe(200)
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:4322')
    } finally {
      if (saved === undefined) delete process.env.CORS_ORIGINS
      else process.env.CORS_ORIGINS = saved
    }
  })
})
