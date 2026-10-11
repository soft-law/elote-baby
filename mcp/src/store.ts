/**
 * Agreements, signatures, anchors and API key digests live in one SQLite file
 * (`AGREEMENTS_DB`). The exact document bytes and the exact message each
 * party signs are stored once and never recomputed.
 */
import { Database } from 'bun:sqlite'
import { randomBytes } from 'node:crypto'
import { getTemplate, type ChainId } from './engine'

export type AgreementStatus = 'draft' | 'pending_signatures' | 'signed' | 'anchored'
/** A signing role named by the agreement's template (acreditante, acreditado). */
export type PartyRole = string

export interface AgreementRecord {
  id: string
  tenant: string
  chain: ChainId
  templateId: string
  templateVersion: string
  document: Record<string, unknown>
  hash: string
  signMessage: string
  parties: Record<PartyRole, string>
  /** Signing roles, from the template (falls back to the parties present). */
  roles: PartyRole[]
  /** The typed terms the draft was built from. */
  terms: Record<string, unknown>
  status: AgreementStatus
  createdAt: string
}

/** The on-chain act that carried the signed agreement: opening the credit line in the pool program with the agreement hash. */
export type AnchorKind = 'registerCreditAgreement'
export const ANCHOR_KINDS: readonly AnchorKind[] = ['registerCreditAgreement']

export interface AnchorRecord {
  chain: ChainId
  kind: AnchorKind
  /** Transaction signature on Solana. */
  reference: string
  /** Id of the on-chain record created (the credit line id). */
  recordId: string | null
  documentUri: string
  signer: string
  recordedAt: string
}

export interface SignatureRecord {
  role: PartyRole
  address: string
  signature: string
  method: string
  signedAt: string
  /** X25519 public key (base64url) the party published for end-to-end encrypted documents; absent for plaintext-only parties. */
  encryptionPublicKey?: string
}

let db: Database | null = null

export function initAgreementsStore(path = process.env.AGREEMENTS_DB ?? 'elote-agreements.db'): Database {
  if (db) db.close()
  db = new Database(path, { create: true })
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS agreements (
      id TEXT PRIMARY KEY,
      tenant TEXT NOT NULL,
      chain TEXT NOT NULL,
      template_id TEXT NOT NULL,
      template_version TEXT NOT NULL,
      document TEXT NOT NULL,
      hash TEXT NOT NULL,
      sign_message TEXT NOT NULL,
      parties TEXT NOT NULL,
      terms TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agreement_anchors (
      agreement_id TEXT NOT NULL REFERENCES agreements(id),
      chain TEXT NOT NULL,
      kind TEXT NOT NULL,
      reference TEXT NOT NULL,
      record_id TEXT,
      document_uri TEXT NOT NULL,
      signer TEXT NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agreement_id, chain, kind)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agreement_signatures (
      agreement_id TEXT NOT NULL REFERENCES agreements(id),
      role TEXT NOT NULL,
      address TEXT NOT NULL,
      signature TEXT NOT NULL,
      method TEXT NOT NULL,
      encryption_public_key TEXT,
      signed_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agreement_id, role)
    )
  `)
  // MCP keys: only the sha256 digest of a key is stored.
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      tenant TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      prefix TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      revoked_at TEXT
    )
  `)
  db.exec('CREATE INDEX IF NOT EXISTS api_keys_tenant ON api_keys(tenant, revoked_at)')
  return db
}

export function closeAgreementsStore(): void {
  db?.close()
  db = null
}

function store(): Database {
  if (!db) throw new Error('agreements store not initialized')
  return db
}

/** The open agreements database, for sibling modules that keep their own tables in it. */
export function agreementsDatabase(): Database {
  return store()
}

export function isAgreementId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value)
}

export function rolesFor(templateId: string, parties: Record<PartyRole, string>): PartyRole[] {
  return getTemplate(templateId)?.roles ?? Object.keys(parties)
}

export function createAgreement(input: Omit<AgreementRecord, 'id' | 'status' | 'createdAt' | 'roles'>): AgreementRecord {
  const id = randomBytes(16).toString('hex')
  store()
    .query(
      `
    INSERT INTO agreements (id, tenant, chain, template_id, template_version, document, hash, sign_message, parties, terms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      id,
      input.tenant,
      input.chain,
      input.templateId,
      input.templateVersion,
      JSON.stringify(input.document),
      input.hash,
      input.signMessage,
      JSON.stringify(input.parties),
      JSON.stringify(input.terms ?? {}),
    )
  return getAgreement(id)!
}

interface AgreementRow {
  id: string
  tenant: string
  chain: ChainId
  template_id: string
  template_version: string
  document: string
  hash: string
  sign_message: string
  parties: string
  terms: string
  status: AgreementStatus
  created_at: string
}

export function getAgreement(id: string): AgreementRecord | null {
  const row = store().query('SELECT * FROM agreements WHERE id = ?').get(id) as AgreementRow | null
  if (!row) return null
  const parties = JSON.parse(row.parties) as Record<PartyRole, string>
  return {
    id: row.id,
    tenant: row.tenant,
    chain: row.chain,
    templateId: row.template_id,
    templateVersion: row.template_version,
    document: JSON.parse(row.document) as Record<string, unknown>,
    hash: row.hash,
    signMessage: row.sign_message,
    parties,
    roles: rolesFor(row.template_id, parties),
    terms: JSON.parse(row.terms || '{}') as Record<string, unknown>,
    status: row.status,
    createdAt: row.created_at,
  }
}

export function listSignatures(id: string): SignatureRecord[] {
  return (
    store().query('SELECT role, address, signature, method, signed_at, encryption_public_key FROM agreement_signatures WHERE agreement_id = ? ORDER BY signed_at, role').all(id) as {
      role: PartyRole
      address: string
      signature: string
      method: string
      signed_at: string
      encryption_public_key: string | null
    }[]
  ).map(row => ({
    role: row.role,
    address: row.address,
    signature: row.signature,
    method: row.method,
    signedAt: row.signed_at,
    ...(row.encryption_public_key ? { encryptionPublicKey: row.encryption_public_key } : {}),
  }))
}

export function setAgreementStatus(id: string, status: AgreementStatus): void {
  store().query('UPDATE agreements SET status = ? WHERE id = ?').run(status, id)
}

export function listAnchors(id: string): AnchorRecord[] {
  return (
    store().query('SELECT chain, kind, reference, record_id, document_uri, signer, recorded_at FROM agreement_anchors WHERE agreement_id = ? ORDER BY recorded_at').all(id) as {
      chain: ChainId
      kind: AnchorKind
      reference: string
      record_id: string | null
      document_uri: string
      signer: string
      recorded_at: string
    }[]
  ).map(row => ({ chain: row.chain, kind: row.kind, reference: row.reference, recordId: row.record_id, documentUri: row.document_uri, signer: row.signer, recordedAt: row.recorded_at }))
}

/** Required roles that have not signed yet; empty when the agreement is formed. */
export function missingSignatures(id: string): PartyRole[] {
  const record = getAgreement(id)
  if (!record) return []
  return record.roles.filter(role => !hasSignature(id, role))
}

/** Records the on-chain act that carried the document; the agreement becomes `anchored` whatever its consent state (a chain fact is recorded, not judged). */
export function addAnchor(id: string, anchor: Omit<AnchorRecord, 'recordedAt'>): void {
  const database = store()
  database.transaction(() => {
    database
      .query('INSERT INTO agreement_anchors (agreement_id, chain, kind, reference, record_id, document_uri, signer) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, anchor.chain, anchor.kind, anchor.reference, anchor.recordId, anchor.documentUri, anchor.signer)
    database.query("UPDATE agreements SET status = 'anchored' WHERE id = ?").run(id)
  })()
}

/** Records one party's signature; the agreement becomes `signed` when every role of the template has one (by role, not by count). */
export function addSignature(id: string, signature: Omit<SignatureRecord, 'signedAt'>): AgreementStatus {
  const database = store()
  const insert = database.transaction(() => {
    database
      .query('INSERT INTO agreement_signatures (agreement_id, role, address, signature, method, encryption_public_key) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, signature.role, signature.address, signature.signature, signature.method, signature.encryptionPublicKey ?? null)
    const signedRoles = new Set((database.query('SELECT role FROM agreement_signatures WHERE agreement_id = ?').all(id) as { role: PartyRole }[]).map(row => row.role))
    const current = database.query('SELECT status, template_id, parties FROM agreements WHERE id = ?').get(id) as { status: AgreementStatus; template_id: string; parties: string }
    const required = rolesFor(current.template_id, JSON.parse(current.parties) as Record<PartyRole, string>)
    const status: AgreementStatus = current.status === 'anchored' ? 'anchored' : required.every(role => signedRoles.has(role)) ? 'signed' : 'pending_signatures'
    database.query('UPDATE agreements SET status = ? WHERE id = ?').run(status, id)
    return status
  })
  return insert()
}

export function hasSignature(id: string, role: PartyRole): boolean {
  return !!store().query('SELECT 1 FROM agreement_signatures WHERE agreement_id = ? AND role = ?').get(id, role)
}
