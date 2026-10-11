/**
 * Renders the sample contracts in docs/contracts/ with the engine's own
 * generator and Markdown renderer. Parties, wallets and programs are
 * fictional; the generation time is fixed so the files are reproducible
 * (test/docs.test.ts checks they are up to date).
 *
 *   bun run render-samples
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ed25519 } from '@noble/curves/ed25519'
import { base58 } from '@scure/base'
import { computeDocumentHash, generateCreditAgreement, generateCreditAgreementV02, renderAgreementMarkdown, type CreditAgreementParams, type CreditAgreementV02Params } from '../src/engine'

const SAMPLE_TIME = 1_793_577_600 // 2026-11-02T00:00:00Z

/** A wallet address derived from a fixed seed: valid base58, owned by no one. */
function sampleWallet(seedByte: number): string {
  return base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(seedByte)))
}

export const SAMPLE_V01: CreditAgreementParams = {
  chain: 'solana',
  acreditante: sampleWallet(101),
  acreditado: sampleWallet(102),
  acreditanteName: 'Fondo de Fomento de Ciudad Ejemplo',
  acreditanteKind: 'public',
  acreditanteRepresentative: 'Laura Ejemplo, directora general',
  acreditadoName: 'Ana Pérez Muestra',
  acreditadoActivity: 'panadería',
  avalName: 'Luis Pérez Muestra',
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
  purpose: 'Compra de horno y mobiliario',
  eligibleUses: ['equipo', 'mobiliario'],
  placeOfSigning: 'Ciudad Ejemplo, Estado Ejemplo',
  programName: 'Programa Ejemplo de Crédito a Emprendedores',
  programFolio: 'PE-0001',
}

export const SAMPLE_V02: CreditAgreementV02Params = {
  chain: 'solana',
  acreditante: sampleWallet(111),
  acreditado: sampleWallet(112),
  acreditanteName: 'Financiera Ejemplo, S.A. de C.V.',
  acreditanteKind: 'private',
  acreditanteRepresentative: 'Jorge Ejemplo, apoderado',
  acreditadoName: 'Taller Muestra, S. de R.L. de C.V.',
  acreditadoActivity: 'reparación de bicicletas',
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
  purpose: 'Capital de trabajo y herramienta',
  placeOfSigning: 'Ciudad Ejemplo, Estado Ejemplo',
  supportProgram: {
    name: 'Programa Ejemplo de Apoyo a la Tasa para PyMEs',
    authority: 'Ayuntamiento de Ciudad Ejemplo',
    legalBasisRef: 'Reglas de Operación del Programa Ejemplo 2026',
    budgetYear: 2026,
    agreementRef: 'CONV-EJEMPLO-001/2026',
  },
  eligibilityLetter: { folio: 'ELIG-EJEMPLO-0042', issuedBy: 'Dirección de Desarrollo Económico de Ciudad Ejemplo', issuedAt: '2026-10-20', sha256: '0'.repeat(63) + '1', validUntil: '2026-12-31' },
  interestSubsidy: {
    payer: 'Ayuntamiento de Ciudad Ejemplo',
    subsidizedPoints: '10',
    borrowerRatePct: '8',
    condition: 'punctualPayment',
    paymentTiming: 'perInstallment',
    paidTo: 'acreditante',
    capPerBorrowerCents: 500000,
    endDate: '2027-11-02',
  },
  subsidyLapseRule: 'borrowerMayPrepay',
  noticeDays: 30,
  supportDisclaimerAccepted: true,
}

const BANNER = [
  '> **Sample, pilot template under legal review.** Fictional parties, wallets, program and authority; not a real agreement and not legal advice.',
  '> Demo on Solana devnet with test assets. Not an offer of securities.',
  '',
]

function sample(document: Record<string, unknown>): string {
  document.generated_at = SAMPLE_TIME
  document.generated_at_iso = new Date(SAMPLE_TIME * 1000).toISOString()
  return [...BANNER, renderAgreementMarkdown(document, { hash: computeDocumentHash(document) })].join('\n')
}

export function renderSamples(): Record<string, string> {
  return {
    'credit-agreement-0.1.md': sample(generateCreditAgreement(SAMPLE_V01) as Record<string, unknown>),
    'credit-agreement-0.2.md': sample(generateCreditAgreementV02(SAMPLE_V02) as Record<string, unknown>),
  }
}

if (import.meta.main) {
  const dir = join(import.meta.dir, '..', 'docs', 'contracts')
  for (const [name, text] of Object.entries(renderSamples())) {
    writeFileSync(join(dir, name), text)
    console.log(`wrote docs/contracts/${name}`)
  }
}
