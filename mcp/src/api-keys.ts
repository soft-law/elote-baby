/**
 * MCP API keys, kept in the agreements database.
 *
 * A key is shown to its owner once; the server stores only its sha256
 * digest and authenticates by looking the digest up (equality on a digest
 * leaks nothing useful: an attacker still needs the preimage). The tenant
 * is an opaque account name chosen when the key is created (scripts/create-key.ts);
 * the MCP tools scope every agreement by it.
 */
import { createHash, randomBytes } from 'node:crypto'
import { agreementsDatabase } from './store'

export const API_KEY_PREFIX = 'elote_'
export const MAX_ACTIVE_KEYS = 5
export const LAST_USED_THROTTLE_SECONDS = 60
/** Characters of the key shown in lists so the owner can tell keys apart. */
const DISPLAY_PREFIX_LENGTH = 12

export interface ApiKeyView {
  id: string
  prefix: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

export class ApiKeyLimitError extends Error {
  constructor() {
    super(`At most ${MAX_ACTIVE_KEYS} active keys per account`)
  }
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
  return { plaintext, hash: hashApiKey(plaintext), prefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH) }
}

interface ApiKeyRow {
  id: string
  tenant: string
  prefix: string
  label: string
  created_at: string
  last_used_at: string | null
}

function view(row: ApiKeyRow): ApiKeyView {
  return { id: row.id, prefix: row.prefix, label: row.label, createdAt: row.created_at, lastUsedAt: row.last_used_at }
}

/** Creates a key for `tenant`; the returned `plaintext` is the only copy that will ever exist. */
export function insertApiKey(input: { tenant: string; label: string }): ApiKeyView & { plaintext: string } {
  const db = agreementsDatabase()
  const key = generateApiKey()
  const id = randomBytes(16).toString('hex')
  const create = db.transaction(() => {
    const { active } = db.query('SELECT COUNT(*) AS active FROM api_keys WHERE tenant = ? AND revoked_at IS NULL').get(input.tenant) as { active: number }
    if (active >= MAX_ACTIVE_KEYS) throw new ApiKeyLimitError()
    db.run('INSERT INTO api_keys (id, tenant, key_hash, prefix, label) VALUES (?, ?, ?, ?, ?)', [id, input.tenant, key.hash, key.prefix, input.label])
  })
  create()
  const row = db.query('SELECT id, tenant, prefix, label, created_at, last_used_at FROM api_keys WHERE id = ?').get(id) as ApiKeyRow
  return { ...view(row), plaintext: key.plaintext }
}

export function listApiKeys(tenant: string): ApiKeyView[] {
  const rows = agreementsDatabase()
    .query('SELECT id, tenant, prefix, label, created_at, last_used_at FROM api_keys WHERE tenant = ? AND revoked_at IS NULL ORDER BY created_at DESC, id')
    .all(tenant) as ApiKeyRow[]
  return rows.map(view)
}

export function findActiveApiKeyByHash(hash: string): { id: string; tenant: string } | null {
  const row = agreementsDatabase().query('SELECT id, tenant FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL').get(hash) as { id: string; tenant: string } | null
  return row ?? null
}

/** Whether this digest belonged to a key its owner has revoked; used only to word the 401. */
export function isRevokedApiKeyHash(hash: string): boolean {
  return !!agreementsDatabase().query('SELECT 1 FROM api_keys WHERE key_hash = ? AND revoked_at IS NOT NULL').get(hash)
}

/** Records a use; the row is rewritten at most once per minute so the hot path stays cheap. */
export function touchApiKeyLastUsed(id: string): void {
  agreementsDatabase().run(
    `UPDATE api_keys SET last_used_at = datetime('now')
     WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', ?))`,
    [id, `-${LAST_USED_THROTTLE_SECONDS} seconds`],
  )
}

/** Revokes one of `tenant`'s keys; false when it is not theirs or already revoked. */
export function revokeApiKey(id: string, tenant: string): boolean {
  const result = agreementsDatabase().run("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND tenant = ? AND revoked_at IS NULL", [id, tenant])
  return result.changes > 0
}
