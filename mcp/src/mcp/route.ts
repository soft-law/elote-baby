/**
 * Streamable HTTP MCP endpoint at /mcp, stateless: a fresh server + transport
 * per request, JSON responses (no SSE), and a per-tenant API key in
 * `Authorization: Bearer <key>`. Keys are created by the operator with
 * `bun run create-key` and live in the agreements database as digests; the
 * tenant is the account name given at creation. Each tenant gets `limit` JSON-RPC
 * messages per `windowMs`, counted only after the key authenticates; a batch
 * counts as many messages as it carries.
 */
import type { Hono } from 'hono'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createAgreementsServer } from './server'
import { API_KEY_PREFIX, findActiveApiKeyByHash, hashApiKey, isRevokedApiKeyHash, touchApiKeyLastUsed } from '../api-keys'

const UNAUTHORIZED_MESSAGE = 'Missing or invalid API key. Ask the server operator for one (bun run create-key).'
const REVOKED_MESSAGE = 'This API key was revoked. Ask the server operator for a new one (bun run create-key).'

/** Resolves the bearer to its tenant through the key store. Never logs the key. */
export async function authenticate(authorization: string | undefined): Promise<string | null> {
  const bearer = bearerKey(authorization)
  if (!bearer) return null
  const found = findActiveApiKeyByHash(hashApiKey(bearer))
  if (!found) return null
  touchApiKeyLastUsed(found.id)
  return found.tenant
}

function bearerKey(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null
  const bearer = authorization.slice('Bearer '.length).trim()
  return bearer.startsWith(API_KEY_PREFIX) ? bearer : null
}

/** The 401 says whether a presented key was revoked by its owner and nothing else about it. */
function unauthorizedMessage(authorization: string | undefined): string {
  const bearer = bearerKey(authorization)
  return bearer && isRevokedApiKeyHash(hashApiKey(bearer)) ? REVOKED_MESSAGE : UNAUTHORIZED_MESSAGE
}

/** Largest request body /mcp accepts; the transport answers 413 above it. */
export const MAX_MCP_BODY_BYTES = 1_048_576

/** The body as text, or null once it passes `maxBytes` (declared or read). */
async function readBodyCapped(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > maxBytes) return null
  const body = request.clone().body
  if (!body) return ''
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * How many JSON-RPC messages a request carries: the length of a batch, else 1.
 * A body that is not JSON, or one over MAX_MCP_BODY_BYTES, counts as 1 and is
 * left for the transport to refuse (parse error or 413).
 */
async function messageCount(request: Request): Promise<number> {
  if (request.method !== 'POST') return 1
  try {
    const text = await readBodyCapped(request, MAX_MCP_BODY_BYTES)
    if (text === null) return 1
    const body: unknown = JSON.parse(text)
    return Array.isArray(body) ? Math.max(1, body.length) : 1
  } catch {
    return 1
  }
}

export interface McpMountOptions {
  /** Requests per tenant per window. */
  limit?: number
  windowMs?: number
}

const MAX_TRACKED_TENANTS = 10_000

export function mountMcp(app: Hono, { limit = 120, windowMs = 60_000 }: McpMountOptions = {}): void {
  const windows = new Map<string, { count: number; resetAt: number }>()
  /** Seconds until the tenant may call again, or null while `cost` more messages fit in the window. A refused request uses none of the budget. */
  const retryAfter = (tenant: string, cost: number): number | null => {
    const now = Date.now()
    if (windows.size > MAX_TRACKED_TENANTS) {
      for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key)
    }
    const entry = windows.get(tenant)
    const current = !entry || entry.resetAt <= now ? { count: 0, resetAt: now + windowMs } : entry
    windows.set(tenant, current)
    if (current.count + cost > limit) return Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    current.count += cost
    return null
  }

  app.all('/mcp', async c => {
    const authorization = c.req.header('authorization')
    const tenant = await authenticate(authorization)
    if (!tenant) {
      c.header('WWW-Authenticate', 'Bearer realm="elote", error="invalid_token"')
      return c.json({ error: 'unauthorized', message: unauthorizedMessage(authorization) }, 401)
    }
    const wait = retryAfter(tenant, await messageCount(c.req.raw))
    if (wait !== null) {
      c.header('Retry-After', String(wait))
      return c.json({ error: 'rate limited' }, 429)
    }
    const server = createAgreementsServer(tenant)
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: MAX_MCP_BODY_BYTES })
    await server.connect(transport)
    try {
      return await transport.handleRequest(c.req.raw)
    } finally {
      void transport.close()
    }
  })
}
