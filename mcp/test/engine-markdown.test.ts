import { describe, expect, test } from 'bun:test'
import { computeDocumentHash, generateCreditAgreement, renderAgreementMarkdown } from '../src/engine'

const credit = generateCreditAgreement({
  acreditante: '6iPkwDfhCceBMhfXuDJgz9ssWg8gCekcA1BLpqrrsowo',
  acreditado: 'tWGdTLxagRHUxkSsrGDMnLS5mBYGugaFZ1siD54sK5b',
  acreditanteName: 'Fondo de Fomento Municipal',
  acreditanteKind: 'public',
  acreditadoName: 'María López',
  principalCents: 2500000,
  principalInWords: 'veinticinco mil pesos 00/100 M.N.',
  interestRateAnnualPct: '0',
  moratoryRateAnnualPct: '24',
  disbursementDate: '2026-11-02',
  disbursementMethod: 'spei',
  installments: 12,
  periodicity: 'monthly',
  firstDueDate: '2026-12-02',
  maturityDate: '2027-11-02',
  purpose: 'Compra de horno',
  placeOfSigning: 'Playas de Rosarito, Baja California',
}) as Record<string, unknown>
const hash = computeDocumentHash(credit)
const markdown = renderAgreementMarkdown(credit, { hash })

describe('markdown view of a credit agreement (for any Markdown editor)', () => {
  test('renders under its Spanish title with numbered Spanish clauses', () => {
    expect(markdown.split('\n', 1)[0]).toBe('# Contrato de crédito')
    expect(markdown).toContain('## 1. Objeto')
    expect(markdown).toContain('Acreditante / Lender')
  })

  test('every clause becomes a numbered heading followed by its exact text', () => {
    for (const clause of credit.clauses as { clause_number: number; title: string; body: string }[]) {
      expect(markdown).toContain(`## ${clause.clause_number}. ${clause.title}`)
      expect(markdown).toContain(clause.body)
    }
  })

  test('the parties are listed with their role and wallet', () => {
    expect(markdown).toContain('`6iPkwDfhCceBMhfXuDJgz9ssWg8gCekcA1BLpqrrsowo`')
    expect(markdown).toContain('`tWGdTLxagRHUxkSsrGDMnLS5mBYGugaFZ1siD54sK5b`')
  })

  test('the view says it is not the signed object and names the hash of the document that is', () => {
    expect(markdown).toContain(hash)
    expect(markdown).toMatch(/not the signed document/i)
    expect(markdown).toMatch(/no es el documento firmado/i)
  })

  test('the same document always renders the same markdown; a document without clauses still renders its notice', () => {
    expect(renderAgreementMarkdown(credit, { hash })).toBe(markdown)
    const out = renderAgreementMarkdown({ document_type: 'credit_agreement', parties: { acreditante: { address: 'tWGdTLxagRHUxkSsrGDMnLS5mBYGugaFZ1siD54sK5b' } } }, { hash: 'h' })
    expect(out).toContain('tWGdTLxagRHUxkSsrGDMnLS5mBYGugaFZ1siD54sK5b')
    expect(out).toContain('`h`')
  })
})
