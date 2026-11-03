import { serveStatic } from '@hono/bun'
import { fileURLToPath } from 'node:url'
import { createApp } from './app'
import { createSource, DEFAULT_HELPER, readSessions } from './source'

const port = Number(process.env.AGENT_TOWN_PORT ?? 2510)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AGENT_TOWN_PORT must be 1024–65535')
const helper = process.env.AGENT_TOWN_HELPER ?? DEFAULT_HELPER
const app = createApp(createSource(() => readSessions(helper)))
const root = fileURLToPath(new URL('../dist', import.meta.url))
app.get('/*', serveStatic({ root }))
const server = Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(request, server) {
    if (new URL(request.url).pathname === '/api/events') server.timeout(request, 0)
    return app.fetch(request)
  },
})
console.log(`Agent Town: http://localhost:${port}`)
function shutdown() {
  void server.stop(true)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
