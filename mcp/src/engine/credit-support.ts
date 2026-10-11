/**
 * Template: credit-agreement 0.2, the support-program variant. A third party
 * (usually a public program) may issue an eligibility letter and pay part of
 * the ordinary interest to the acreditante; the borrower's obligation stays
 * whole. Without any support field a 0.2 draft has the clauses and findings of
 * 0.1. Version 0.1 is unchanged and still drafted on its own.
 */
import { CREDIT_AGREEMENT_TEMPLATE, formatMxn, generateCreditAgreement, isPublicLender, parseIsoDate, type CreditAgreementParams } from './credit-agreement'
import { checkCreditAgreementDraft } from './credit-check'
import type { AgreementTemplate } from './templates'
import type { Finding } from './types'

export const CREDIT_TEMPLATE_V02_VERSION = '0.2.0'

export const SUBSIDY_PAYMENT_TIMINGS = ['perInstallment', 'quarterly'] as const
export const SUBSIDY_LAPSE_RULES = ['borrowerPaysContractRate', 'rateStaysAtSubsidized', 'borrowerMayPrepay'] as const
export type SubsidyPaymentTiming = (typeof SUBSIDY_PAYMENT_TIMINGS)[number]
export type SubsidyLapseRule = (typeof SUBSIDY_LAPSE_RULES)[number]

export interface SupportProgram {
  name: string
  authority: string
  legalBasisRef?: string
  rulesUrl?: string
  rulesSha256?: string
  budgetYear?: number
  agreementRef?: string
}

export interface EligibilityLetter {
  folio: string
  issuedBy: string
  /** YYYY-MM-DD */
  issuedAt: string
  sha256: string
  /** YYYY-MM-DD */
  validUntil?: string
}

/** Part of the ordinary interest paid by the program to the acreditante. Rates and points are annual percentages (points = percentage points). */
export interface InterestSubsidy {
  payer: string
  subsidizedPoints?: string
  subsidizedRatePct?: string
  borrowerRatePct: string
  condition: 'punctualPayment'
  paymentTiming: SubsidyPaymentTiming
  paidTo: 'acreditante'
  capPerBorrowerCents?: number
  programCapCents?: number
  /** YYYY-MM-DD */
  endDate?: string
}

export interface CreditSupportParams {
  supportProgram?: SupportProgram
  eligibilityLetter?: EligibilityLetter
  interestSubsidy?: InterestSubsidy
  subsidyLapseRule?: SubsidyLapseRule
  /** Days of written notice before the subsidy stops. */
  noticeDays?: number
  supportDisclaimerAccepted?: boolean
}

export type CreditAgreementV02Params = CreditAgreementParams & CreditSupportParams

export const SUPPORT_FIELDS = ['supportProgram', 'eligibilityLetter', 'interestSubsidy', 'subsidyLapseRule', 'noticeDays', 'supportDisclaimerAccepted'] as const

export function hasSupport(params: object): boolean {
  const fields = params as CreditSupportParams
  return SUPPORT_FIELDS.some(field => fields[field] !== undefined)
}

export const NO_ALTERATION_CLAUSE =
  'El apoyo del programa no modifica, reduce, sustituye ni condiciona la obligación del acreditado de pagar íntegramente capital, intereses y accesorios conforme a este contrato. Ni el programa ni la autoridad que lo opera son parte acreditante, fiadora ni avalista, salvo pacto expreso por escrito con facultades.'

export const CREDIT_AGREEMENT_TEMPLATE_V02: AgreementTemplate = {
  ...CREDIT_AGREEMENT_TEMPLATE,
  version: CREDIT_TEMPLATE_V02_VERSION,
  title: 'Contrato de crédito con programa de apoyo (credit agreement with a support program, MX)',
  reviewScope: `${CREDIT_AGREEMENT_TEMPLATE.reviewScope} Version 0.2 adds an optional support program: eligibility letter, an interest subsidy paid by the program to the acreditante against CFDI and conditioned on punctual payment (never moratory interest, fees or principal), the rule when the subsidy stops, the clause that the support does not alter the borrower's obligation, and the absence of government backing. Pilot wording pending legal review by the firm.`,
  fields: [
    ...CREDIT_AGREEMENT_TEMPLATE.fields,
    { name: 'supportProgram', type: 'object', required: false, description: 'Support program: {name, authority, legalBasisRef?, rulesUrl?, rulesSha256?, budgetYear?, agreementRef?}.' },
    {
      name: 'eligibilityLetter',
      type: 'object',
      required: false,
      description: 'Eligibility letter: {folio, issuedBy, issuedAt (YYYY-MM-DD), sha256 (64 hex), validUntil?}. Only its hash enters the document.',
    },
    {
      name: 'interestSubsidy',
      type: 'object',
      required: false,
      description:
        "Interest subsidy: {payer, subsidizedPoints | subsidizedRatePct, borrowerRatePct, condition: 'punctualPayment', paymentTiming: 'perInstallment' | 'quarterly', paidTo: 'acreditante', capPerBorrowerCents?, programCapCents?, endDate?}. Annual percentages; points are percentage points.",
    },
    { name: 'subsidyLapseRule', type: 'enum', required: false, description: 'What happens when the subsidy stops.', options: SUBSIDY_LAPSE_RULES },
    { name: 'noticeDays', type: 'integer', required: false, description: 'Days of written notice before the subsidy stops (1 to 365).' },
    { name: 'supportDisclaimerAccepted', type: 'boolean', required: false, description: 'The acreditado acknowledges that the support does not alter their obligation.' },
  ],
}

// ============ Findings ============

const DECIMAL = /^\d+(\.\d+)?$/
const SHA256_HEX = /^[0-9a-f]{64}$/

/** The subsidized share of the contract rate, in annual percentage points; null when not given or not a number. */
function subsidizedPoints(subsidy: InterestSubsidy): number | null {
  const raw = subsidy.subsidizedPoints ?? subsidy.subsidizedRatePct
  return raw !== undefined && DECIMAL.test(raw.trim()) ? Number(raw) : null
}

/** 0.1 findings plus the support findings. Every message says whether it blocks or only asks for review. */
export function checkCreditAgreementV02Draft(params: CreditAgreementV02Params, options: { encrypted?: boolean } = {}): Finding[] {
  const findings = checkCreditAgreementDraft(params, options)
  if (!hasSupport(params)) return findings
  const add = (code: string, field: string, message: string) => {
    findings.push({ code, field, message })
  }
  const subsidy = params.interestSubsidy

  if (subsidy && !params.supportProgram) {
    add('SUBSIDY_WITHOUT_PROGRAM', 'supportProgram', 'Blocking: an interest subsidy needs the support program that pays it (supportProgram with name and authority).')
  }
  if (params.eligibilityLetter && !SHA256_HEX.test(params.eligibilityLetter.sha256 ?? '')) {
    add('ELIGIBILITY_LETTER_UNHASHED', 'eligibilityLetter', 'Blocking: the eligibility letter must carry the SHA-256 of its file (64 lowercase hex characters); only the hash enters the document.')
  }
  if (params.supportProgram?.rulesUrl && !SHA256_HEX.test(params.supportProgram.rulesSha256 ?? '')) {
    add('PROGRAM_RULES_UNHASHED', 'supportProgram', 'Review: the support program rules are linked without their SHA-256, so the version the parties agreed to cannot be proven. Does not block.')
  }

  if (subsidy) {
    const contract = DECIMAL.test(params.interestRateAnnualPct.trim()) ? Number(params.interestRateAnnualPct) : null
    const borrower = DECIMAL.test(subsidy.borrowerRatePct.trim()) ? Number(subsidy.borrowerRatePct) : null
    const points = subsidizedPoints(subsidy)
    const both = subsidy.subsidizedPoints !== undefined && subsidy.subsidizedRatePct !== undefined
    if (borrower === null || points === null || both) {
      add('INVALID_RATE', 'interestSubsidy', 'Blocking: the subsidy needs borrowerRatePct and exactly one of subsidizedPoints or subsidizedRatePct, as non-negative decimal percentages.')
    } else if (contract !== null) {
      if (borrower > contract || points > contract) {
        add(
          'SUBSIDY_COVERS_PRINCIPAL',
          'interestSubsidy',
          `Blocking: the subsidy may cover only part of the ordinary interest of ${contract} % a year; a borrower rate or a subsidized share above the contract rate would pay something other than ordinary interest (principal, fees or moratory interest).`,
        )
      } else if (Math.abs(borrower + points - contract) > 1e-9) {
        add('SUBSIDY_RATE_MISMATCH', 'interestSubsidy', `Blocking: the borrower rate (${borrower} %) plus the subsidized share (${points} points) must equal the contract rate (${contract} %).`)
      }
    }
    if (subsidy.endDate !== undefined) {
      const end = parseIsoDate(subsidy.endDate)
      const maturity = parseIsoDate(params.maturityDate)
      if (end === null) add('DATE_ORDER', 'interestSubsidy', 'Blocking: the subsidy endDate must be a real YYYY-MM-DD date.')
      else if (maturity !== null && end < maturity) {
        add(
          'SUBSIDY_END_BEFORE_MATURITY',
          'interestSubsidy',
          `Review: the subsidy ends on ${subsidy.endDate}, before the maturity date ${params.maturityDate}; from then on the lapse rule applies. Make sure the borrower understands it. Does not block.`,
        )
      }
    }
    if (!params.subsidyLapseRule || params.noticeDays === undefined) {
      add(
        'SUBSIDY_LAPSE_RULE_MISSING',
        'subsidyLapseRule',
        'Blocking: with an interest subsidy, say what happens if it stops (subsidyLapseRule) and how many days of notice the borrower gets (noticeDays).',
      )
    }
  }
  if (params.noticeDays !== undefined && (!Number.isSafeInteger(params.noticeDays) || params.noticeDays < 1 || params.noticeDays > 365)) {
    add('INVALID_NOTICE_DAYS', 'noticeDays', 'Blocking: noticeDays must be a whole number of days between 1 and 365.')
  }
  if (params.supportDisclaimerAccepted !== true) {
    add(
      'SUPPORT_DISCLAIMER_NOT_ACCEPTED',
      'supportDisclaimerAccepted',
      'Review: the acreditado has not acknowledged that the support does not alter their obligation (supportDisclaimerAccepted). Does not block.',
    )
  }
  if (isPublicLender(params.acreditanteKind)) {
    add(
      'SUPPORT_WITH_PUBLIC_LENDER',
      'acreditanteKind',
      'Review: the support clauses are written for a private lender supported by a public program; with a public lender the firm must confirm the wording. Does not block.',
    )
  }
  return findings
}

// ============ Clauses ============

function inline(value: string): string {
  return value.trim().replace(/[.\s]+$/, '')
}

function programClause(p: CreditAgreementV02Params): string {
  const program = p.supportProgram
  const letter = p.eligibilityLetter
  const sentences: string[] = []
  if (program) {
    const details = [
      program.legalBasisRef ? `con fundamento en ${inline(program.legalBasisRef)}` : '',
      program.budgetYear !== undefined ? `con recursos del ejercicio presupuestal ${program.budgetYear}` : '',
      program.agreementRef ? `conforme al convenio ${inline(program.agreementRef)}` : '',
    ].filter(Boolean)
    sentences.push(
      `El crédito se relaciona con el programa de apoyo "${inline(program.name)}", cuya autoridad operadora es ${inline(program.authority)}${details.length ? `, ${details.join(', ')}` : ''}.`,
    )
    if (program.rulesUrl) sentences.push(`Las reglas de operación del programa están publicadas en ${program.rulesUrl}${program.rulesSha256 ? ` (SHA-256 ${program.rulesSha256})` : ''}.`)
  }
  if (letter) {
    sentences.push(
      `El Acreditado presenta la carta de elegibilidad folio ${inline(letter.folio)}, emitida el ${letter.issuedAt} (emisor: ${inline(letter.issuedBy)})${
        letter.validUntil ? ` y vigente hasta el ${letter.validUntil}` : ''
      }; el expediente conserva el archivo, cuyo SHA-256 es ${letter.sha256}.`,
    )
  }
  sentences.push('La elegibilidad no obliga al Acreditante a otorgar el crédito ni crea un derecho del Acreditado a recibirlo; el Acreditante decide conforme a su propio análisis.')
  return sentences.join(' ')
}

function subsidyShare(s: InterestSubsidy): string {
  return s.subsidizedPoints !== undefined ? `${s.subsidizedPoints} puntos porcentuales anuales` : `${s.subsidizedRatePct} % anual`
}

function subsidyClause(p: CreditAgreementV02Params, s: InterestSubsidy): string {
  const timing = s.paymentTiming === 'quarterly' ? 'trimestralmente, por las parcialidades del trimestre' : 'por cada parcialidad'
  const caps = [
    s.capPerBorrowerCents !== undefined ? `un tope de ${formatMxn(s.capPerBorrowerCents)} por acreditado` : '',
    s.programCapCents !== undefined ? `un tope total del programa de ${formatMxn(s.programCapCents)}` : '',
  ].filter(Boolean)
  return [
    `${inline(s.payer)} (el "Programa") cubrirá ${subsidyShare(s)} de la tasa de interés ordinaria pactada de ${p.interestRateAnnualPct} % anual, de modo que la tasa a cargo del Acreditado es de ${
      s.borrowerRatePct
    } % anual.`,
    `El Programa paga el apoyo directamente al Acreditante, ${timing}, contra la emisión del comprobante fiscal digital por Internet (CFDI) correspondiente.`,
    'El apoyo está condicionado a que el Acreditado pague cada parcialidad a más tardar en su fecha de vencimiento; la parcialidad pagada con atraso causa la tasa ordinaria pactada completa.',
    'El apoyo nunca cubre intereses moratorios, comisiones ni capital.',
    ...(caps.length ? [`El apoyo tiene ${caps.join(' y ')}.`] : []),
    ...(s.endDate ? [`El apoyo concluye el ${s.endDate}.`] : []),
  ].join(' ')
}

function lapseClause(p: CreditAgreementV02Params, s: InterestSubsidy): string {
  const days = p.noticeDays ?? 0
  const rule = p.subsidyLapseRule ?? 'borrowerPaysContractRate'
  const contract = `${p.interestRateAnnualPct} % anual`
  const subsidized = `${s.borrowerRatePct} % anual`
  const consequence =
    rule === 'rateStaysAtSubsidized'
      ? `Desde que el apoyo deja de pagarse, la tasa a cargo del Acreditado se mantiene en ${subsidized} y el Acreditante absorbe la diferencia.`
      : rule === 'borrowerMayPrepay'
      ? `Durante el plazo del aviso la tasa a cargo del Acreditado se mantiene en ${subsidized} y el Acreditado puede liquidar el saldo insoluto sin penalización; vencido el plazo sin liquidar, paga la tasa ordinaria pactada de ${contract}.`
      : `Desde que el apoyo deja de pagarse, el Acreditado paga la tasa ordinaria pactada de ${contract}.`
  return [
    'Si el Programa deja de pagar el apoyo por falta de presupuesto, terminación del convenio, pérdida de la elegibilidad del Acreditado, conclusión del apoyo o cualquier otra causa,',
    `el Acreditante lo avisará por escrito al Acreditado con al menos ${days} días naturales de anticipación o, si no le es posible, tan pronto lo sepa.`,
    consequence,
    'En todo caso el Acreditado puede pagar anticipadamente, en todo o en parte, sin penalización.',
  ].join(' ')
}

function noBackingClause(p: CreditAgreementV02Params): string {
  return isPublicLender(p.acreditanteKind)
    ? 'El programa de apoyo no garantiza el crédito ni sus rendimientos, y su participación no implica respaldo de otra autoridad a este contrato.'
    : 'El Acreditante no es un organismo público ni actúa por cuenta de la autoridad que opera el programa. El programa no garantiza el crédito ni sus rendimientos, y su participación no implica respaldo gubernamental al Acreditante ni a este contrato.'
}

/** The support clauses, in order, for a draft that has support. */
export function supportClauses(p: CreditAgreementV02Params): { title: string; body: string }[] {
  const clauses: { title: string; body: string }[] = []
  if (p.supportProgram || p.eligibilityLetter) clauses.push({ title: 'Del programa de apoyo y la carta de elegibilidad', body: programClause(p) })
  if (p.interestSubsidy) {
    clauses.push({ title: 'Del apoyo a la tasa de interés', body: subsidyClause(p, p.interestSubsidy) })
    clauses.push({ title: 'De la suspensión o terminación del apoyo', body: lapseClause(p, p.interestSubsidy) })
  }
  clauses.push({ title: 'De la no alteración de la obligación del acreditado', body: NO_ALTERATION_CLAUSE })
  clauses.push({ title: 'De la ausencia de respaldo gubernamental', body: noBackingClause(p) })
  return clauses
}

// ============ Document ============

/** The clause before which the support clauses are placed (the record clause and what follows stay at the end). */
const SUPPORT_CLAUSES_BEFORE = 'Registro tecnológico y firma'

/** The 0.2 document: the 0.1 document with the 0.2 version, the support terms and the support clauses before the record clause. */
export function generateCreditAgreementV02(params: CreditAgreementV02Params): object {
  const base = generateCreditAgreement(params) as Record<string, unknown> & { template: Record<string, unknown>; clauses: { clause_number: number; title: string; body: string }[] }
  const clauses = base.clauses.map(({ title, body }) => ({ title, body }))
  if (hasSupport(params)) {
    const at = clauses.findIndex(clause => clause.title === SUPPORT_CLAUSES_BEFORE)
    clauses.splice(at < 0 ? clauses.length : at, 0, ...supportClauses(params))
  }
  const support = hasSupport(params)
    ? {
        support: {
          ...(params.supportProgram ? { program: params.supportProgram } : {}),
          ...(params.eligibilityLetter ? { eligibility_letter: params.eligibilityLetter } : {}),
          ...(params.interestSubsidy ? { interest_subsidy: params.interestSubsidy } : {}),
          ...(params.subsidyLapseRule ? { lapse_rule: params.subsidyLapseRule } : {}),
          ...(params.noticeDays !== undefined ? { notice_days: params.noticeDays } : {}),
          disclaimer_accepted: params.supportDisclaimerAccepted === true,
        },
      }
    : {}
  const { clauses: _clauses, annexes, record, notices, platform, ...head } = base
  return {
    ...head,
    version: CREDIT_TEMPLATE_V02_VERSION,
    template: { ...base.template, version: CREDIT_TEMPLATE_V02_VERSION },
    ...support,
    clauses: clauses.map((clause, index) => ({ clause_number: index + 1, ...clause })),
    annexes,
    record,
    notices,
    platform,
  }
}
