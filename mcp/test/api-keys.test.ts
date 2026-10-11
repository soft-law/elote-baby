/**
 * MCP API keys: generated once in plaintext, stored only as a
 * sha256 digest, listed without secrets, revocable, capped per tenant.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { agreementsDatabase, closeAgreementsStore, initAgreementsStore } from '../src/store'
import { API_KEY_PREFIX, ApiKeyLimitError, MAX_ACTIVE_KEYS, findActiveApiKeyByHash, generateApiKey, hashApiKey, insertApiKey, listApiKeys, revokeApiKey, touchApiKeyLastUsed } from '../src/api-keys'

beforeAll(() => {
  initAgreementsStore(':memory:')
})
afterAll(() => {
  closeAgreementsStore()
})

describe('key material', () => {
  test('a key is a recognisable prefix plus 32 random bytes in base64url; only its digest is kept', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.plaintext).toMatch(/^elote_[A-Za-z0-9_-]{43}$/)
    expect(a.plaintext.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(a.prefix).toBe(a.plaintext.slice(0, 12))
    expect(a.hash).toBe(createHash('sha256').update(a.plaintext).digest('hex'))
    expect(hashApiKey(a.plaintext)).toBe(a.hash)
    expect(a.plaintext).not.toBe(b.plaintext)
  })
})

describe('storage', () => {
  test('a created key is listed by prefix and label, never by digest, and resolves its tenant by digest', () => {
    const created = insertApiKey({ tenant: 'acct:t1', label: 'laptop' })
    expect(created.plaintext).toMatch(/^elote_/)
    const listed = listApiKeys('acct:t1')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toEqual({ id: created.id, prefix: created.prefix, label: 'laptop', createdAt: created.createdAt, lastUsedAt: null })
    expect(JSON.stringify(listed)).not.toContain(hashApiKey(created.plaintext))
    expect(findActiveApiKeyByHash(hashApiKey(created.plaintext))).toEqual({ id: created.id, tenant: 'acct:t1' })
    expect(findActiveApiKeyByHash(hashApiKey('elote_nope'))).toBeNull()
  })

  test('revoking hides the key from the list and from authentication; another tenant cannot revoke it', () => {
    const created = insertApiKey({ tenant: 'acct:t2', label: 'phone' })
    expect(revokeApiKey(created.id, 'acct:other')).toBe(false)
    expect(findActiveApiKeyByHash(hashApiKey(created.plaintext))).not.toBeNull()
    expect(revokeApiKey(created.id, 'acct:t2')).toBe(true)
    expect(revokeApiKey(created.id, 'acct:t2')).toBe(false)
    expect(findActiveApiKeyByHash(hashApiKey(created.plaintext))).toBeNull()
    expect(listApiKeys('acct:t2')).toHaveLength(0)
  })

  test('a tenant holds at most five active keys; revoking one frees a slot', () => {
    const keys = Array.from({ length: MAX_ACTIVE_KEYS }, (_, i) => insertApiKey({ tenant: 'acct:t3', label: `k${i}` }))
    expect(() => insertApiKey({ tenant: 'acct:t3', label: 'one too many' })).toThrow(ApiKeyLimitError)
    expect(revokeApiKey(keys[0].id, 'acct:t3')).toBe(true)
    expect(() => insertApiKey({ tenant: 'acct:t3', label: 'fits again' })).not.toThrow()
    expect(listApiKeys('acct:t3')).toHaveLength(MAX_ACTIVE_KEYS)
  })

  test('last use is recorded, but rewritten at most once a minute', () => {
    const created = insertApiKey({ tenant: 'acct:t4', label: 'cli' })
    const lastUsed = () => (agreementsDatabase().query('SELECT last_used_at FROM api_keys WHERE id = ?').get(created.id) as { last_used_at: string | null }).last_used_at
    expect(lastUsed()).toBeNull()
    touchApiKeyLastUsed(created.id)
    const first = lastUsed()
    expect(first).not.toBeNull()
    agreementsDatabase().run("UPDATE api_keys SET last_used_at = datetime('now', '-30 seconds') WHERE id = ?", [created.id])
    const recent = lastUsed()
    touchApiKeyLastUsed(created.id)
    expect(lastUsed()).toBe(recent)
    agreementsDatabase().run("UPDATE api_keys SET last_used_at = datetime('now', '-120 seconds') WHERE id = ?", [created.id])
    const stale = lastUsed()
    touchApiKeyLastUsed(created.id)
    expect(lastUsed()).not.toBe(stale)
  })
})
