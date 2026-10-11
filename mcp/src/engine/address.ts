const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

/** The Solana system program: a syntactically valid public key that can never be a party. */
const SOLANA_SYSTEM_PROGRAM = '11111111111111111111111111111111'

/** A Solana public key is exactly 32 decoded bytes, not merely a base58-looking string. */
export function isValidAddress(value: string): boolean {
  if (typeof value !== 'string' || value.length < 32 || value.length > 44) return false
  let decoded = 0n
  for (const char of value) {
    const digit = BASE58.indexOf(char)
    if (digit < 0) return false
    decoded = decoded * 58n + BigInt(digit)
  }
  let bytes = 0
  while (decoded > 0n) {
    decoded >>= 8n
    bytes++
  }
  const leadingZeroes = value.match(/^1*/)?.[0].length ?? 0
  return leadingZeroes + bytes === 32
}

/** A usable party wallet: a valid public key that is not the system program. */
export function isPartyAddress(value: string): boolean {
  return isValidAddress(value) && value !== SOLANA_SYSTEM_PROGRAM
}

/** Base58 is case-sensitive: addresses compare exactly. */
export function sameAddress(left?: string | null, right?: string | null): boolean {
  if (!left || !right) return false
  return left === right
}
