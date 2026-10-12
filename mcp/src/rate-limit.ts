/**
 * Per-client-address limits for the public agreement routes (sign page reads,
 * signature posts, anchor posts, evidence downloads). In-memory; the agreement
 * id is already an unguessable capability, this only bounds abuse of the
 * endpoints themselves.
 */
import type { Context, Next } from 'hono'

const DEFAULT_WINDOW_MS = 60 * 1000

export interface RateLimiter {
  middleware: (c: Context, next: Next) => Promise<Response | void>
  reset: () => void
}

/**
 * The client address a request is counted under: the first `x-forwarded-for` entry, else
 * `x-real-ip`, else "unknown". Only meaningful behind a proxy that overwrites those headers.
 */
export function clientAddress(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
}

export function createRateLimit(options: { limit: number; windowMs?: number }): RateLimiter {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS
  const windows = new Map<string, { count: number; resetAt: number }>()
  return {
    reset: () => {
      windows.clear()
    },
    middleware: (c, next) => {
      const client = clientAddress(c)
      const now = Date.now()
      if (windows.size > 10_000) {
        for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key)
      }
      const entry = windows.get(client)
      if (!entry || entry.resetAt <= now) {
        windows.set(client, { count: 1, resetAt: now + windowMs })
      } else {
        entry.count += 1
        if (entry.count > options.limit) {
          c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
          return Promise.resolve(c.json({ error: `Rate limit exceeded: ${options.limit} requests/min` }, 429))
        }
      }
      return next()
    },
  }
}

const agreementLimiter = createRateLimit({ limit: 60 })

export function resetAgreementRateLimits(): void {
  agreementLimiter.reset()
}

export const agreementRateLimit = agreementLimiter.middleware
