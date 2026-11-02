import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createSource } from './source'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
export function createApp(source = createSource()) {
  const app = new Hono()
  let streams = 0
  app.use('*', async (c, next) => {
    if (!LOCAL_HOSTS.has(new URL(c.req.url).hostname)) return c.text('Local access only', 403)
    const origin = c.req.header('Origin')
    if (origin) {
      try {
        const url = new URL(origin)
        if (!LOCAL_HOSTS.has(url.hostname) || url.protocol !== 'http:') return c.text('Local access only', 403)
      } catch {
        return c.text('Invalid origin', 403)
      }
    }
    if (c.req.header('Sec-Fetch-Site') === 'cross-site') return c.text('Local access only', 403)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('X-Frame-Options', 'DENY')
    c.header('Referrer-Policy', 'no-referrer')
    if (c.req.path.startsWith('/api/')) c.header('Cache-Control', 'no-store')
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return c.text('Read-only service', 405)
    await next()
  })
  app.get('/api/town', async (c) => c.json(await source.refresh()))
  app.get('/api/events', (c) => {
    if (streams >= 8) return c.text('Too many event streams', 429)
    streams++
    return streamSSE(c, async (stream) => {
      let signature = ''
      let stop: (() => void) | undefined
      stream.onAbort(() => stop?.())
      try {
        while (!stream.aborted && !stream.closed) {
          const snapshot = await source.refresh()
          const next = JSON.stringify([snapshot.source, snapshot.sessions])
          if (next !== signature) {
            await stream.writeSSE({ event: 'town', data: JSON.stringify(snapshot) })
            signature = next
          } else await stream.writeSSE({ event: 'heartbeat', data: snapshot.updatedAt })
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2000)
            stop = () => {
              clearTimeout(timer)
              resolve()
            }
            if (stream.aborted || stream.closed) stop()
          })
        }
      } finally {
        stop?.()
        streams--
      }
    })
  })
  return app
}
