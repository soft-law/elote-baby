/**
 * A readable Markdown view of an agreement document, for any Markdown editor.
 * It is a view only: what parties sign is the JSON document
 * and its hash, never these bytes. Pure and deterministic.
 */

const TITLES: Record<string, string> = {
  credit_agreement: 'Contrato de crédito',
}

interface Clause {
  clause_number?: number
  title?: string
  body?: string
}

function titleOf(document: Record<string, unknown>): string {
  const type = typeof document.document_type === 'string' ? document.document_type : ''
  return TITLES[type] ?? (type ? type.replace(/_/g, ' ') : 'Agreement')
}

function partyLines(parties: unknown): string[] {
  if (!parties || typeof parties !== 'object') return []
  return Object.entries(parties as Record<string, unknown>).flatMap(([role, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const party = value as Record<string, unknown>
    if (typeof party.address !== 'string') return []
    const label = typeof party.role === 'string' ? party.role : role.charAt(0).toUpperCase() + role.slice(1)
    return [`- **${label}:** \`${party.address}\``]
  })
}

export function renderAgreementMarkdown(document: Record<string, unknown>, options: { hash: string }): string {
  const lines: string[] = [`# ${titleOf(document)}`, '']
  lines.push(
    `> This Markdown is a readable view, not the signed document. The signed document is the JSON whose hash is \`${options.hash}\`.`,
    `> Este Markdown es una vista legible; no es el documento firmado. El documento firmado es el JSON cuyo hash es \`${options.hash}\`.`,
    '',
  )
  const parties = partyLines(document.parties)
  if (parties.length > 0) lines.push('## Parties', '', ...parties, '')
  const clauses = Array.isArray(document.clauses) ? (document.clauses as Clause[]) : []
  for (const clause of clauses) {
    if (typeof clause.body !== 'string') continue
    const heading = [clause.clause_number, clause.title].filter(part => part !== undefined && part !== '').join('. ')
    lines.push(`## ${heading}`, '', clause.body, '')
  }
  return lines.join('\n')
}
