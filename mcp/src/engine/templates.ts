import { CREDIT_AGREEMENT_TEMPLATE } from './credit-agreement'
import { CREDIT_AGREEMENT_TEMPLATE_V02 } from './credit-support'
import type { ChainId } from './types'

export interface TemplateField {
  name: string
  type: 'string' | 'address' | 'integer' | 'boolean' | 'enum' | 'string[]' | 'object'
  required: boolean
  description: string
  options?: readonly string[]
}

/** The on-chain act that records documents of this template, and which role executes it with their wallet. */
export interface TemplateAnchor {
  kind: 'registerCreditAgreement'
  executor: string
}

export const TEMPLATE_FAMILIES = ['credit'] as const
export type TemplateFamily = (typeof TEMPLATE_FAMILIES)[number]

/**
 * A template is data: who wrote it, for which law, which version, what it
 * was reviewed for, which chains can record it, and the typed fields a draft
 * needs. The prose lives in the generator registered under `id`.
 */
export interface AgreementTemplate {
  id: string
  version: string
  title: string
  family: TemplateFamily
  /** Signing roles, in the order they are listed to the parties. */
  roles: string[]
  anchor: TemplateAnchor
  jurisdiction: string[]
  author: string
  reviewScope: string
  chains: ChainId[]
  status: 'pilot' | 'reviewed'
  fields: TemplateField[]
}

export const TEMPLATES: readonly AgreementTemplate[] = [CREDIT_AGREEMENT_TEMPLATE, CREDIT_AGREEMENT_TEMPLATE_V02]

export function listTemplates(filter: { family?: TemplateFamily } = {}): AgreementTemplate[] {
  return TEMPLATES.filter(template => !filter.family || template.family === filter.family)
}

export function getTemplate(id: string, version?: string): AgreementTemplate | undefined {
  return TEMPLATES.find(template => template.id === id && (!version || template.version === version))
}
