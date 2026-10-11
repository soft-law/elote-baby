# Credit agreement templates

> Pilot templates under legal review. The samples in this folder use fictional parties, wallets,
> programs and authorities. Demo on Solana devnet with test assets. Not an offer of securities.

Both versions draft a Mexican *contrato de crédito simple* (LGTOC 291-301). Spanish is the
authoritative text and English is a courtesy summary. Money is disbursed and repaid in pesos
outside the chain. Each party's wallet signature records the document in the credit file and does
not replace the signature of the original instrument. The acreditante records the signed agreement
on Solana by opening the credit line in the `elote_pool` program with the agreement hash
(`registerCreditAgreement`). The engine is Soft.Law's.

| Version | Sample | Use |
|---|---|---|
| `credit-agreement` 0.1.0 | [credit-agreement-0.1.md](credit-agreement-0.1.md) | Credit from a lender (public, trust or private). |
| `credit-agreement` 0.2.0 | [credit-agreement-0.2.md](credit-agreement-0.2.md) | 0.1 plus an optional support program: eligibility letter and an interest subsidy paid by the program to the acreditante. Without support fields, a 0.2 draft has the same clauses and findings as 0.1. |

`draft_credit_agreement` takes `templateVersion: '0.1' | '0.2'`. It defaults to `0.2` when any
support field is given and to `0.1` otherwise. If you ask for `0.1` with support fields, it stores
nothing and returns an error. Regenerate the samples with `bun run render-samples`;
`test/docs.test.ts` fails if they are out of date.

## Fields

**0.1** (required in bold): **acreditante**, **acreditado** (Solana wallets), **acreditanteName**,
**acreditanteKind** (`public` | `trust` | `private`), acreditanteRepresentative, **acreditadoName**,
acreditadoActivity, avalName, **principalCents**, **principalInWords**, **interestRateAnnualPct**,
punctualPaymentRatePct, **moratoryRateAnnualPct**, originationFeePct, vatOnInterest, penaltyCents,
**disbursementDate**, **disbursementMethod** (`spei` | `transfer` | `cheque`), **installments**,
**periodicity** (`monthly` | `biweekly` | `weekly`), **firstDueDate**, **maturityDate**,
**purpose**, eligibleUses, **placeOfSigning**, placeOfPayment, disputeResolution (`courts` |
`arbitration`), courtsSeat, programName, programRulesUrl, programRulesSha256, programFolio, annexes
(`name:sha256`), templateSource, customTerms, chain (`solana`). The MCP tool also takes
`encrypted` (default true).

**0.2** adds the following fields. All are optional, and together they form the support group:

| Field | Shape |
|---|---|
| `supportProgram` | `{name, authority, legalBasisRef?, rulesUrl?, rulesSha256?, budgetYear?, agreementRef?}` |
| `eligibilityLetter` | `{folio, issuedBy, issuedAt, sha256, validUntil?}`; only the hash of the file enters the document |
| `interestSubsidy` | `{payer, subsidizedPoints \| subsidizedRatePct, borrowerRatePct, condition: 'punctualPayment', paymentTiming: 'perInstallment' \| 'quarterly', paidTo: 'acreditante', capPerBorrowerCents?, programCapCents?, endDate?}`; rates are annual percentages and points are percentage points |
| `subsidyLapseRule` | `'borrowerPaysContractRate'` \| `'rateStaysAtSubsidized'` \| `'borrowerMayPrepay'` |
| `noticeDays` | days of written notice before the subsidy stops (1 to 365) |
| `supportDisclaimerAccepted` | the acreditado acknowledges the no-alteration clause |

The 0.2 document carries these terms under `support`.

## Clauses

**0.1**, in order. Conditional clauses say when they appear.

1. Objeto
2. Disposición
3. Intereses
4. Amortización
5. Destino y comprobación
6. Vencimiento anticipado y rescisión
7. Pena convencional (with `penaltyCents`)
8. Garantías y aval (with `avalName`)
9. Transparencia y padrón (public or trust lender)
10. Protección de datos
11. Leyenda LGDS 28 (public or trust lender)
12. Registro tecnológico y firma
13. Finiquito
14. Quejas (public or trust lender)
15. Jurisdicción
16. Términos adicionales (with `customTerms`)

**0.2** inserts the support clauses before *Registro tecnológico y firma*, only when support is
present:

- **Del programa de apoyo y la carta de elegibilidad** (with a program or a letter). Identifies the
  program, the operating authority, the agreement and the letter (folio, issuer, date and SHA-256).
  Eligibility does not oblige the lender to grant the credit.
- **Del apoyo a la tasa de interés** (with a subsidy). Covers who pays which share of the ordinary
  interest, when, and to whom: directly to the acreditante, against CFDI. The subsidy is conditional
  on punctual payment, and it never covers moratory interest, fees or principal. Caps and end date
  are included when given.
- **De la suspensión o terminación del apoyo** (with a subsidy). Requires notice of `noticeDays`,
  sets the agreed lapse rule, and keeps the borrower's right to prepay without penalty.
- **De la no alteración de la obligación del acreditado**. Exact text: "El apoyo del programa no
  modifica, reduce, sustituye ni condiciona la obligación del acreditado de pagar íntegramente
  capital, intereses y accesorios conforme a este contrato. Ni el programa ni la autoridad que lo
  opera son parte acreditante, fiadora ni avalista, salvo pacto expreso por escrito con facultades."
- **De la ausencia de respaldo gubernamental**. States that the acreditante is not a public body and
  that the program is not a guarantor of the credit or of its returns. With a public lender, the first
  sentence is left out and a review finding is raised.

## Findings

Findings are deterministic. Each message starts with "Blocking:" (fix the terms and draft again) or
"Review:" (does not block).

**0.1**

| Code | Kind | When |
|---|---|---|
| `UNSUPPORTED_CHAIN` | blocking | chain other than Solana |
| `INVALID_ADDRESS` | blocking | a party is not a valid Solana wallet that can sign |
| `SAME_PARTY` | blocking | both parties are the same wallet |
| `ZERO_PRINCIPAL` | blocking | principal is not a whole number of cents above zero |
| `AMOUNT_WORDS_MISMATCH` | blocking | the amount in words does not match the digits |
| `INVALID_RATE` | blocking | a rate is not a non-negative decimal |
| `HIGH_RATE_REVIEW` | review | ordinary rate above 36 % or moratory rate above 72 % a year |
| `INVALID_INSTALLMENTS` | blocking | bad installment count or periodicity |
| `DATE_ORDER` | blocking | dates are not real, or disbursement > first due > maturity |
| `SCHEDULE_OVERRUNS_MATURITY` | blocking | the last installment falls after maturity |
| `PENALTY_EXCEEDS_PRINCIPAL` | blocking | penalty above principal (CCF 1843) |
| `PROGRAM_RULES_UNHASHED` | review | program rules linked without SHA-256 |
| `ANNEX_WITHOUT_HASH` | blocking | an annex is not `name:sha256` |
| `ARBITRATION_WITH_PUBLIC_LENDER` | review | arbitration with a public lender |
| `PLAINTEXT_PERSONAL_DATA` | review | `encrypted: false` |

**0.2** adds the following findings, raised only when support is present:

| Code | Kind | When |
|---|---|---|
| `SUBSIDY_WITHOUT_PROGRAM` | blocking | an interest subsidy without `supportProgram` |
| `ELIGIBILITY_LETTER_UNHASHED` | blocking | the letter has no valid SHA-256 |
| `SUBSIDY_COVERS_PRINCIPAL` | blocking | the borrower rate or the subsidized share is above the contract rate (the subsidy would pay something other than ordinary interest) |
| `SUBSIDY_RATE_MISMATCH` | blocking | borrower rate plus subsidized share is not equal to the contract rate |
| `INVALID_RATE` | blocking | the subsidy lacks the borrower rate, or does not have exactly one of points and rate |
| `SUBSIDY_LAPSE_RULE_MISSING` | blocking | a subsidy without `subsidyLapseRule` or `noticeDays` |
| `INVALID_NOTICE_DAYS` | blocking | `noticeDays` outside 1 to 365 |
| `SUBSIDY_END_BEFORE_MATURITY` | review | the subsidy ends before maturity |
| `PROGRAM_RULES_UNHASHED` | review | `supportProgram.rulesUrl` without `rulesSha256` |
| `SUPPORT_DISCLAIMER_NOT_ACCEPTED` | review | `supportDisclaimerAccepted` is not true |
| `SUPPORT_WITH_PUBLIC_LENDER` | review | support clauses with a public or trust lender |
