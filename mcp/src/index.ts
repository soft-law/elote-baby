/**
 * Entry point: opens the agreements store (AGREEMENTS_DB) and serves the MCP
 * endpoint and the public agreement routes. Keys are created separately with
 * `bun run create-key`; this process never prints or creates one.
 */
import { createApp } from './app'
import { closeAgreementsStore, initAgreementsStore } from './store'

initAgreementsStore()
const app = createApp()
const port = Number(process.env.PORT ?? 3010)
const hostname = process.env.HOST ?? '127.0.0.1'
const server = Bun.serve({ port, hostname, fetch: app.fetch })
console.log(`elote agreements MCP on http://${hostname}:${server.port}/mcp`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.stop()
    closeAgreementsStore()
    process.exit(0)
  })
}
