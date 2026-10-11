/**
 * Template: contrato de crédito simple (apertura de crédito, LGTOC 291-301)
 * for an entrepreneur support program in Mexico. Spanish is the governing
 * text; the English description and notices are a courtesy summary. Money
 * moves in pesos outside the chain; the acreditante registers the signed
 * agreement (`registerCreditAgreement`: opening the credit line in the pool
 * program with the agreement hash) as a record of integrity, time and signer only.
 */
import type { AgreementTemplate } from './templates'
import { SOLANA_SIGNATURE_METHOD, type ChainId } from './types'

export const CREDIT_PERIODICITIES = ['monthly', 'biweekly', 'weekly'] as const
export const DISBURSEMENT_METHODS = ['spei', 'transfer', 'cheque'] as const
export const LENDER_KINDS = ['public', 'trust', 'private'] as const
export const DISPUTE_RESOLUTIONS = ['courts', 'arbitration'] as const
export type CreditPeriodicity = (typeof CREDIT_PERIODICITIES)[number]
export type DisbursementMethod = (typeof DISBURSEMENT_METHODS)[number]
export type LenderKind = (typeof LENDER_KINDS)[number]
export type DisputeResolution = (typeof DISPUTE_RESOLUTIONS)[number]

export const CREDIT_TEMPLATE_VERSION = '0.1.0'

export interface CreditAgreementParams {
  /** Default 'solana'; version 0.1 records on Solana devnet only. */
  chain?: ChainId
  /** Lender wallet; signs and registers the agreement. */
  acreditante: string
  /** Borrower wallet. */
  acreditado: string
  acreditanteName: string
  acreditanteKind: LenderKind
  acreditanteRepresentative?: string
  acreditadoName: string
  acreditadoActivity?: string
  avalName?: string
  /** Integer amount in Mexican peso cents. */
  principalCents: number
  principalInWords: string
  interestRateAnnualPct: string
  punctualPaymentRatePct?: string
  moratoryRateAnnualPct: string
  originationFeePct?: string
  vatOnInterest?: boolean
  penaltyCents?: number
  /** YYYY-MM-DD */
  disbursementDate: string
  disbursementMethod: DisbursementMethod
  installments: number
  periodicity: CreditPeriodicity
  firstDueDate: string
  maturityDate: string
  purpose: string
  eligibleUses?: string[]
  placeOfSigning: string
  placeOfPayment?: string
  /** Default 'courts'. */
  disputeResolution?: DisputeResolution
  courtsSeat?: string
  programName?: string
  programRulesUrl?: string
  programRulesSha256?: string
  programFolio?: string
  /** Each entry "name:sha256hex". */
  annexes?: string[]
  /** "firm/version/sha256" of the template prose. */
  templateSource?: string
  customTerms?: string
}

export const CREDIT_AGREEMENT_TEMPLATE: AgreementTemplate = {
  id: 'credit-agreement',
  version: CREDIT_TEMPLATE_VERSION,
  title: 'Contrato de crédito (credit agreement, MX)',
  family: 'credit',
  roles: ['acreditante', 'acreditado'],
  anchor: { kind: 'registerCreditAgreement', executor: 'acreditante' },
  jurisdiction: ['MX'],
  author: 'Soft.Law',
  reviewScope:
    'Contrato de crédito simple (apertura de crédito, LGTOC 291-301) for an entrepreneur support program in Mexico: single disbursement in pesos outside the chain, equal-principal amortization schedule, ordinary and moratory interest, acceleration and rescission, transparency, data protection and the LGDS 28 notice for a public lender, courts by default. Spanish is the governing text. The wallet signature records the document in the credit file and does not replace the signature of the original instrument. Pilot wording pending legal review by the firm.',
  chains: ['solana'],
  status: 'pilot',
  fields: [
    { name: 'acreditante', type: 'address', required: true, description: 'Lender wallet on Solana; signs and registers the signed agreement.' },
    { name: 'acreditado', type: 'address', required: true, description: 'Borrower wallet on Solana; signs the agreement.' },
    { name: 'acreditanteName', type: 'string', required: true, description: 'Legal name of the lender (program, trust or company).' },
    {
      name: 'acreditanteKind',
      type: 'enum',
      required: true,
      description: 'Public authority, public trust or private lender; sets the transparency and data protection clauses.',
      options: LENDER_KINDS,
    },
    { name: 'acreditanteRepresentative', type: 'string', required: false, description: 'Person who signs for the lender.' },
    { name: 'acreditadoName', type: 'string', required: true, description: 'Name of the borrower as published in the beneficiary list.' },
    { name: 'acreditadoActivity', type: 'string', required: false, description: 'Business activity of the borrower.' },
    { name: 'avalName', type: 'string', required: false, description: 'Name of the aval who also signs the promissory note by hand.' },
    { name: 'principalCents', type: 'integer', required: true, description: 'Principal in Mexican peso cents (integer above zero).' },
    { name: 'principalInWords', type: 'string', required: true, description: 'Principal in Spanish words, e.g. "veinticinco mil pesos 00/100 M.N."; checked against the digits.' },
    { name: 'interestRateAnnualPct', type: 'string', required: true, description: 'Ordinary annual interest rate in percent; "0" allowed.' },
    { name: 'punctualPaymentRatePct', type: 'string', required: false, description: 'Annual rate that applies when every installment is paid on time.' },
    { name: 'moratoryRateAnnualPct', type: 'string', required: true, description: 'Annual default interest rate in percent on overdue amounts.' },
    { name: 'originationFeePct', type: 'string', required: false, description: 'Origination fee in percent of the principal.' },
    { name: 'vatOnInterest', type: 'boolean', required: false, description: 'Value added tax is added to interest.' },
    { name: 'penaltyCents', type: 'integer', required: false, description: 'Contractual penalty in cents; may not exceed the principal (CCF 1843).' },
    { name: 'disbursementDate', type: 'string', required: true, description: 'Date the money is delivered in pesos, YYYY-MM-DD.' },
    { name: 'disbursementMethod', type: 'enum', required: true, description: 'How the money is delivered outside the chain.', options: DISBURSEMENT_METHODS },
    { name: 'installments', type: 'integer', required: true, description: 'Number of equal principal installments (1 to 120).' },
    { name: 'periodicity', type: 'enum', required: true, description: 'Installment periodicity.', options: CREDIT_PERIODICITIES },
    { name: 'firstDueDate', type: 'string', required: true, description: 'First installment due date, YYYY-MM-DD.' },
    { name: 'maturityDate', type: 'string', required: true, description: 'Final maturity date, YYYY-MM-DD; the last installment may not fall after it.' },
    { name: 'purpose', type: 'string', required: true, description: 'What the money is for.' },
    { name: 'eligibleUses', type: 'string[]', required: false, description: 'Eligible spending concepts under the program rules.' },
    { name: 'placeOfSigning', type: 'string', required: true, description: 'City and state where the agreement is signed.' },
    { name: 'placeOfPayment', type: 'string', required: false, description: 'Where or how installments are paid.' },
    { name: 'disputeResolution', type: 'enum', required: false, description: 'Courts by default; arbitration only after the firm reviews it.', options: DISPUTE_RESOLUTIONS },
    { name: 'courtsSeat', type: 'string', required: false, description: 'Seat of the courts or of the arbitration; defaults to the place of signing.' },
    { name: 'programName', type: 'string', required: false, description: 'Name of the support program.' },
    { name: 'programRulesUrl', type: 'string', required: false, description: 'URL of the program operating rules.' },
    { name: 'programRulesSha256', type: 'string', required: false, description: 'SHA-256 of the program rules file (64 hex characters).' },
    { name: 'programFolio', type: 'string', required: false, description: 'Program folio of the application.' },
    { name: 'annexes', type: 'string[]', required: false, description: 'Annexes as "name:sha256hex"; only hashes enter the document.' },
    { name: 'templateSource', type: 'string', required: false, description: 'Source of the template prose as "firm/version/sha256".' },
    { name: 'customTerms', type: 'string', required: false, description: 'Additional terms appended as a clause, in Spanish.' },
    { name: 'chain', type: 'enum', required: false, description: 'Chain the signed agreement is registered on.', options: ['solana'] },
  ],
}

// ============ Amounts ============

const UNITS = [
  'cero',
  'un',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiún',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
]
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

/** 1..999 in words, apocopated ("un", "veintiún") because a noun always follows (mil, millones, pesos). */
function below1000(n: number): string {
  if (n === 100) return 'cien'
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const parts: string[] = []
  if (hundreds > 0) parts.push(HUNDREDS[hundreds] ?? '')
  if (rest > 0 && rest < 30) parts.push(UNITS[rest] ?? '')
  else if (rest >= 30) parts.push(rest % 10 === 0 ? TENS[rest / 10] ?? '' : `${TENS[Math.floor(rest / 10)] ?? ''} y ${UNITS[rest % 10] ?? ''}`)
  return parts.join(' ')
}

export const MAX_PESOS = 999_999_999

/** Pesos and cents in the form used on Mexican contracts and notes: 2500000 → "veinticinco mil pesos 00/100 M.N.". Covers 0 to 999,999,999 pesos. */
export function amountInWordsEs(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || Math.floor(cents / 100) > MAX_PESOS) throw new RangeError(`amount out of range: ${cents}`)
  const pesos = Math.floor(cents / 100)
  const fraction = String(cents % 100).padStart(2, '0')
  if (pesos === 0) return `cero pesos ${fraction}/100 M.N.`
  if (pesos === 1) return `un peso ${fraction}/100 M.N.`
  const millions = Math.floor(pesos / 1_000_000)
  const thousands = Math.floor(pesos / 1000) % 1000
  const rest = pesos % 1000
  const parts: string[] = []
  if (millions > 0) parts.push(millions === 1 ? 'un millón' : `${below1000(millions)} millones`)
  if (thousands > 0) parts.push(thousands === 1 ? 'mil' : `${below1000(thousands)} mil`)
  if (rest > 0) parts.push(below1000(rest))
  const noun = thousands === 0 && rest === 0 ? 'de pesos' : 'pesos'
  return `${parts.join(' ')} ${noun} ${fraction}/100 M.N.`
}

/** 2500000 → "$25,000.00 MXN" */
export function formatMxn(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(Math.trunc(cents))
  const pesos = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}$${pesos}.${String(abs % 100).padStart(2, '0')} MXN`
}

// ============ Dates and schedule ============

/** A real calendar date in YYYY-MM-DD, as UTC milliseconds; null otherwise. */
export function parseIsoDate(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? time : null
}

function isoOf(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** Due date of installment `index` (0-based), always counted from the first due date so month-end days do not drift. */
function dueDate(first: number, index: number, periodicity: CreditPeriodicity): string {
  const DAY = 86_400_000
  if (periodicity === 'weekly') return isoOf(first + index * 7 * DAY)
  if (periodicity === 'biweekly') return isoOf(first + index * 14 * DAY)
  const start = new Date(first)
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth() + index
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return isoOf(Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)))
}

/** Equal principal installments with the remainder in the last one. Empty when the inputs cannot produce a schedule. */
export function buildAmortization(p: Pick<CreditAgreementParams, 'principalCents' | 'installments' | 'periodicity' | 'firstDueDate'>): { number: number; due_date: string; principal_cents: number }[] {
  const first = parseIsoDate(p.firstDueDate)
  if (first === null || !Number.isSafeInteger(p.installments) || p.installments < 1 || !Number.isSafeInteger(p.principalCents) || p.principalCents < 0) return []
  if (!(CREDIT_PERIODICITIES as readonly string[]).includes(p.periodicity)) return []
  const part = Math.floor(p.principalCents / p.installments)
  const last = p.principalCents - part * (p.installments - 1)
  return Array.from({ length: p.installments }, (_, index) => ({
    number: index + 1,
    due_date: dueDate(first, index, p.periodicity),
    principal_cents: index === p.installments - 1 ? last : part,
  }))
}

// ============ Document ============

export function isPublicLender(kind: LenderKind): boolean {
  return kind !== 'private'
}

export function parseAnnex(entry: string): { name: string; sha256: string } {
  const at = entry.lastIndexOf(':')
  return at < 0 ? { name: entry, sha256: '' } : { name: entry.slice(0, at), sha256: entry.slice(at + 1) }
}

const PERIODICITY_ES: Record<CreditPeriodicity, string> = { monthly: 'mensuales', biweekly: 'catorcenales', weekly: 'semanales' }

const REGISTRY_CLAUSE =
  'Las partes firman el registro de este contrato con sus wallets. Esa firma acredita la integridad del documento, la fecha del registro y la clave que firmó; no sustituye la firma autógrafa o electrónica avanzada del contrato ni del pagaré, que se conservan en custodia del acreditante y se devuelven al liquidar. El registro en la red de prueba no representa dinero ni derechos de cobro.'

export const CREDIT_NOTICES = {
  es: 'La firma con wallet registra este documento en el expediente y no sustituye la firma autógrafa o electrónica avanzada del instrumento original. El dinero se entrega y se paga en pesos fuera de la cadena. El registro en Solana devnet no tiene valor económico ni es transferible.',
  en: 'The wallet signature records this document in the credit file and does not replace the handwritten or advanced electronic signature of the original instrument. Money is disbursed and repaid in pesos outside the chain. The Solana devnet record has no economic value and is not transferable.',
} as const

function disbursementText(p: CreditAgreementParams): string {
  if (p.disbursementMethod === 'cheque') return `mediante cheque nominativo a favor del Acreditado`
  const rail = p.disbursementMethod === 'spei' ? 'transferencia electrónica por el Sistema de Pagos Electrónicos Interbancarios (SPEI)' : 'transferencia bancaria'
  return `mediante ${rail} a la cuenta que el Acreditado designe por escrito, cuyos datos se conservan fuera de este documento`
}

/** Free text placed mid-sentence: trimmed, without a trailing period (the clause adds its own). */
function inline(value: string): string {
  return value.trim().replace(/[.\s]+$/, '')
}

function creditClauses(p: CreditAgreementParams): { title: string; body: string }[] {
  const principal = `${formatMxn(p.principalCents)} (${p.principalInWords.trim()})`
  const vat = p.vatOnInterest ? ', más el impuesto al valor agregado' : ''
  const publicLender = isPublicLender(p.acreditanteKind)
  const place = inline(p.placeOfSigning)
  const seat = p.courtsSeat?.trim() || p.placeOfSigning.trim()
  const clauses: { title: string; body: string }[] = []

  clauses.push({
    title: 'Objeto',
    body: [
      `${p.acreditanteName} (el "Acreditante") abre en favor de ${p.acreditadoName} (el "Acreditado") un crédito simple por la cantidad de ${principal}, en los términos de los artículos 291 a 301 de la Ley General de Títulos y Operaciones de Crédito.`,
      'El Acreditado se obliga a restituir la suma dispuesta con los intereses y accesorios pactados, conforme a la tabla de amortización de este contrato.',
      ...(p.acreditanteRepresentative ? [`El Acreditante actúa por conducto de ${inline(p.acreditanteRepresentative)}.`] : []),
      ...(p.acreditadoActivity ? [`El Acreditado declara dedicarse a la siguiente actividad: ${inline(p.acreditadoActivity)}.`] : []),
      ...(p.programName
        ? [`El crédito se otorga dentro del programa "${p.programName}"${p.programFolio ? `, folio ${p.programFolio}` : ''}, cuyas reglas de operación forman parte de este contrato.`]
        : []),
    ].join(' '),
  })

  clauses.push({
    title: 'Disposición',
    body: [
      `El Acreditante entregará el importe del crédito en una sola disposición el ${p.disbursementDate}, ${disbursementText(p)}.`,
      'El comprobante bancario de la operación acredita la entrega del dinero; el registro en cadena no la acredita.',
      'El pagaré que documenta este crédito se firma en forma autógrafa, es un documento distinto de este contrato y no se registra en cadena; el Acreditante lo conserva en custodia y lo devuelve al liquidar.',
      ...(p.originationFeePct ? [`Al disponer, el Acreditado cubre una comisión por apertura de ${p.originationFeePct} % del principal, más el impuesto al valor agregado.`] : []),
    ].join(' '),
  })

  clauses.push({
    title: 'Intereses',
    body: [
      Number(p.interestRateAnnualPct) === 0
        ? 'El crédito no causa intereses ordinarios.'
        : `El saldo insoluto causa intereses ordinarios a la tasa fija de ${p.interestRateAnnualPct} % anual${vat}, calculados sobre los días naturales transcurridos y pagaderos con cada parcialidad.`,
      ...(p.punctualPaymentRatePct !== undefined && Number(p.punctualPaymentRatePct) !== Number(p.interestRateAnnualPct)
        ? [`Si el Acreditado paga cada parcialidad a más tardar en su fecha de vencimiento, la tasa ordinaria aplicable es de ${p.punctualPaymentRatePct} % anual.`]
        : []),
      `Las cantidades vencidas y no pagadas causan intereses moratorios a la tasa de ${p.moratoryRateAnnualPct} % anual${vat}, desde el día siguiente a su vencimiento y hasta su pago total, sin capitalización de intereses.`,
      'Las partes reconocen que la autoridad judicial puede reducir de oficio los intereses que resulten notoriamente usurarios.',
    ].join(' '),
  })

  clauses.push({
    title: 'Amortización',
    body: [
      p.installments === 1
        ? `El Acreditado pagará el principal en una sola exhibición el ${p.firstDueDate}, a más tardar en la fecha de vencimiento final del ${p.maturityDate}.`
        : `El Acreditado pagará el principal en ${p.installments} parcialidades ${PERIODICITY_ES[p.periodicity] ?? p.periodicity} de capital, la primera el ${
            p.firstDueDate
          } y la última a más tardar el ${p.maturityDate}, conforme a la tabla de amortización incluida en este documento.`,
      'Cuando una fecha de pago sea día inhábil, el pago se hará el día hábil anterior.',
      `Los pagos se hacen en pesos ${
        p.placeOfPayment ? `en ${inline(p.placeOfPayment)}` : 'en la cuenta o el domicilio que el Acreditante indique por escrito'
      } y se aplican primero a intereses moratorios, después a intereses ordinarios y al final a capital.`,
    ].join(' '),
  })

  clauses.push({
    title: 'Destino y comprobación',
    body: [
      `El Acreditado destinará el crédito exclusivamente a lo siguiente: ${inline(p.purpose)}.`,
      ...(p.eligibleUses?.length ? [`Son conceptos elegibles: ${p.eligibleUses.map(inline).join(', ')}.`] : []),
      'El Acreditado comprobará el uso de los recursos con facturas (CFDI) u otros comprobantes dentro del plazo que fijen las reglas del programa o, a falta de plazo, dentro de los noventa días naturales siguientes a la disposición, y permitirá las visitas de verificación que el Acreditante determine.',
    ].join(' '),
  })

  clauses.push({
    title: 'Vencimiento anticipado y rescisión',
    body: [
      'El Acreditante podrá dar por vencido anticipadamente el plazo y exigir el saldo total del crédito si el Acreditado deja de pagar tres o más parcialidades, destina los recursos a un fin distinto del pactado o proporcionó información o documentos falsos.',
      'Por las mismas causas el Acreditante podrá rescindir este contrato.',
      'La decisión se notificará por escrito en el domicilio que el Acreditado señale para recibir notificaciones y surtirá efectos desde su notificación.',
    ].join(' '),
  })

  if (p.penaltyCents !== undefined && p.penaltyCents > 0) {
    clauses.push({
      title: 'Pena convencional',
      body: [
        `Si el Acreditado incumple las obligaciones de destino o de comprobación, pagará una pena convencional de ${formatMxn(p.penaltyCents)}.`,
        'La pena no podrá exceder en valor ni en cuantía a la obligación principal, conforme al artículo 1843 del Código Civil Federal.',
      ].join(' '),
    })
  }

  if (p.avalName) {
    clauses.push({ title: 'Garantías y aval', body: `${inline(p.avalName)} se constituye como aval del Acreditado y suscribe con ese carácter el pagaré que documenta este crédito.` })
  }

  if (publicLender) {
    clauses.push({
      title: 'Transparencia y padrón',
      body: [
        'El Acreditado consiente que su nombre, el monto del crédito, el municipio y el programa se publiquen en el padrón de beneficiarios conforme a la legislación de transparencia aplicable.',
        'El resto de la información de este contrato y el historial de pagos son confidenciales y se tratan como datos personales.',
      ].join(' '),
    })
  }

  clauses.push({
    title: 'Protección de datos',
    body: publicLender
      ? [
          'El Acreditante trata los datos personales del Acreditado y, en su caso, del aval como sujeto obligado conforme a la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados y a la ley estatal aplicable, para otorgar, administrar, verificar y recuperar el crédito.',
          'Puede transferirlos a otras autoridades para compulsas y fiscalización en los casos que la ley permite.',
          'Los titulares pueden ejercer sus derechos de acceso, rectificación, cancelación y oposición ante la unidad de transparencia del Acreditante.',
          'Ningún dato personal se registra en cadena.',
        ].join(' ')
      : [
          'El Acreditante trata los datos personales del Acreditado y, en su caso, del aval conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares y a su aviso de privacidad, para otorgar, administrar y recuperar el crédito.',
          'Los titulares pueden ejercer sus derechos de acceso, rectificación, cancelación y oposición ante el Acreditante.',
          'Ningún dato personal se registra en cadena.',
        ].join(' '),
  })

  if (publicLender) {
    clauses.push({
      title: 'Leyenda LGDS 28',
      body: '"Este programa es público, ajeno a cualquier partido político. Queda prohibido el uso para fines distintos al desarrollo social." En consecuencia, el crédito no podrá usarse con fines electorales o partidistas.',
    })
  }

  clauses.push({ title: 'Registro tecnológico y firma', body: REGISTRY_CLAUSE })

  clauses.push({
    title: 'Finiquito',
    body: [
      `Pagado el saldo total, el Acreditante entregará al Acreditado una constancia de no adeudo, le devolverá el pagaré original${p.avalName ? ' y liberará al aval' : ''}.`,
      'El Acreditado podrá pagar anticipadamente, en todo o en parte, sin penalización; los pagos anticipados se aplican a las últimas parcialidades.',
    ].join(' '),
  })

  if (publicLender) {
    clauses.push({
      title: 'Quejas',
      body: 'Las quejas sobre la operación del programa y de este crédito pueden presentarse ante el órgano interno de control del Acreditante, sin perjuicio de la competencia de los tribunales.',
    })
  }

  clauses.push({
    title: 'Jurisdicción',
    body:
      (p.disputeResolution ?? 'courts') === 'arbitration'
        ? [
            `Las partes firman este contrato en ${place}. Este contrato se rige por las leyes de los Estados Unidos Mexicanos.`,
            'Antes de cualquier procedimiento las partes intentarán un arreglo directo durante quince días hábiles.',
            `Las controversias derivadas de este contrato se resolverán mediante arbitraje conforme al Título Cuarto del Libro Quinto del Código de Comercio, ante árbitro único, en español y con sede en ${seat}; las medidas cautelares y la ejecución del laudo corresponden a los tribunales competentes.`,
          ].join(' ')
        : [
            `Las partes firman este contrato en ${place}. Este contrato se rige por las leyes de los Estados Unidos Mexicanos.`,
            `Para su interpretación y cumplimiento las partes se someten a los tribunales competentes de ${seat} y renuncian al fuero que pudiera corresponderles por razón de su domicilio presente o futuro.`,
          ].join(' '),
  })

  if (p.customTerms) clauses.push({ title: 'Términos adicionales', body: p.customTerms })
  return clauses
}

/** The credit agreement document the sign page renders and the parties sign (by hash). */
export function generateCreditAgreement(params: CreditAgreementParams): object {
  const now = Math.floor(Date.now() / 1000)
  const chain: ChainId = params.chain ?? 'solana'
  const hasProgram = Boolean(params.programName || params.programRulesUrl || params.programRulesSha256 || params.programFolio)
  return {
    document_type: 'credit_agreement',
    version: CREDIT_TEMPLATE_VERSION,
    title: 'Contrato de crédito',
    template: {
      id: 'credit-agreement',
      version: CREDIT_TEMPLATE_VERSION,
      author: 'Soft.Law',
      status: 'pilot',
      review: 'Plantilla piloto pendiente de revisión legal del despacho.',
      ...(params.templateSource ? { source: params.templateSource } : {}),
    },
    generated_at: now,
    generated_at_iso: new Date(now * 1000).toISOString(),
    language: { authoritative: 'es', courtesy: 'en' },
    description: `Credit agreement (apertura de crédito simple) between ${params.acreditanteName} (lender) and ${params.acreditadoName} (borrower) for ${formatMxn(params.principalCents)}, ${
      params.installments
    } ${params.periodicity} installments, first due ${params.firstDueDate}, maturity ${
      params.maturityDate
    }. Money moves in Mexican pesos outside the chain; this record proves which wallet registered which document and when.`,
    parties: {
      acreditante: {
        address: params.acreditante,
        name: params.acreditanteName,
        kind: params.acreditanteKind,
        ...(params.acreditanteRepresentative ? { representative: params.acreditanteRepresentative } : {}),
        role: 'Acreditante / Lender',
      },
      acreditado: {
        address: params.acreditado,
        name: params.acreditadoName,
        ...(params.acreditadoActivity ? { activity: params.acreditadoActivity } : {}),
        role: 'Acreditado / Borrower',
      },
      ...(params.avalName ? { aval: { name: params.avalName } } : {}),
    },
    credit: {
      principal_cents: params.principalCents,
      principal_in_words: params.principalInWords,
      currency: 'MXN',
      interest_rate_annual_pct: params.interestRateAnnualPct,
      ...(params.punctualPaymentRatePct !== undefined ? { punctual_payment_rate_pct: params.punctualPaymentRatePct } : {}),
      moratory_rate_annual_pct: params.moratoryRateAnnualPct,
      ...(params.originationFeePct !== undefined ? { origination_fee_pct: params.originationFeePct } : {}),
      vat_on_interest: params.vatOnInterest === true,
      ...(params.penaltyCents !== undefined ? { penalty_cents: params.penaltyCents } : {}),
      disbursement: { date: params.disbursementDate, method: params.disbursementMethod },
      amortization_schedule: {
        count: params.installments,
        periodicity: params.periodicity,
        first_due_date: params.firstDueDate,
        maturity_date: params.maturityDate,
        installments: buildAmortization(params),
      },
    },
    purpose: { description: params.purpose, ...(params.eligibleUses?.length ? { eligible_uses: params.eligibleUses } : {}) },
    ...(hasProgram
      ? {
          program: {
            ...(params.programName ? { name: params.programName } : {}),
            ...(params.programRulesUrl ? { rules_url: params.programRulesUrl } : {}),
            ...(params.programRulesSha256 ? { rules_sha256: params.programRulesSha256 } : {}),
            ...(params.programFolio ? { folio: params.programFolio } : {}),
          },
        }
      : {}),
    clauses: creditClauses(params).map((clause, index) => ({ clause_number: index + 1, ...clause })),
    annexes: (params.annexes ?? []).map(parseAnnex),
    record: {
      kind: 'registerCreditAgreement',
      network: chain === 'solana' ? 'Solana devnet' : String(chain),
      proves: ['document integrity (hash)', 'recording time', 'registering wallet'],
      does_not_prove: ['identity', 'authority to sign', 'disbursement', 'payments', 'fecha cierta', 'enforceability'],
    },
    notices: { ...CREDIT_NOTICES },
    platform: 'Soft.Law',
  }
}

/** What each party signs with their wallet: a record of the document, not the signature of the original instrument. */
export function buildCreditSignMessage(p: { acreditante: string; acreditado: string; principal: string; hash: string; method?: string }): string {
  const method = p.method ?? SOLANA_SIGNATURE_METHOD
  return [
    'Soft.Law Contrato de crédito',
    '',
    `Acreditante: ${p.acreditante}`,
    `Acreditado: ${p.acreditado}`,
    `Principal: ${p.principal}`,
    `Hash del documento: ${p.hash}`,
    '',
    'Firmo el registro de este documento en el expediente; esta firma no sustituye la firma del instrumento original.',
    'I sign the record of this document in the credit file; this signature does not replace the signature of the original instrument.',
    '',
    `Method: ${method}`,
  ].join('\n')
}
