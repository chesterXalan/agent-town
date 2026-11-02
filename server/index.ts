import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'
import { createSource, DEFAULT_HELPER, readSessions } from './source'

const port = Number(process.env.AGENT_TOWN_PORT ?? 2510)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AGENT_TOWN_PORT must be 1024–65535')
const helper = process.env.AGENT_TOWN_HELPER ?? DEFAULT_HELPER
const app = createApp(createSource(() => readSessions(helper)))
const root = fileURLToPath(new URL('../dist', import.meta.url))
app.get('/*', serveStatic({ root }))
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(`Agent Town: http://localhost:${port}`)
})
function shutdown() {
  server.close()
  if ('closeAllConnections' in server) server.closeAllConnections()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
