import { describe, expect, test } from 'bun:test'
import {
  NO_ALTERATION_CLAUSE,
  checkCreditAgreementDraft,
  checkCreditAgreementV02Draft,
  computeDocumentHash,
  generateCreditAgreement,
  generateCreditAgreementV02,
  getTemplate,
  hasSupport,
  type CreditAgreementParams,
  type CreditAgreementV02Params,
} from '../src/engine'

const LENDER = '6iPkwDfhCceBMhfXuDJgz9ssWg8gCekcA1BLpqrrsowo'
const BORROWER = 'tWGdTLxagRHUxkSsrGDMnLS5mBYGugaFZ1siD54sK5b'

/** A private lender (the case the support clauses are written for), 18 % a year, 12 monthly installments. */
const base: CreditAgreementParams = {
  chain: 'solana',
  acreditante: LENDER,
  acreditado: BORROWER,
  acreditanteName: 'Financiera Ejemplo, S.A. de C.V.',
  acreditanteKind: 'private',
  acreditadoName: 'Ana Pérez',
  principalCents: 5000000,
  principalInWords: 'cincuenta mil pesos 00/100 M.N.',
  interestRateAnnualPct: '18',
  moratoryRateAnnualPct: '36',
  disbursementDate: '2026-11-02',
  disbursementMethod: 'spei',
  installments: 12,
  periodicity: 'monthly',
  firstDueDate: '2026-12-02',
  maturityDate: '2027-11-02',
  purpose: 'Capital de trabajo',
  placeOfSigning: 'Ciudad Ejemplo, Estado Ejemplo',
}

const support: CreditAgreementV02Params = {
  ...base,
  supportProgram: {
    name: 'Programa Ejemplo de Apoyo a la PyME',
    authority: 'Ayuntamiento de Ciudad Ejemplo',
    legalBasisRef: 'Reglas de operación 2026',
    budgetYear: 2026,
    agreementRef: 'CONV-001/2026',
  },
  eligibilityLetter: { folio: 'ELIG-0042', issuedBy: 'Dirección de Desarrollo Económico', issuedAt: '2026-10-20', sha256: 'c'.repeat(64), validUntil: '2026-12-31' },
  interestSubsidy: {
    payer: 'Ayuntamiento de Ciudad Ejemplo',
    subsidizedPoints: '10',
    borrowerRatePct: '8',
    condition: 'punctualPayment',
    paymentTiming: 'perInstallment',
    paidTo: 'acreditante',
    capPerBorrowerCents: 500000,
  },
  subsidyLapseRule: 'borrowerPaysContractRate',
  noticeDays: 30,
  supportDisclaimerAccepted: true,
}

type Doc = Record<string, any> & { clauses: { clause_number: number; title: string; body: string }[] }
const titles = (doc: Doc) => doc.clauses.map(clause => clause.title)
const codes = (p: Partial<CreditAgreementV02Params>) =>
  checkCreditAgreementV02Draft({ ...support, ...p })
    .map(f => f.code)
    .sort()

describe('credit-agreement@0.2 template', () => {
  test('is the same credit template at 0.2.0, with the support fields added and 0.1 unchanged', () => {
    const v01 = getTemplate('credit-agreement', '0.1.0')!
    const v02 = getTemplate('credit-agreement', '0.2.0')!
    expect(getTemplate('credit-agreement')!.version).toBe('0.1.0')
    expect(v02).toMatchObject({
      id: 'credit-agreement',
      family: 'credit',
      roles: ['acreditante', 'acreditado'],
      anchor: { kind: 'registerCreditAgreement', executor: 'acreditante' },
      chains: ['solana'],
      status: 'pilot',
    })
    expect(v02.fields.map(f => f.name)).toEqual([
      ...v01.fields.map(f => f.name),
      'supportProgram',
      'eligibilityLetter',
      'interestSubsidy',
      'subsidyLapseRule',
      'noticeDays',
      'supportDisclaimerAccepted',
    ])
    expect(JSON.stringify(v02).toLowerCase()).not.toMatch(/mint|licen|nft|token|dividend|stablecoin|backed|guarantee/)
  })
})

describe('credit-agreement@0.2 without support behaves like 0.1', () => {
  test('same clauses and findings; only the version differs', () => {
    expect(hasSupport(base)).toBe(false)
    const v01 = generateCreditAgreement(base) as Doc
    const v02 = generateCreditAgreementV02(base) as Doc
    expect(v02.version).toBe('0.2.0')
    expect(v02.template.version).toBe('0.2.0')
    expect(v02.clauses).toEqual(v01.clauses)
    expect(v02.support).toBeUndefined()
    expect(checkCreditAgreementV02Draft(base)).toEqual(checkCreditAgreementDraft(base))
    const { version: _a, template: _b, generated_at: _c, generated_at_iso: _d, ...rest01 } = v01
    const { version: _e, template: _f, generated_at: _g, generated_at_iso: _h, ...rest02 } = v02
    expect(rest02).toEqual(rest01)
  })
})

describe('credit-agreement@0.2 with support', () => {
  test('a clean support draft has no findings', () => {
    expect(checkCreditAgreementV02Draft(support)).toEqual([])
  })

  test('adds the five support clauses before the record clause, in order, and records the support terms', () => {
    const doc = generateCreditAgreementV02(support) as Doc
    const list = titles(doc)
    const at = list.indexOf('Del programa de apoyo y la carta de elegibilidad')
    expect(list.slice(at, at + 6)).toEqual([
      'Del programa de apoyo y la carta de elegibilidad',
      'Del apoyo a la tasa de interés',
      'De la suspensión o terminación del apoyo',
      'De la no alteración de la obligación del acreditado',
      'De la ausencia de respaldo gubernamental',
      'Registro tecnológico y firma',
    ])
    expect(doc.clauses.map(c => c.clause_number)).toEqual(list.map((_, i) => i + 1))
    expect(doc.support).toMatchObject({
      program: support.supportProgram,
      eligibility_letter: support.eligibilityLetter,
      interest_subsidy: support.interestSubsidy,
      lapse_rule: 'borrowerPaysContractRate',
      notice_days: 30,
      disclaimer_accepted: true,
    })
    expect(computeDocumentHash(doc)).toMatch(/^0x[0-9a-f]{64}$/)
  })

  test('the clauses say what the owner asked for, and the no-alteration clause is exact', () => {
    const doc = generateCreditAgreementV02(support) as Doc
    const body = (title: string) => doc.clauses.find(c => c.title === title)!.body
    expect(body('De la no alteración de la obligación del acreditado')).toBe(NO_ALTERATION_CLAUSE)
    expect(NO_ALTERATION_CLAUSE).toBe(
      'El apoyo del programa no modifica, reduce, sustituye ni condiciona la obligación del acreditado de pagar íntegramente capital, intereses y accesorios conforme a este contrato. Ni el programa ni la autoridad que lo opera son parte acreditante, fiadora ni avalista, salvo pacto expreso por escrito con facultades.',
    )
    const subsidy = body('Del apoyo a la tasa de interés')
    expect(subsidy).toContain('nunca cubre intereses moratorios, comisiones ni capital')
    expect(subsidy).toContain('a más tardar en su fecha de vencimiento')
    expect(subsidy).toContain('directamente al Acreditante')
    expect(subsidy).toContain('CFDI')
    expect(subsidy).toContain('10 puntos porcentuales')
    expect(subsidy).toContain('8 % anual')
    expect(subsidy).toContain('$5,000.00 MXN por acreditado')
    const program = body('Del programa de apoyo y la carta de elegibilidad')
    expect(program).toContain('folio ELIG-0042')
    expect(program).toContain('c'.repeat(64))
    expect(program).toContain('no obliga al Acreditante a otorgar el crédito')
    expect(body('De la suspensión o terminación del apoyo')).toContain('30 días naturales')
    expect(body('De la suspensión o terminación del apoyo')).toContain('sin penalización')
    const backing = body('De la ausencia de respaldo gubernamental')
    expect(backing).toContain('no es un organismo público')
    expect(backing).toContain('no garantiza el crédito ni sus rendimientos')
  })

  test('each lapse rule has its own consequence', () => {
    const lapse = (rule: CreditAgreementV02Params['subsidyLapseRule']) =>
      (generateCreditAgreementV02({ ...support, subsidyLapseRule: rule }) as Doc).clauses.find(c => c.title === 'De la suspensión o terminación del apoyo')!.body
    expect(lapse('borrowerPaysContractRate')).toContain('paga la tasa ordinaria pactada de 18 % anual')
    expect(lapse('rateStaysAtSubsidized')).toContain('el Acreditante absorbe la diferencia')
    expect(lapse('borrowerMayPrepay')).toContain('puede liquidar el saldo insoluto sin penalización')
  })

  test('only the clauses that apply: an eligibility letter alone has no subsidy clauses', () => {
    const doc = generateCreditAgreementV02({ ...base, eligibilityLetter: support.eligibilityLetter, supportDisclaimerAccepted: true }) as Doc
    expect(titles(doc)).toContain('Del programa de apoyo y la carta de elegibilidad')
    expect(titles(doc)).not.toContain('Del apoyo a la tasa de interés')
    expect(titles(doc)).toContain('De la no alteración de la obligación del acreditado')
  })
})

describe('credit-agreement@0.2 findings', () => {
  test('SUBSIDY_WITHOUT_PROGRAM blocks a subsidy with no program', () => {
    expect(codes({ supportProgram: undefined })).toEqual(['SUBSIDY_WITHOUT_PROGRAM'])
  })

  test('ELIGIBILITY_LETTER_UNHASHED blocks a letter without a valid SHA-256', () => {
    expect(codes({ eligibilityLetter: { ...support.eligibilityLetter!, sha256: 'not-a-hash' } })).toEqual(['ELIGIBILITY_LETTER_UNHASHED'])
    expect(codes({ eligibilityLetter: { ...support.eligibilityLetter!, sha256: 'C'.repeat(64) } })).toEqual(['ELIGIBILITY_LETTER_UNHASHED'])
  })

  test('SUBSIDY_COVERS_PRINCIPAL when the borrower rate or the subsidized share exceeds the contract rate', () => {
    expect(codes({ interestSubsidy: { ...support.interestSubsidy!, borrowerRatePct: '20', subsidizedPoints: '0' } })).toEqual(['SUBSIDY_COVERS_PRINCIPAL'])
    expect(codes({ interestSubsidy: { ...support.interestSubsidy!, borrowerRatePct: '0', subsidizedPoints: '25' } })).toEqual(['SUBSIDY_COVERS_PRINCIPAL'])
  })

  test('the borrower rate plus the subsidized share must equal the contract rate', () => {
    expect(codes({ interestSubsidy: { ...support.interestSubsidy!, borrowerRatePct: '5' } })).toEqual(['SUBSIDY_RATE_MISMATCH'])
    expect(codes({ interestSubsidy: { ...support.interestSubsidy!, subsidizedPoints: undefined, subsidizedRatePct: '10' } })).toEqual([])
    expect(codes({ interestSubsidy: { ...support.interestSubsidy!, subsidizedRatePct: '10' } })).toEqual(['INVALID_RATE'])
  })

  test('SUBSIDY_END_BEFORE_MATURITY is a review finding, not a block', () => {
    const findings = checkCreditAgreementV02Draft({ ...support, interestSubsidy: { ...support.interestSubsidy!, endDate: '2027-06-30' } })
    expect(findings.map(f => f.code)).toEqual(['SUBSIDY_END_BEFORE_MATURITY'])
    expect(findings[0]!.message).toMatch(/^Review:/)
    expect(codes({ interestSubsidy: { ...support.interestSubsidy!, endDate: '2027-11-02' } })).toEqual([])
  })

  test('a subsidy needs its lapse rule and notice; the disclaimer and a public lender are review findings', () => {
    expect(codes({ subsidyLapseRule: undefined })).toEqual(['SUBSIDY_LAPSE_RULE_MISSING'])
    expect(codes({ noticeDays: undefined })).toEqual(['SUBSIDY_LAPSE_RULE_MISSING'])
    expect(codes({ noticeDays: 0 })).toEqual(['INVALID_NOTICE_DAYS'])
    expect(codes({ supportDisclaimerAccepted: false })).toEqual(['SUPPORT_DISCLAIMER_NOT_ACCEPTED'])
    expect(codes({ acreditanteKind: 'public' })).toEqual(['SUPPORT_WITH_PUBLIC_LENDER'])
    const publicDoc = generateCreditAgreementV02({ ...support, acreditanteKind: 'public' }) as Doc
    expect(publicDoc.clauses.find(c => c.title === 'De la ausencia de respaldo gubernamental')!.body).not.toContain('no es un organismo público')
  })
})
