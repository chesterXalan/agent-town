// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createApp } from './app'
const snapshot = { sessions: [], source: 'ready' as const, updatedAt: '2026-01-01T00:00:00Z' }
const app = () => createApp({ refresh: async () => snapshot })
describe('local API boundary', () => {
  it('serves metadata without cache or CORS permission', async () => {
    const response = await app().request('http://127.0.0.1/api/town')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(snapshot)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
  it.each([
    ['http://attacker.invalid/api/town', {}],
    ['http://localhost/api/town', { Origin: 'https://attacker.invalid' }],
    ['http://localhost/api/town', { Origin: 'null' }],
    ['http://localhost/api/town', { 'Sec-Fetch-Site': 'cross-site' }],
  ])('rejects foreign hosts and origins', async (url, headers) => {
    expect((await app().request(url, { headers })).status).toBe(403)
  })
  it('rejects mutation requests', async () => {
    expect((await app().request('http://localhost/api/town', { method: 'POST' })).status).toBe(405)
  })
  it('streams an initial snapshot and releases the connection on cancellation', async () => {
    const response = await app().request('http://localhost/api/events')
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toContain('event: town')
    await reader.cancel()
  })
})
