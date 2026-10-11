/**
 * The credit agreement engine as MCP tools. One server instance per request
 * (the endpoint is stateless); every tool returns the same object as text and
 * as `structuredContent` so hosts can read it either way.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  CREDIT_PERIODICITIES,
  DISBURSEMENT_METHODS,
  DISPUTE_RESOLUTIONS,
  LENDER_KINDS,
  SOLANA_SIGNATURE_METHOD,
  TEMPLATE_FAMILIES,
  buildCreditSignMessage,
  SUBSIDY_LAPSE_RULES,
  SUBSIDY_PAYMENT_TIMINGS,
  checkCreditAgreementDraft,
  checkCreditAgreementV02Draft,
  hasSupport,
  computeDocumentHash,
  formatMxn,
  generateCreditAgreement,
  generateCreditAgreementV02,
  getTemplate,
  hashToHex64,
  listTemplates,
  renderAgreementMarkdown,
} from '../engine'
import { createAgreement, getAgreement, listAnchors, listSignatures, missingSignatures, setAgreementStatus, type AgreementRecord } from '../store'
import { apiBaseUrl, exportEvidence } from '../evidence'

export const SERVER_INFO = { name: 'elote-agreements', version: '0.1.0' }

/** Sent on initialize; hosts show it to the model before any tool call. */
export const SERVER_INSTRUCTIONS = [
  'This server drafts credit agreements (contrato de crédito, MX) from a template, collects the wallet signatures of the parties and records the on-chain registration. The flow:',
  '1. Draft with draft_credit_agreement (template 0.1, or 0.2 with an optional support program: eligibility letter and interest subsidy). Each call stores a new agreement and returns its agreementId.',
  '2. If findings has blocking entries, fix the terms and draft again; use the new agreementId from then on.',
  '3. request_signatures returns one sign link per party. Share each link with its party. People sign with their own wallets on the sign page; the agent never signs and holds no keys.',
  '4. request_anchor reports whether every party has signed and returns the agreement hash. It submits nothing: the acreditante, from their own wallet, opens the credit line with `open_line(agreement_hash)` in the elote_pool program; then the transaction signature and the line id are recorded as the registerCreditAgreement anchor.',
  '5. get_agreement follows progress (nextAction, missingRoles, signatures, anchors).',
  '6. export_markdown gives a readable view; export_evidence returns the portable record with a verification report anyone can repeat.',
  'The wallet signature records the document in the credit file and does not replace the signature of the original instrument. Money moves in pesos outside the chain.',
  'The template is a pilot version pending legal review. Demo on Solana devnet with test assets. Not an offer of securities.',
].join('\n')

/** Caps on free text, far above any real use; they keep one call from storing megabytes. */
const MAX_CUSTOM_TERMS = 20_000

const agreementIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, 'agreementId must be the 32-character hex id returned by a draft tool')
  .describe('The 32-character hex id returned by draft_credit_agreement')
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('YYYY-MM-DD')
const percentSchema = z
  .string()
  .max(12)
  .regex(/^\d+(\.\d+)?$/)
const creditText = (max: number) => z.string().trim().min(1).max(max)
const solanaWallet = 'on Solana: a base58 public key (32 to 44 characters)'

function result(payload: Record<string, unknown>, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError }
}

/** One answer for an id that does not exist and one that belongs to another account, so ids cannot be probed. */
function notFound(agreementId: string) {
  return result({ found: false, agreementId, reason: 'No agreement with that id for this account.' }, true)
}

function signLinksFor(record: AgreementRecord): Record<string, string> {
  const base = appBaseUrl()
  return Object.fromEntries(Object.keys(record.parties).map(role => [role, `${base}/sign/${record.id}?as=${role}`]))
}

/** What the agent should do next, from the stored status. An anchor made before every party signed still waits for the rest. */
function nextActionFor(record: AgreementRecord, missingRoles: string[]): 'share sign links' | 'wait for signatures' | 'register on chain' | 'done' {
  if (record.status === 'draft') return 'share sign links'
  if (record.status === 'pending_signatures') return 'wait for signatures'
  if (record.status === 'signed') return 'register on chain'
  return missingRoles.length > 0 ? 'wait for signatures' : 'done'
}

const DRAFT_NEXT_STEP = 'If findings has blocking entries, fix the terms and draft again (a new agreementId). Otherwise call request_signatures with this agreementId.'
const DRAFT_NOTE =
  'Each call stores a new agreement with a new agreementId. If findings has blocking entries, fix the terms and draft again before request_signatures; then call request_signatures to get one sign link per party.'
export const ANCHOR_NOTE =
  'Open the credit line in the pool with this hash; then record the transaction signature as the anchor (POST /api/agreements/:id/anchors with kind registerCreditAgreement, reference = signature, recordId = line id).'

/** Base URL of the human surface (sign pages). */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? 'https://app.soft.law').replace(/\/$/, '')
}

export function createAgreementsServer(tenant: string): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS })

  server.registerTool(
    'list_templates',
    {
      title: 'List agreement templates',
      description: 'Templates the engine can draft, with author, jurisdiction, version, review scope, supported chain and typed fields.',
      inputSchema: { family: z.enum(TEMPLATE_FAMILIES).optional().describe('Template family') },
      annotations: { title: 'List agreement templates', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ family }) => result({ templates: listTemplates({ family }) }),
  )

  server.registerTool(
    'draft_credit_agreement',
    {
      title: 'Draft a credit agreement (MX)',
      description: `Contrato de crédito simple for an entrepreneur support program, Spanish authoritative with an English summary: parties (acreditante registers, acreditado signs), principal in MXN with the amount in words, interest and moratory rates, disbursement by SPEI, amortization schedule, purpose and proof of use, acceleration, transparency and privacy clauses for a public lender, courts by default. Deterministic findings (amount in words, dates, schedule, penalty cap, rates) come back first. Money moves in pesos outside the chain; the acreditante records the signed agreement on Solana by opening the credit line in the pool program with its hash, as a record of integrity, time and signer. Version 0.2 adds an optional support program (eligibility letter, an interest subsidy paid by the program to the acreditante against CFDI and conditioned on punctual payment, the rule when it stops, and clauses that the support does not alter the borrower's obligation and carries no government backing); templateVersion defaults to 0.2 when any support field is given, 0.1 otherwise. ${DRAFT_NOTE}`,
      inputSchema: {
        chain: z.literal('solana').default('solana').describe('credit-agreement records on Solana devnet only'),
        acreditante: z.string().max(64).describe(`Lender wallet ${solanaWallet}; signs and registers the agreement`),
        acreditado: z.string().max(64).describe(`Borrower wallet ${solanaWallet}`),
        acreditanteName: creditText(200),
        acreditanteKind: z.enum(LENDER_KINDS),
        acreditanteRepresentative: creditText(200).optional(),
        acreditadoName: creditText(200),
        acreditadoActivity: creditText(200).optional(),
        avalName: creditText(200).optional(),
        principalCents: z.number().int().positive(),
        principalInWords: z.string().max(300),
        interestRateAnnualPct: percentSchema,
        punctualPaymentRatePct: percentSchema.optional(),
        moratoryRateAnnualPct: percentSchema,
        originationFeePct: percentSchema.optional(),
        vatOnInterest: z.boolean().optional(),
        penaltyCents: z.number().int().nonnegative().optional(),
        disbursementDate: dateSchema,
        disbursementMethod: z.enum(DISBURSEMENT_METHODS),
        installments: z.number().int().min(1).max(120),
        periodicity: z.enum(CREDIT_PERIODICITIES),
        firstDueDate: dateSchema,
        maturityDate: dateSchema,
        purpose: creditText(1000),
        eligibleUses: z.array(creditText(100)).max(20).optional(),
        placeOfSigning: creditText(200),
        placeOfPayment: creditText(200).optional(),
        disputeResolution: z.enum(DISPUTE_RESOLUTIONS).default('courts'),
        courtsSeat: creditText(200).optional(),
        programName: creditText(200).optional(),
        programRulesUrl: z
          .string()
          .url()
          .max(500)
          .regex(/^https?:\/\//, 'programRulesUrl must start with http:// or https://')
          .optional(),
        programRulesSha256: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .optional(),
        programFolio: z.string().max(100).optional(),
        annexes: z.array(z.string().max(300)).max(20).optional(),
        templateSource: z.string().max(300).optional(),
        customTerms: z.string().max(MAX_CUSTOM_TERMS).optional(),
        templateVersion: z.enum(['0.1', '0.2']).optional().describe('Template version: 0.2 (support program) by default when any support field is given, 0.1 otherwise'),
        supportProgram: z
          .object({
            name: creditText(200),
            authority: creditText(200),
            legalBasisRef: creditText(300).optional(),
            rulesUrl: z
              .string()
              .url()
              .max(500)
              .regex(/^https?:\/\//, 'rulesUrl must start with http:// or https://')
              .optional(),
            rulesSha256: z
              .string()
              .regex(/^[0-9a-f]{64}$/)
              .optional(),
            budgetYear: z.number().int().min(2000).max(2100).optional(),
            agreementRef: creditText(200).optional(),
          })
          .strict()
          .optional()
          .describe('0.2: the support program and the authority that operates it'),
        eligibilityLetter: z
          .object({ folio: creditText(100), issuedBy: creditText(200), issuedAt: dateSchema, sha256: z.string().max(64), validUntil: dateSchema.optional() })
          .strict()
          .optional()
          .describe('0.2: eligibility letter; only the SHA-256 of its file enters the document'),
        interestSubsidy: z
          .object({
            payer: creditText(200),
            subsidizedPoints: percentSchema.optional(),
            subsidizedRatePct: percentSchema.optional(),
            borrowerRatePct: percentSchema,
            condition: z.literal('punctualPayment'),
            paymentTiming: z.enum(SUBSIDY_PAYMENT_TIMINGS),
            paidTo: z.literal('acreditante'),
            capPerBorrowerCents: z.number().int().nonnegative().optional(),
            programCapCents: z.number().int().nonnegative().optional(),
            endDate: dateSchema.optional(),
          })
          .strict()
          .optional()
          .describe(
            '0.2: part of the ordinary interest paid by the program to the acreditante; annual percentages (points are percentage points); exactly one of subsidizedPoints or subsidizedRatePct',
          ),
        subsidyLapseRule: z.enum(SUBSIDY_LAPSE_RULES).optional().describe('0.2: what happens when the subsidy stops'),
        noticeDays: z.number().int().min(1).max(365).optional().describe('0.2: days of written notice before the subsidy stops'),
        supportDisclaimerAccepted: z.boolean().optional().describe('0.2: the acreditado acknowledges that the support does not alter their obligation'),
        encrypted: z.boolean().default(true).describe('Store the signed file end-to-end encrypted for the parties (default true: the file carries personal data).'),
      },
      annotations: { title: 'Draft a credit agreement (MX)', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async args => {
      const { encrypted, templateVersion, ...params } = args
      const support = hasSupport(params)
      const version = templateVersion ?? (support ? '0.2' : '0.1')
      if (version === '0.1' && support) {
        return result(
          {
            stored: false,
            reason: 'Support fields (supportProgram, eligibilityLetter, interestSubsidy, subsidyLapseRule, noticeDays, supportDisclaimerAccepted) need templateVersion 0.2; drop them or use 0.2.',
          },
          true,
        )
      }
      const template = getTemplate('credit-agreement', version === '0.2' ? '0.2.0' : '0.1.0')!
      const findings = version === '0.2' ? checkCreditAgreementV02Draft(params, { encrypted }) : checkCreditAgreementDraft(params, { encrypted })
      const document = version === '0.2' ? generateCreditAgreementV02(params) : generateCreditAgreement(params)
      const hash = computeDocumentHash(document)
      const signMessage = buildCreditSignMessage({ acreditante: params.acreditante, acreditado: params.acreditado, principal: formatMxn(params.principalCents), hash, method: SOLANA_SIGNATURE_METHOD })
      const record = createAgreement({
        tenant,
        chain: 'solana',
        templateId: template.id,
        templateVersion: template.version,
        document: document as Record<string, unknown>,
        hash,
        signMessage,
        parties: { acreditante: params.acreditante, acreditado: params.acreditado },
        terms: { ...(params as unknown as Record<string, unknown>), encrypted },
      })
      return result({ agreementId: record.id, template: { id: template.id, version: template.version }, chain: 'solana', document, hash, findings, encrypted, signMessage, nextStep: DRAFT_NEXT_STEP })
    },
  )

  server.registerTool(
    'request_signatures',
    {
      title: 'Request signatures',
      description:
        'Turn a draft into a signing round: one link per party. Share each link with its party; each party opens its link, logs in with the wallet named in the agreement and signs the exact stored message. The agent never signs for anyone. Calling it again returns the same links. Next: follow progress with get_agreement, then request_anchor once everyone has signed.',
      inputSchema: { agreementId: agreementIdSchema },
      annotations: { title: 'Request signatures', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agreementId }) => {
      const record = getAgreement(agreementId)
      if (!record || record.tenant !== tenant) return notFound(agreementId)
      if (record.status === 'draft') setAgreementStatus(agreementId, 'pending_signatures')
      return result({
        agreementId,
        status: record.status === 'draft' ? 'pending_signatures' : record.status,
        chain: record.chain,
        parties: record.parties,
        signLinks: signLinksFor(record),
        signMessage: record.signMessage,
        hash: record.hash,
        nextStep: 'Send each party its own sign link. Check progress with get_agreement; when every party has signed, call request_anchor.',
      })
    },
  )

  server.registerTool(
    'get_agreement',
    {
      title: 'Get an agreement',
      description:
        'Status of an agreement this account drafted: parties, hash, which parties have signed and when, which have not (missingRoles), their sign links, anchors (the Solana transaction that opened the credit line, and the line id), and nextAction: "share sign links" (call request_signatures), "wait for signatures", "register on chain" (call request_anchor) or "done".',
      inputSchema: { agreementId: agreementIdSchema },
      annotations: { title: 'Get an agreement', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agreementId }) => {
      const record = getAgreement(agreementId)
      if (!record || record.tenant !== tenant) return notFound(agreementId)
      const signed = listSignatures(agreementId)
      const missingRoles = missingSignatures(agreementId)
      return result({
        found: true,
        agreementId,
        status: record.status,
        chain: record.chain,
        template: { id: record.templateId, version: record.templateVersion },
        hash: record.hash,
        parties: record.parties,
        terms: record.terms,
        encryptionKeys: Object.fromEntries(signed.filter(entry => entry.encryptionPublicKey).map(entry => [entry.role, entry.encryptionPublicKey!])),
        signatures: signed.map(({ role, address, method, signedAt }) => ({ role, address, method, signedAt })),
        anchors: listAnchors(agreementId),
        document: record.document,
        missingRoles,
        signLinks: signLinksFor(record),
        nextAction: nextActionFor(record, missingRoles),
      })
    },
  )

  server.registerTool(
    'request_anchor',
    {
      title: 'Request the on-chain registration',
      description:
        'Does NOT submit anything on chain: a read-only readiness check. Returns the agreement hash the acreditante passes as agreement_hash when opening the credit line in the pool program from their own wallet, and how to record the resulting transaction signature as the anchor.',
      inputSchema: { agreementId: agreementIdSchema },
      annotations: { title: 'Request the on-chain registration', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agreementId }) => {
      const record = getAgreement(agreementId)
      if (!record || record.tenant !== tenant) return notFound(agreementId)
      const policy = getTemplate(record.templateId, record.templateVersion)!.anchor
      const missingRoles = missingSignatures(agreementId)
      const nextStep =
        missingRoles.length > 0
          ? `Wait for ${missingRoles.join(', ')} to sign from their links (get_agreement shows progress), then give the hash to the ${policy.executor}.`
          : `Give the hash to the ${policy.executor}, who opens the credit line with their own wallet. Then record the transaction signature as the anchor; get_agreement shows it and export_evidence returns the record.`
      return result({
        agreementId,
        chain: record.chain,
        action: policy.kind,
        signer: policy.executor,
        signerAddress: record.parties[policy.executor] ?? null,
        ready: missingRoles.length === 0,
        missingRoles,
        hash: record.hash,
        agreementHashHex: hashToHex64(record.hash),
        anchorEndpoint: `${apiBaseUrl()}/api/agreements/${agreementId}/anchors`,
        status: record.status,
        anchors: listAnchors(agreementId),
        note: ANCHOR_NOTE,
        nextStep,
      })
    },
  )

  server.registerTool(
    'export_markdown',
    {
      title: 'Export a Markdown view',
      description:
        'A readable Markdown rendering of an agreement this account drafted (title, parties, numbered clauses), to open in any Markdown editor. It is a view: what parties sign is the stored JSON document and its hash. Edits made in an editor do not change the agreement; bring changes back as a new draft (e.g. customTerms) before requesting signatures.',
      inputSchema: { agreementId: agreementIdSchema },
      annotations: { title: 'Export a Markdown view', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agreementId }) => {
      const record = getAgreement(agreementId)
      if (!record || record.tenant !== tenant) return notFound(agreementId)
      const markdown = renderAgreementMarkdown(record.document, { hash: record.hash })
      const title = markdown.split('\n', 1)[0]!.replace(/^# /, '')
      return result({
        agreementId,
        hash: record.hash,
        title,
        markdown,
        note: 'Open or edit the Markdown in any editor; the signed record remains this agreement and hash.',
      })
    },
  )

  server.registerTool(
    'export_evidence',
    {
      title: 'Export evidence package',
      description:
        'The portable record of an agreement: exact document bytes, hash, who signed (and the signatures), anchors, plus a verification report and the steps anyone can repeat without this server.',
      inputSchema: { agreementId: agreementIdSchema },
      annotations: { title: 'Export evidence package', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ agreementId }) => {
      const record = getAgreement(agreementId)
      if (!record || record.tenant !== tenant) return notFound(agreementId)
      return result((await exportEvidence(record)) as unknown as Record<string, unknown>)
    },
  )

  return server
}
