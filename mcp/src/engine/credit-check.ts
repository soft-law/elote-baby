/**
 * Deterministic findings for a credit agreement draft. Every message says
 * whether it blocks (fix and draft again) or only asks for review.
 */
import { isPartyAddress, sameAddress } from './address'
import { CREDIT_PERIODICITIES, MAX_PESOS, amountInWordsEs, buildAmortization, isPublicLender, parseAnnex, parseIsoDate, type CreditAgreementParams } from './credit-agreement'
import type { Finding } from './types'

const DECIMAL = /^\d+(\.\d+)?$/
const SHA256_HEX = /^[0-9a-f]{64}$/
const HIGH_INTEREST_PCT = 36
const HIGH_MORATORY_PCT = 72

/** Amount words compared without accents, currency words, "M.N." or a zero fraction. */
function normalizeWords(value: string): string {
  const words = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bm\s*\.\s*n\s*\.?/g, ' ')
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim()
    .split(/\s+/)
  const kept: string[] = []
  words.forEach((token, index) => {
    if (['pesos', 'peso', 'mn', 'moneda', 'nacional', '00/100', 'mxn', ''].includes(token)) return
    if (token === 'de' && ['pesos', 'peso'].includes(words[index + 1] ?? '')) return
    kept.push(token === 'uno' ? 'un' : token === 'veintiuno' ? 'veintiun' : token)
  })
  if (kept[0] === 'un' && kept[1] === 'mil') kept.shift()
  return kept.join(' ')
}

/** `options.encrypted` is how the signed file will be stored; only an explicit false is reported. */
export function checkCreditAgreementDraft(params: CreditAgreementParams, options: { encrypted?: boolean } = {}): Finding[] {
  const chain: string = params.chain ?? 'solana'
  const findings: Finding[] = []
  const add = (code: string, field: string, message: string) => {
    findings.push({ code, field, message })
  }

  if (chain !== 'solana') add('UNSUPPORTED_CHAIN', 'chain', 'Blocking: credit-agreement 0.1 and 0.2 register on Solana devnet only.')

  const lenderValid = isPartyAddress(params.acreditante)
  const borrowerValid = isPartyAddress(params.acreditado)
  if (!lenderValid) add('INVALID_ADDRESS', 'acreditante', `Blocking: the acreditante must be a valid Solana wallet address that can sign.`)
  if (!borrowerValid) add('INVALID_ADDRESS', 'acreditado', `Blocking: the acreditado must be a valid Solana wallet address that can sign.`)
  if (lenderValid && borrowerValid && sameAddress(params.acreditante, params.acreditado)) add('SAME_PARTY', 'acreditado', 'Blocking: the acreditante and the acreditado are the same wallet.')

  const principalValid = Number.isSafeInteger(params.principalCents) && params.principalCents > 0
  if (!principalValid) add('ZERO_PRINCIPAL', 'principalCents', 'Blocking: the principal must be a whole number of cents above zero.')
  else {
    if (Math.floor(params.principalCents / 100) > MAX_PESOS) {
      add('AMOUNT_WORDS_MISMATCH', 'principalInWords', 'Blocking: the amount in words cannot be checked above 999,999,999 pesos; split the credit or confirm the amount.')
    } else {
      const expected = amountInWordsEs(params.principalCents)
      if (normalizeWords(params.principalInWords) !== normalizeWords(expected)) {
        add('AMOUNT_WORDS_MISMATCH', 'principalInWords', `Blocking: the amount in words does not match the digits; for ${params.principalCents} cents write "${expected}".`)
      }
    }
  }

  for (const field of ['interestRateAnnualPct', 'moratoryRateAnnualPct', 'punctualPaymentRatePct', 'originationFeePct'] as const) {
    const value = params[field]
    if (value !== undefined && !DECIMAL.test(value.trim())) add('INVALID_RATE', field, 'Blocking: rates are non-negative decimal percentages, e.g. "24" or "4.33".')
  }
  if (DECIMAL.test(params.interestRateAnnualPct.trim()) && Number(params.interestRateAnnualPct) > HIGH_INTEREST_PCT) {
    add('HIGH_RATE_REVIEW', 'interestRateAnnualPct', `Review: an ordinary rate above ${HIGH_INTEREST_PCT} % a year may be reduced by a court as usurious; confirm it with the firm. Does not block.`)
  }
  if (DECIMAL.test(params.moratoryRateAnnualPct.trim()) && Number(params.moratoryRateAnnualPct) > HIGH_MORATORY_PCT) {
    add('HIGH_RATE_REVIEW', 'moratoryRateAnnualPct', `Review: a moratory rate above ${HIGH_MORATORY_PCT} % a year may be reduced by a court as usurious; confirm it with the firm. Does not block.`)
  }

  const installmentsValid = Number.isSafeInteger(params.installments) && params.installments >= 1
  if (!installmentsValid) add('INVALID_INSTALLMENTS', 'installments', 'Blocking: the number of installments must be a whole number of at least 1.')
  if (!(CREDIT_PERIODICITIES as readonly string[]).includes(params.periodicity)) add('INVALID_INSTALLMENTS', 'periodicity', `Blocking: periodicity must be one of ${CREDIT_PERIODICITIES.join(', ')}.`)

  const disbursement = parseIsoDate(params.disbursementDate)
  const firstDue = parseIsoDate(params.firstDueDate)
  const maturity = parseIsoDate(params.maturityDate)
  const datesInOrder = disbursement !== null && firstDue !== null && maturity !== null && disbursement <= firstDue && firstDue <= maturity
  if (!datesInOrder) {
    const field = disbursement === null ? 'disbursementDate' : firstDue === null ? 'firstDueDate' : maturity === null ? 'maturityDate' : disbursement > firstDue ? 'disbursementDate' : 'maturityDate'
    add('DATE_ORDER', field, 'Blocking: dates must be real YYYY-MM-DD dates with disbursementDate <= firstDueDate <= maturityDate.')
  } else if (installmentsValid) {
    const schedule = buildAmortization(params)
    const lastDue = schedule.at(-1)?.due_date
    if (lastDue && lastDue > params.maturityDate) {
      add(
        'SCHEDULE_OVERRUNS_MATURITY',
        'maturityDate',
        `Blocking: the last installment falls on ${lastDue}, after the maturity date ${params.maturityDate}; change the maturity date, the installments or the periodicity.`,
      )
    }
  }

  if (params.penaltyCents !== undefined && principalValid && params.penaltyCents > params.principalCents) {
    add('PENALTY_EXCEEDS_PRINCIPAL', 'penaltyCents', 'Blocking: a contractual penalty may not exceed the principal obligation (CCF 1843).')
  }

  if (params.programRulesUrl && !SHA256_HEX.test(params.programRulesSha256 ?? '')) {
    add(
      'PROGRAM_RULES_UNHASHED',
      'programRulesSha256',
      'Review: the program rules are linked without their SHA-256, so the version the parties agreed to cannot be proven. Add the hash if you can. Does not block.',
    )
  }

  for (const annex of params.annexes ?? []) {
    if (!/^[^:]+:[0-9a-f]{64}$/.test(annex)) {
      add('ANNEX_WITHOUT_HASH', 'annexes', `Blocking: annex "${parseAnnex(annex).name}" must be written as "name:sha256hex" (64 lowercase hex characters).`)
    }
  }

  if (params.disputeResolution === 'arbitration' && isPublicLender(params.acreditanteKind)) {
    add(
      'ARBITRATION_WITH_PUBLIC_LENDER',
      'disputeResolution',
      'Review: a public lender needs an express legal basis to agree to arbitration; the firm must confirm it, otherwise use courts. Does not block.',
    )
  }

  if (options.encrypted === false) {
    add(
      'PLAINTEXT_PERSONAL_DATA',
      'encrypted',
      'Review: with encrypted false the signed file is stored in clear on IPFS and carries the names and the activity of the parties; keep it only if every party agreed to publish them. Does not block.',
    )
  }

  return findings
}
