// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCATION_MAX_AGE_MS, LOCATION_REFRESH_MS } from '../shared/location'
import { createLocationService } from './location'
import { createApp } from './app'

const place = {
  success: true,
  city: 'Taipei',
  region: 'Taipei',
  country: 'Taiwan',
  latitude: 25.03,
  longitude: 121.56,
  timezone: { id: 'Asia/Taipei' },
  ip: '192.0.2.1',
  connection: { isp: 'Fixture network' },
}
const response = (value: unknown) => new Response(JSON.stringify(value))
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T04:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('network location', () => {
  it('deduplicates requests, caches for an hour, and strips IP/network metadata', async () => {
    let finish!: (response: Response) => void
    const request = vi.fn<typeof fetch>().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const service = createLocationService(request)
    const first = service.read()
    const second = service.read()
    finish(response(place))
    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(a.city.name).toBe('Taipei')
    expect(JSON.stringify(a)).not.toContain(place.ip)
    expect(JSON.stringify(a)).not.toContain('Fixture network')
    expect(await service.read()).toEqual(a)
    expect(request).toHaveBeenCalledTimes(1)
    const url = new URL(String(request.mock.calls[0][0]))
    expect(url.origin).toBe('https://ipwho.is')
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('fields')?.split(',')).not.toContain('ip')
    vi.advanceTimersByTime(LOCATION_REFRESH_MS)
    request.mockResolvedValueOnce(
      response({ ...place, city: 'Tokyo', longitude: 139.69, latitude: 35.68, timezone: { id: 'Asia/Tokyo' } }),
    )
    expect((await service.read()).city.name).toBe('Tokyo')
  })

  it('supports explicit refresh without allowing rapid requests to bypass the cooldown', async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => response(place))
    const service = createLocationService(request)
    await service.read()
    await service.read(true)
    expect(request).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    await service.read(true)
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('labels retained estimates stale, backs off, retries, and expires estimates after a day', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response(place))
    const service = createLocationService(request)
    const original = await service.read()
    request.mockRejectedValue(new Error('Offline'))
    vi.advanceTimersByTime(10_000)
    expect(await service.read(true)).toEqual({ ...original, stale: true })
    await service.read(true)
    expect(request).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(60_000)
    await service.read()
    expect(request).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(LOCATION_MAX_AGE_MS)
    await expect(service.read()).rejects.toThrow('Network location unavailable')
  })

  it.each([
    null,
    { ...place, success: false },
    { ...place, city: '' },
    { ...place, latitude: 100 },
    { ...place, timezone: { id: 'Invalid/zone' } },
  ])('rejects incomplete or unsuccessful estimates', async (body) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(body))
    const service = createLocationService(request)
    await expect(service.read()).rejects.toThrow('Network location unavailable')
    await expect(service.read(true)).rejects.toThrow('Network location unavailable')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('uses the local API boundary and returns only a sanitized failure', async () => {
    const location = { read: vi.fn().mockResolvedValue({ city: { name: 'Taipei' } }) }
    const app = createApp(undefined, undefined, location)
    expect((await app.request('http://foreign.invalid/api/location')).status).toBe(403)
    expect((await app.request('http://localhost/api/location?refresh=bad')).status).toBe(400)
    expect(location.read).not.toHaveBeenCalled()
    expect((await app.request('http://localhost/api/location')).status).toBe(200)
    expect(location.read).toHaveBeenLastCalledWith(false)
    expect((await app.request('http://localhost/api/location?refresh=1')).status).toBe(200)
    expect(location.read).toHaveBeenLastCalledWith(true)
    location.read.mockRejectedValue(new Error('Private provider details'))
    const failure = await app.request('http://localhost/api/location')
    expect(failure.status).toBe(502)
    expect(await failure.text()).not.toContain('Private provider details')
  })
})
