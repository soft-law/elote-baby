import { describe, expect, test } from 'bun:test'
import {
  amountInWordsEs,
  buildAmortization,
  buildCreditSignMessage,
  checkCreditAgreementDraft,
  computeDocumentHash,
  generateCreditAgreement,
  getTemplate,
  listTemplates,
  type CreditAgreementParams,
} from '../src/engine'

const LENDER = '6iPkwDfhCceBMhfXuDJgz9ssWg8gCekcA1BLpqrrsowo'
const BORROWER = 'tWGdTLxagRHUxkSsrGDMnLS5mBYGugaFZ1siD54sK5b'
const base: CreditAgreementParams = {
  chain: 'solana',
  acreditante: LENDER,
  acreditado: BORROWER,
  acreditanteName: 'Fondo de Fomento Municipal',
  acreditanteKind: 'public',
  acreditadoName: 'María López',
  acreditadoActivity: 'panadería',
  avalName: 'José López',
  principalCents: 2500000,
  principalInWords: 'veinticinco mil pesos 00/100 M.N.',
  interestRateAnnualPct: '0',
  punctualPaymentRatePct: '0',
  moratoryRateAnnualPct: '24',
  vatOnInterest: true,
  disbursementDate: '2026-11-02',
  disbursementMethod: 'spei',
  installments: 12,
  periodicity: 'monthly',
  firstDueDate: '2026-12-02',
  maturityDate: '2027-11-02',
  purpose: 'Compra de horno y mobiliario',
  eligibleUses: ['equipo', 'mobiliario'],
  placeOfSigning: 'Playas de Rosarito, Baja California',
  programName: 'Programa municipal de crédito a emprendedores',
  programRulesUrl: 'https://example.org/reglas.pdf',
  programRulesSha256: 'a'.repeat(64),
}

describe('credit-agreement@0.1', () => {
  test('is a credit-family template registered by the acreditante with no IP vocabulary', () => {
    const t = getTemplate('credit-agreement')!
    expect(t).toMatchObject({
      id: 'credit-agreement',
      version: '0.1.0',
      family: 'credit',
      roles: ['acreditante', 'acreditado'],
      anchor: { kind: 'registerCreditAgreement', executor: 'acreditante' },
      jurisdiction: ['MX'],
      chains: ['solana'],
      status: 'pilot',
    })
    expect(listTemplates({ family: 'credit' }).map(x => `${x.id}@${x.version}`)).toEqual(['credit-agreement@0.1.0', 'credit-agreement@0.2.0'])
    expect(JSON.stringify(t).toLowerCase()).not.toMatch(/mint|licen|ip asset|nft|token/)
  })
  test('spells amounts in Spanish and builds an equal-principal schedule that ends on the maturity date', () => {
    expect(amountInWordsEs(2500000)).toBe('veinticinco mil pesos 00/100 M.N.')
    expect(amountInWordsEs(1050)).toBe('diez pesos 50/100 M.N.')
    const rows = buildAmortization({ principalCents: 2500000, installments: 12, periodicity: 'monthly', firstDueDate: '2026-12-02' })
    expect(rows).toHaveLength(12)
    expect(rows[0]).toEqual({ number: 1, due_date: '2026-12-02', principal_cents: 208333 })
    expect(rows[11]!.due_date).toBe('2027-11-02')
    expect(rows.reduce((s, r) => s + r.principal_cents, 0)).toBe(2500000)
  })
  test('a clean draft has no findings; the document is Spanish-authoritative with an English summary and the notices', () => {
    expect(checkCreditAgreementDraft(base)).toEqual([])
    const doc = generateCreditAgreement(base) as Record<string, any>
    expect(doc.document_type).toBe('credit_agreement')
    expect(doc.title).toBe('Contrato de crédito')
    expect(doc.language).toEqual({ authoritative: 'es', courtesy: 'en' })
    expect(doc.clauses[0]).toMatchObject({ clause_number: 1, title: 'Objeto' })
    expect(doc.clauses.map((c: any) => c.title)).toContain('Transparencia y padrón')
    expect(doc.record.kind).toBe('registerCreditAgreement')
    expect(doc.notices.es).toMatch(/no sustituye la firma/)
    expect(JSON.stringify(doc).toLowerCase()).not.toMatch(/mint|licencia|license|nft|token|facility/)
    expect(computeDocumentHash(doc)).toMatch(/^0x[0-9a-f]{64}$/)
  })
  test('flags words/digits mismatch, date order, schedule overrun, penalty above principal and arbitration with a public lender', () => {
    const codes = (p: Partial<CreditAgreementParams>) =>
      checkCreditAgreementDraft({ ...base, ...p })
        .map(f => f.code)
        .sort()
    expect(codes({ principalInWords: 'veinte mil pesos 00/100 M.N.' })).toEqual(['AMOUNT_WORDS_MISMATCH'])
    expect(codes({ disbursementDate: '2026-12-15' })).toEqual(['DATE_ORDER'])
    expect(codes({ maturityDate: '2027-06-02' })).toEqual(['SCHEDULE_OVERRUNS_MATURITY'])
    expect(codes({ penaltyCents: 3000000 })).toEqual(['PENALTY_EXCEEDS_PRINCIPAL'])
    expect(codes({ disputeResolution: 'arbitration' })).toEqual(['ARBITRATION_WITH_PUBLIC_LENDER'])
    expect(codes({ acreditado: LENDER })).toEqual(['SAME_PARTY'])
    expect(codes({ acreditado: 'O0Il' + 'x'.repeat(40) })).toEqual(['INVALID_ADDRESS'])
    expect(codes({ acreditado: '11111111111111111111111111111111' })).toEqual(['INVALID_ADDRESS'])
    expect(codes({ interestRateAnnualPct: '48' })).toEqual(['HIGH_RATE_REVIEW'])
  })
  test('the sign message names both parties, the principal and the hash, in Spanish and English', () => {
    const m = buildCreditSignMessage({ acreditante: LENDER, acreditado: BORROWER, principal: '$25,000.00 MXN', hash: computeDocumentHash({}), method: 'Solana off-chain message (Ed25519)' })
    expect(m).toMatch(/^Soft\.Law Contrato de crédito\n/)
    expect(m).toMatch(/Firmo el registro de este documento en el expediente/)
    expect(m).toMatch(/does not replace the signature of the original instrument/)
  })
})

describe('credit-agreement@0.1 edge cases', () => {
  test('spells round and apocopated amounts and two-digit cents', () => {
    const pesos: [number, string][] = [
      [100, 'cien pesos'],
      [101, 'ciento un pesos'],
      [500, 'quinientos pesos'],
      [1000, 'mil pesos'],
      [21000, 'veintiún mil pesos'],
      [1000000, 'un millón de pesos'],
      [2000000, 'dos millones de pesos'],
      [101000, 'ciento un mil pesos'],
    ]
    for (const [amount, words] of pesos) expect(amountInWordsEs(amount * 100)).toBe(`${words} 00/100 M.N.`)
    expect(amountInWordsEs(5)).toBe('cero pesos 05/100 M.N.')
  })
  test('a monthly schedule from the 31st clamps to the end of shorter months without drifting', () => {
    const rows = buildAmortization({ principalCents: 300, installments: 3, periodicity: 'monthly', firstDueDate: '2026-01-31' })
    expect(rows.map(r => r.due_date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
  test('DATE_ORDER names the first date that fails', () => {
    const fields = (p: Partial<CreditAgreementParams>) =>
      checkCreditAgreementDraft({ ...base, ...p })
        .filter(f => f.code === 'DATE_ORDER')
        .map(f => f.field)
    expect(fields({ disbursementDate: '2026-02-30' })).toEqual(['disbursementDate'])
    expect(fields({ firstDueDate: 'soon' })).toEqual(['firstDueDate'])
    expect(fields({ disbursementDate: '2026-12-15' })).toEqual(['disbursementDate'])
    expect(fields({ maturityDate: '2026-11-30' })).toEqual(['maturityDate'])
  })
  test('accepts "un mil" for one thousand and reports a plaintext file for review only', () => {
    expect(checkCreditAgreementDraft({ ...base, principalCents: 100000, principalInWords: 'un mil pesos 00/100 M.N.', installments: 1, maturityDate: '2026-12-02' })).toEqual([])
    const plain = checkCreditAgreementDraft(base, { encrypted: false })
    expect(plain.map(f => f.code)).toEqual(['PLAINTEXT_PERSONAL_DATA'])
    expect(plain[0]!.message).toMatch(/^Review:/)
    expect(checkCreditAgreementDraft(base, { encrypted: true })).toEqual([])
  })
  test('the promissory note sentence is always in Disposición; the aval clause only with an aval; Quejas only for a public lender', () => {
    const titles = (p: Partial<CreditAgreementParams>) => (generateCreditAgreement({ ...base, ...p }) as Record<string, any>).clauses as { title: string; body: string }[]
    const noAval = titles({ avalName: undefined, acreditanteKind: 'private' })
    expect(noAval.find(c => c.title === 'Disposición')!.body).toMatch(/El pagaré que documenta este crédito se firma en forma autógrafa/)
    expect(noAval.map(c => c.title)).not.toContain('Garantías y aval')
    expect(noAval.map(c => c.title)).not.toContain('Quejas')
    const withAval = titles({})
    expect(withAval.map(c => c.title)).toContain('Garantías y aval')
    expect(withAval.find(c => c.title === 'Quejas')!.body).toMatch(/órgano interno de control/)
  })
})

describe('credit-agreement@0.1 on Solana only', () => {
  test('any chain other than solana is a blocking finding, and the record names Solana devnet', () => {
    expect(checkCreditAgreementDraft({ ...base, chain: 'other' as unknown as 'solana' }).map(f => f.code)).toEqual(['UNSUPPORTED_CHAIN'])
    const doc = generateCreditAgreement(base) as Record<string, any>
    expect(doc.record.network).toBe('Solana devnet')
    expect(listTemplates().map(t => `${t.id}@${t.version}`)).toEqual(['credit-agreement@0.1.0', 'credit-agreement@0.2.0'])
    expect(listTemplates().every(t => t.chains.join() === 'solana')).toBe(true)
  })
})
