/**
 * The HTTP surface: the MCP endpoint (/mcp, API key) and the public agreement
 * routes the sign page uses (/api/agreements/*), and the devnet faucet
 * (/api/faucet). Built separately from the listener so tests can drive it with
 * app.request().
 */
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createFaucet, type FaucetOptions } from './faucet'
import { mountMcp, type McpMountOptions } from './mcp/route'
import { mountAgreementRoutes } from './routes'

/** Origins allowed to call the public agreement routes: CORS_ORIGINS (comma-separated), else the origin of APP_BASE_URL. */
export function allowedOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  if (configured.length > 0) return configured
  return [new URL(process.env.APP_BASE_URL ?? 'https://app.soft.law').origin]
}

export interface AppOptions extends McpMountOptions {
  /** Devnet faucet options (tests inject a sender and a clock). */
  faucet?: FaucetOptions
}

export function createApp(options: AppOptions = {}): Hono {
  const { faucet, ...mcpOptions } = options
  const app = new Hono()
  app.use('/api/*', cors({ origin: allowedOrigins() }))
  app.get('/health', c => c.json({ ok: true }))
  mountMcp(app, mcpOptions)
  mountAgreementRoutes(app)
  createFaucet(faucet).mount(app)
  return app
}
