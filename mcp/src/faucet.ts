/**
 * Devnet faucet: POST /api/faucet { address } sends 1,000 tMXN (devnet test
 * token, no value) to the wallet's associated token account, creating the
 * account if needed, in one transaction signed by the faucet key.
 *
 * The faucet key (FAUCET_KEYPAIR) holds only the issuing authority of the
 * fixed tMXN test token (FAUCET_ASSET_MINT) and the devnet SOL that pays fees
 * and account rent; it is never the pool admin key and is never logged.
 *
 * Limits are devnet-grade and in memory (forgotten on restart): one request per
 * wallet per 24 hours, 5 requests per client address per minute, and per UTC day
 * at most FAUCET_CLIENT_DAILY_LIMIT sends per client address (default 5) and
 * FAUCET_DAILY_LIMIT sends in total (default 200). Every send can pay the rent
 * of a new token account, so the daily caps bound what the faucet key can lose.
 * A send counts once it passes validation and the per-wallet check; a failed
 * send gives its place back.
 */
import type { Hono } from 'hono'
import {
  type Address,
  type KeyPairSigner,
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
import { TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync, getMintToInstruction } from '@solana-program/token'
import { isPartyAddress } from './engine/address'
import { clientAddress, createRateLimit } from './rate-limit'
import { readJsonObject } from './routes'

/** 1,000 tMXN at 6 decimals, in base units. */
export const FAUCET_AMOUNT = 1_000_000_000n
export const FAUCET_WINDOW_MS = 24 * 60 * 60 * 1000
export const DEFAULT_SOLANA_RPC_URL = 'https://api.devnet.solana.com'
const MAX_BODY_BYTES = 1024
const MAX_TRACKED_WALLETS = 10_000
const CONFIRM_ATTEMPTS = 30
const CONFIRM_INTERVAL_MS = 1_000
const DAY_MS = 24 * 60 * 60 * 1000
/** Sends per UTC day, all clients together. */
export const DEFAULT_FAUCET_DAILY_LIMIT = 200
/** Sends per UTC day from one client address. */
export const DEFAULT_FAUCET_CLIENT_DAILY_LIMIT = 5

/** A positive integer from the environment, else the default. */
function limitFrom(value: string | undefined, fallback: number): number {
  const n = Number(value?.trim())
  return Number.isSafeInteger(n) && n > 0 ? n : fallback
}

/** Sends the test tokens to `recipient` and resolves with the confirmed transaction signature. */
export type FaucetSender = (recipient: Address, assetMint: Address) => Promise<string>

export interface FaucetOptions {
  /** Replaces the network sender (tests). With a sender, only FAUCET_ASSET_MINT is required. */
  sender?: FaucetSender
  /** Clock in milliseconds (tests). */
  now?: () => number
  /** Environment to read (tests); defaults to process.env at request time. */
  env?: Record<string, string | undefined>
  /** Requests per client address per minute. */
  clientLimit?: number
}

interface FaucetConfig {
  assetMint: Address
  send: FaucetSender
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Decodes FAUCET_KEYPAIR (base64 of the 64-byte secret key) into a signer; null when malformed. */
async function faucetSigner(encoded: string): Promise<KeyPairSigner | null> {
  try {
    const bytes = Uint8Array.from(Buffer.from(encoded.trim(), 'base64'))
    if (bytes.length !== 64) return null
    return await createKeyPairSignerFromBytes(bytes)
  } catch {
    return null
  }
}

/** The network sender: idempotent token account creation plus the issue, one transaction, confirmed. */
function networkSender(signer: KeyPairSigner, rpcUrl: string): FaucetSender {
  const rpc = createSolanaRpc(rpcUrl)
  return async (recipient, assetMint) => {
    try {
      return await sendOnce(rpc, signer, recipient, assetMint)
    } catch (error) {
      // An RPC URL may carry a provider key: keep it out of the message that gets logged.
      throw new Error((error instanceof Error ? error.message : 'unknown error').split(rpcUrl).join('<rpc>'))
    }
  }
}

async function sendOnce(rpc: ReturnType<typeof createSolanaRpc>, signer: KeyPairSigner, recipient: Address, assetMint: Address): Promise<string> {
  const [token] = await findAssociatedTokenPda({ owner: recipient, mint: assetMint, tokenProgram: TOKEN_PROGRAM_ADDRESS })
  const instructions = [
    await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: signer, owner: recipient, mint: assetMint }),
    getMintToInstruction({ mint: assetMint, token, mintAuthority: signer, amount: FAUCET_AMOUNT }),
  ]
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send()
  const tx = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      m => setTransactionMessageFeePayerSigner(signer, m),
      m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      m => appendTransactionMessageInstructions(instructions, m),
    ),
  )
  const signature = getSignatureFromTransaction(tx)
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: 'base64', preflightCommitment: 'confirmed' }).send()
  for (let i = 0; i < CONFIRM_ATTEMPTS; i++) {
    await sleep(CONFIRM_INTERVAL_MS)
    const {
      value: [status],
    } = await rpc.getSignatureStatuses([signature]).send()
    if (status?.err) throw new Error(`transaction ${signature} failed`)
    if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return signature
  }
  throw new Error(`transaction ${signature} not confirmed in time`)
}

export interface Faucet {
  mount: (app: Hono) => void
  reset: () => void
}

export function createFaucet(options: FaucetOptions = {}): Faucet {
  const now = options.now ?? Date.now
  /** Wallet address -> time (ms) after which it may ask again. Devnet-grade: in memory, lost on restart. */
  const nextAllowed = new Map<string, number>()
  const clientLimiter = createRateLimit({ limit: options.clientLimit ?? 5 })
  /** Sends counted for the current UTC day: in total and per client address. */
  let day = -1
  let dayTotal = 0
  const dayByClient = new Map<string, number>()
  function today(at: number): void {
    const current = Math.floor(at / DAY_MS)
    if (current !== day) {
      day = current
      dayTotal = 0
      dayByClient.clear()
    }
  }
  /** The network sender, built once per FAUCET_KEYPAIR and SOLANA_RPC_URL pair. */
  let cached: { key: string; send: FaucetSender } | null = null

  async function config(): Promise<FaucetConfig | null> {
    const env = options.env ?? process.env
    const assetMint = env.FAUCET_ASSET_MINT?.trim()
    if (!assetMint || !isPartyAddress(assetMint)) return null
    if (options.sender) return { assetMint: address(assetMint), send: options.sender }
    const secret = env.FAUCET_KEYPAIR
    if (!secret) return null
    const rpcUrl = env.SOLANA_RPC_URL?.trim() || DEFAULT_SOLANA_RPC_URL
    const cacheKey = `${secret}\n${rpcUrl}`
    if (cached?.key !== cacheKey) {
      const signer = await faucetSigner(secret)
      if (!signer) return null
      cached = { key: cacheKey, send: networkSender(signer, rpcUrl) }
    }
    return { assetMint: address(assetMint), send: cached.send }
  }

  return {
    reset: () => {
      nextAllowed.clear()
      clientLimiter.reset()
      day = -1
      dayTotal = 0
      dayByClient.clear()
    },
    mount: app => {
      // POST only, so CORS preflights (answered by the /api/* cors middleware) do not use the budget.
      app.post('/api/faucet', clientLimiter.middleware, async c => {
        const faucet = await config()
        if (!faucet) {
          console.error('faucet: not configured (FAUCET_ASSET_MINT and a valid FAUCET_KEYPAIR are required)')
          return c.json({ error: 'Test tokens are not available right now.' }, 503)
        }
        const body = await readJsonObject(c.req.raw, MAX_BODY_BYTES)
        if (!body.ok) return c.json({ error: body.error }, body.status)
        const wallet = body.value.address
        if (typeof wallet !== 'string' || !isPartyAddress(wallet)) {
          return c.json({ error: 'address must be a Solana wallet address (base58)' }, 400)
        }

        const at = now()
        if (nextAllowed.size > MAX_TRACKED_WALLETS) {
          for (const [key, until] of nextAllowed) if (until <= at) nextAllowed.delete(key)
        }
        const until = nextAllowed.get(wallet)
        if (until !== undefined && until > at) {
          const retryAfterSeconds = Math.ceil((until - at) / 1000)
          c.header('Retry-After', String(retryAfterSeconds))
          return c.json({ error: 'This wallet already received test tokens today.', retryAfterSeconds }, 429)
        }
        // Daily caps, per client address and in total, until the next UTC midnight.
        const env = options.env ?? process.env
        const client = clientAddress(c)
        today(at)
        const untilMidnight = Math.ceil(((day + 1) * DAY_MS - at) / 1000)
        if ((dayByClient.get(client) ?? 0) >= limitFrom(env.FAUCET_CLIENT_DAILY_LIMIT, DEFAULT_FAUCET_CLIENT_DAILY_LIMIT)) {
          c.header('Retry-After', String(untilMidnight))
          return c.json({ error: 'This connection reached the daily limit for test tokens.', retryAfterSeconds: untilMidnight }, 429)
        }
        if (dayTotal >= limitFrom(env.FAUCET_DAILY_LIMIT, DEFAULT_FAUCET_DAILY_LIMIT)) {
          c.header('Retry-After', String(untilMidnight))
          return c.json({ error: 'The faucet reached its daily limit for test tokens.', retryAfterSeconds: untilMidnight }, 429)
        }

        // Reserved before sending so concurrent requests for one wallet send once, and concurrent
        // requests cannot pass the daily caps; released on failure.
        nextAllowed.set(wallet, at + FAUCET_WINDOW_MS)
        const countedDay = day
        dayTotal += 1
        dayByClient.set(client, (dayByClient.get(client) ?? 0) + 1)
        try {
          const signature = await faucet.send(address(wallet), faucet.assetMint)
          return c.json({ signature, amount: FAUCET_AMOUNT.toString(), mint: faucet.assetMint })
        } catch (error) {
          nextAllowed.delete(wallet)
          if (day === countedDay) {
            dayTotal = Math.max(0, dayTotal - 1)
            const used = (dayByClient.get(client) ?? 1) - 1
            if (used > 0) dayByClient.set(client, used)
            else dayByClient.delete(client)
          }
          console.error(`faucet: send failed: ${error instanceof Error ? error.message : 'unknown error'}`)
          return c.json({ error: 'Could not send test tokens. Try again in a minute.' }, 502)
        }
      })
    },
  }
}
