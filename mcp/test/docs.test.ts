/**
 * The sample contracts in docs/contracts are the engine's own output: this
 * test re-renders them and fails when a template change is not reflected.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SAMPLE_V01, SAMPLE_V02, renderSamples } from '../scripts/render-sample-contracts'
import { checkCreditAgreementDraft, checkCreditAgreementV02Draft, NO_ALTERATION_CLAUSE } from '../src/engine'

const DIR = join(import.meta.dir, '..', 'docs', 'contracts')

describe('sample contracts', () => {
  test('docs/contracts matches what the engine renders (run bun run render-samples)', () => {
    for (const [name, text] of Object.entries(renderSamples())) {
      expect(readFileSync(join(DIR, name), 'utf8')).toBe(text)
    }
  })

  test('each sample is marked as a pilot sample, carries the claims and drafts clean', () => {
    const samples = renderSamples()
    for (const text of Object.values(samples)) {
      expect(text.startsWith('> **Sample, pilot template under legal review.**')).toBe(true)
      expect(text).toContain('Demo on Solana devnet with test assets. Not an offer of securities.')
    }
    expect(samples['credit-agreement-0.2.md']).toContain(NO_ALTERATION_CLAUSE)
    expect(samples['credit-agreement-0.1.md']).not.toContain('Del apoyo a la tasa de interés')
    expect(checkCreditAgreementDraft(SAMPLE_V01)).toEqual([])
    expect(checkCreditAgreementV02Draft(SAMPLE_V02)).toEqual([])
  })
})
