/**
 * This package is Solana only and credit first. The source, scripts, tests and
 * README must not name another chain or its tooling, nor carry an address of
 * another chain; the source, scripts and README keep the product vocabulary.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

function files(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap(name => {
    const path = join(dir, name)
    return statSync(join(ROOT, path)).isDirectory() ? files(path) : [path]
  })
}

const SHIPPED = [...files('src'), ...files('scripts'), ...files('docs'), 'README.md', '.env.example', 'package.json']
const ALL = [...SHIPPED, ...files('test')]

/** Other chains and their tooling, in any case. Built from fragments so this file never contains the words it bans and can scan itself. */
const CHAIN_TERMS = ['polka' + 'dot', 'pa' + 'seo', 'pal' + 'let', '\\bpa' + 'pi\\b', '\\be' + 'vm\\b']
const CHAIN_WORDS = new RegExp(CHAIN_TERMS.join('|'), 'i')
/** A 20-byte hex account (the address shape of other chains); 32-byte hashes are allowed. */
const HEX_ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/
/** Words the product copy does not use. */
const PRODUCT_WORDS = /licens|\bmint|\bnft|dividend|stablecoin|\bbacked\b|guarantee/i
/** The intellectual-property acronym, as copy (the HTTP header x-real-ip is not copy). */
const IP_ACRONYM = /\bIP\b/

function hits(paths: string[], pattern: RegExp): string[] {
  return paths.flatMap(path =>
    readFileSync(join(ROOT, path), 'utf8')
      .split('\n')
      .map((line, index) => (pattern.test(line) ? `${path}:${index + 1}: ${line.trim()}` : null))
      .filter((hit): hit is string => hit !== null),
  )
}

describe('vocabulary', () => {
  test('the scan covers the source, scripts, tests (this file included) and README', () => {
    expect(ALL).toEqual(expect.arrayContaining(['src/mcp/server.ts', 'src/engine/credit-agreement.ts', 'scripts/create-key.ts', 'README.md', 'test/mcp.test.ts']))
  })

  test('no other chain or its tooling is named anywhere in the package', () => {
    expect(hits(ALL, CHAIN_WORDS)).toEqual([])
  })

  test('no 20-byte hex address appears anywhere in the package', () => {
    expect(hits(ALL, HEX_ADDRESS)).toEqual([])
  })

  test('shipped source, scripts and README keep the product vocabulary', () => {
    expect(hits(SHIPPED, PRODUCT_WORDS)).toEqual([])
    expect(hits(SHIPPED, IP_ACRONYM)).toEqual([])
  })

  test('the patterns catch what they are meant to catch', () => {
    expect(CHAIN_WORDS.test('Polka' + 'dot Hub')).toBe(true)
    expect(CHAIN_WORDS.test('the E' + 'VM')).toBe(true)
    expect(HEX_ADDRESS.test(`0x${'ab'.repeat(20)}`)).toBe(true)
    expect(HEX_ADDRESS.test(`0x${'ab'.repeat(32)}`)).toBe(false)
    expect(PRODUCT_WORDS.test('an NFT')).toBe(true)
    expect(PRODUCT_WORDS.test('licensee')).toBe(true)
    expect(IP_ACRONYM.test('an IP record')).toBe(true)
  })
})
