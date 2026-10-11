/**
 * Moves the issuing authority of the published tMXN test token to the faucet
 * key, so the faucet server can send test tokens without ever holding the
 * pool admin key. Run once by the owner, against the fixed test token, before
 * the faucet is enabled:
 *
 *   bun run scripts/faucet-authority.ts \
 *     --asset <tMXN token address> \
 *     --new-authority <faucet public key> \
 *     --authority-keypair <path to the current authority's 64-byte JSON keypair> \
 *     [--rpc https://api.devnet.solana.com]
 *
 * The current authority pays the fee and signs. The faucet secret is never
 * read here: pass only its public key. Nothing secret is printed. The change
 * cannot be undone by this script; only the new authority can move it again.
 *
 * Devnet demo with test assets. Not an offer of securities.
 */
import fs from 'node:fs'
import os from 'node:os'
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit'
import { AuthorityType, getSetAuthorityInstruction } from '@solana-program/token'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function required(name: string): string {
  const value = arg(name)
  if (!value) {
    console.error(`missing --${name}`)
    process.exit(1)
  }
  return value
}

const asset = address(required('asset'))
const newAuthority = address(required('new-authority'))
const keypairArg = required('authority-keypair')
// A leading ~ means the home directory. No regex literals in this file: see test/vocabulary.test.ts.
const keypairPath = keypairArg.startsWith('~') ? os.homedir() + keypairArg.slice(1) : keypairArg
const rpcUrl = arg('rpc') ?? process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'

const current = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8'))))
const rpc = createSolanaRpc(rpcUrl)

console.log(`test token    ${asset}\ncurrent       ${current.address}\nnew authority ${newAuthority}\nRPC host      ${new URL(rpcUrl).host}`)

const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
const tx = await signTransactionMessageWithSigners(
  pipe(
    createTransactionMessage({ version: 0 }),
    m => setTransactionMessageFeePayerSigner(current, m),
    m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    m => appendTransactionMessageInstructions([getSetAuthorityInstruction({ owned: asset, owner: current, authorityType: AuthorityType.MintTokens, newAuthority })], m),
  ),
)
const signature = getSignatureFromTransaction(tx)
await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: 'base64', preflightCommitment: 'confirmed' }).send()
for (let i = 0; i < 60; i++) {
  await new Promise(resolve => setTimeout(resolve, 1_000))
  const {
    value: [status],
  } = await rpc.getSignatureStatuses([signature]).send()
  if (status?.err) throw new Error(`set authority failed (${signature}): ${JSON.stringify(status.err)}`)
  if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
    console.log(`authority moved\n  ${signature}\n  https://explorer.solana.com/tx/${signature}?cluster=devnet`)
    process.exit(0)
  }
}
throw new Error(`set authority not confirmed in time (${signature})`)
