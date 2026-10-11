/**
 * Creates an MCP API key for an account (tenant) in AGREEMENTS_DB and prints
 * the plaintext once. Only its sha256 digest is stored; a lost key cannot be
 * recovered, only replaced.
 *
 *   AGREEMENTS_DB=elote-agreements.db bun run create-key <tenant> [label]
 */
import { ApiKeyLimitError, insertApiKey } from '../src/api-keys'
import { closeAgreementsStore, initAgreementsStore } from '../src/store'

const [tenant, label = 'cli'] = process.argv.slice(2)
if (!tenant || !/^[A-Za-z0-9:._@-]{1,128}$/.test(tenant)) {
  console.error('usage: bun run create-key <tenant> [label]   (tenant: 1 to 128 of A-Z a-z 0-9 : . _ @ -)')
  process.exit(2)
}
initAgreementsStore()
try {
  const key = insertApiKey({ tenant, label: label.slice(0, 100) })
  console.log(`tenant: ${tenant}`)
  console.log(`key id: ${key.id} (prefix ${key.prefix})`)
  console.log('API key, shown once; send it as "Authorization: Bearer <key>":')
  console.log(key.plaintext)
} catch (error) {
  if (error instanceof ApiKeyLimitError) {
    console.error(error.message)
    process.exit(1)
  }
  throw error
} finally {
  closeAgreementsStore()
}
