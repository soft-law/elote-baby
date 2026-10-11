import { ed25519 } from '@noble/curves/ed25519'
import { base58 } from '@scure/base'

/** A deterministic Ed25519 wallet for tests: base58 address and a signer over UTF-8 messages. */
export function wallet(seedByte: number) {
  const secret = new Uint8Array(32).fill(seedByte)
  const address = base58.encode(ed25519.getPublicKey(secret))
  return { address, sign: (message: string) => base58.encode(ed25519.sign(new TextEncoder().encode(message), secret)) }
}

/** A syntactically valid Solana transaction signature (64 bytes, base58). */
export function txSignature(fill: number): string {
  return base58.encode(new Uint8Array(64).fill(fill))
}

export const CREDIT_TERMS = {
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
} as const
