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

/**
 * Files whose code must name the token program's own identifiers (`mint:`,
 * `mintAuthority`, `AuthorityType.MintTokens`, the faucet response key). Only
 * their comments and string literals are held to the product vocabulary.
 */
const TOKEN_PROGRAM_FILES = ['src/faucet.ts', 'scripts/faucet-authority.ts']
/** The one technical README sentence allowed to name the faucet response key. */
const README_FAUCET_RESPONSE =
  'The answer is `{ "signature": "<base58>", "amount": "1000000000", "mint": "<tMXN address>" }`: `amount` is in base units, as a string; `mint` is the token program\'s name for the test token address.'

/**
 * A regex literal in code: a slash right after `=`, `(`, `,`, `:`, `!`, `&`, `|`, `?`, `{`, `}`, `;`
 * or `return`. The tokenizer below does not understand regex literals (a quote inside one would be
 * read as the start of a string), so the token program files must not contain any.
 */
const REGEX_LITERAL = /(?:^|[=(,:!&|?{};]|\breturn)\s*\/(?![/*])(?:\\.|[^/\\\n])+\/[dgimsuy]*/
const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*)/

/** Keeps the comments and string literals of TypeScript source and blanks the code around them, keeping line numbers. */
function proseOf(source: string): string {
  const tokens = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`|[^/'"`]+|[/'"`]/g
  return source.replace(tokens, token => (/^(?:\/[/*]|['"`])/.test(token) ? token : token.replace(/[^\n]/g, ' ')))
}

function productHits(path: string): string[] {
  const raw = readFileSync(join(ROOT, path), 'utf8')
  const text = TOKEN_PROGRAM_FILES.includes(path) ? proseOf(raw) : raw
  return text
    .split('\n')
    .map((line, index) => (PRODUCT_WORDS.test(line) && !(path === 'README.md' && line === README_FAUCET_RESPONSE) ? `${path}:${index + 1}: ${line.trim()}` : null))
    .filter((hit): hit is string => hit !== null)
}

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
    expect(SHIPPED.flatMap(productHits)).toEqual([])
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

  test('token program files contain no regex literal (the prose tokenizer cannot read them)', () => {
    const literals = TOKEN_PROGRAM_FILES.flatMap(path =>
      readFileSync(join(ROOT, path), 'utf8')
        .split('\n')
        .map((line, index) => (!COMMENT_LINE.test(line) && REGEX_LITERAL.test(line) ? `${path}:${index + 1}: ${line.trim()}` : null))
        .filter((hit): hit is string => hit !== null),
    )
    expect(literals).toEqual([])
    expect(REGEX_LITERAL.test("const p = x.replace(/^~/, 'home')")).toBe(true)
    expect(REGEX_LITERAL.test("const quote = /'/")).toBe(true)
    expect(REGEX_LITERAL.test("const url = 'https://api.devnet.solana.com'")).toBe(false)
    expect(REGEX_LITERAL.test('const half = a / b / c')).toBe(false)
    expect(COMMENT_LINE.test(' * POST /api/faucet { address }')).toBe(true)
  })

  test('token program files: identifiers pass, comments and strings are still scanned', () => {
    expect(TOKEN_PROGRAM_FILES.every(path => SHIPPED.includes(path))).toBe(true)
    const word = 'mi' + 'nt'
    expect(PRODUCT_WORDS.test(proseOf(`call({ ${word}: x, ${word}Authority: y })`))).toBe(false)
    expect(PRODUCT_WORDS.test(proseOf(`const a = 1 // the ${word}`))).toBe(true)
    expect(PRODUCT_WORDS.test(proseOf(`/* the ${word} */ const a = 1`))).toBe(true)
    expect(PRODUCT_WORDS.test(proseOf(`c.json({ error: '${word} failed' })`))).toBe(true)
    expect(PRODUCT_WORDS.test(proseOf(`c.json({ error: "${word} failed" })`))).toBe(true)
    expect(PRODUCT_WORDS.test(proseOf('log(`' + word + ' ${x}`)'))).toBe(true)
    expect(proseOf('a\nb // c\nd').split('\n')).toHaveLength(3)
  })
})
