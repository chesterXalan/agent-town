// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWeatherService } from './weather'
import { createApp } from './app'
import { WEATHER_MAX_AGE_MS, WEATHER_REFRESH_MS } from '../shared/weather'

const city = {
  id: 1,
  name: 'Taipei',
  country: 'Taiwan',
  admin1: 'Taipei',
  latitude: 25.03,
  longitude: 121.56,
  timezone: 'Asia/Taipei',
}
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const forecast = (code = 61) => response({ current: { time: Math.floor(Date.now() / 1000), weather_code: code } })
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-02T04:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('weather provider', () => {
  it('shares concurrent requests and caches the same coordinates for 15 minutes', async () => {
    let resolve!: (value: Response) => void
    const request = vi.fn<typeof fetch>().mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const service = createWeatherService(request)
    const first = service.read(25.03, 121.56)
    const second = service.read(25.03, 121.56)
    resolve(forecast())
    const [a, b] = await Promise.all([first, second])
    expect(a).toEqual(b)
    expect(a.weather).toBe('rain')
    expect(a.stale).toBe(false)
    expect(await service.read(25.03, 121.56)).toEqual(a)
    expect(request).toHaveBeenCalledTimes(1)
    const url = new URL(String(request.mock.calls[0][0]))
    expect(url.origin).toBe('https://api.open-meteo.com')
    expect(url.searchParams.get('current')).toBe('weather_code')
    vi.advanceTimersByTime(WEATHER_REFRESH_MS)
    request.mockResolvedValueOnce(forecast(3))
    expect((await service.read(25.03, 121.56)).weather).toBe('cloudy')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('labels retained data stale on failure, backs off, and never reuses it for another city', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(forecast())
    const service = createWeatherService(request)
    const initial = await service.read(25.03, 121.56)
    vi.advanceTimersByTime(WEATHER_REFRESH_MS)
    request.mockRejectedValue(new Error('Offline'))
    expect(await service.read(25.03, 121.56)).toEqual({ ...initial, stale: true })
    await service.read(25.03, 121.56)
    expect(request).toHaveBeenCalledTimes(2)
    await expect(service.read(35.68, 139.69)).rejects.toThrow('Weather provider unavailable')
    vi.advanceTimersByTime(WEATHER_MAX_AGE_MS)
    await expect(service.read(25.03, 121.56)).rejects.toThrow('Weather provider unavailable')
  })

  it.each([
    undefined,
    null,
    { current: { time: 1, weather_code: 0 } },
    { current: { time: 1793592000, weather_code: 404 } },
  ])('rejects malformed, expired, or unknown conditions', async (body) => {
    const service = createWeatherService(vi.fn<typeof fetch>().mockResolvedValue(response(body)))
    await expect(service.read(25, 121)).rejects.toThrow('Weather provider unavailable')
  })

  it('filters invalid geocoding results and requests the selected language', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ results: [city, { ...city, timezone: 'invalid/zone' }, { ...city, latitude: 100 }] }),
      )
    const cities = await createWeatherService(request).search('Taipei', 'zh')
    expect(cities).toEqual([{ ...city, admin1: undefined, region: 'Taipei' }])
    const url = new URL(String(request.mock.calls[0][0]))
    expect(url.origin).toBe('https://geocoding-api.open-meteo.com')
    expect(url.searchParams.get('language')).toBe('zh')
  })
})

describe('weather API boundary', () => {
  it('validates input before contacting a provider and keeps the local-only boundary', async () => {
    const weather = { search: vi.fn().mockResolvedValue([]), read: vi.fn().mockResolvedValue({ weather: 'clear' }) }
    const app = createApp(undefined, weather)
    for (const query of ['', '?latitude=&longitude=1', '?latitude=NaN&longitude=1', '?latitude=91&longitude=0']) {
      expect((await app.request(`http://localhost/api/weather${query}`)).status).toBe(400)
    }
    expect(weather.read).not.toHaveBeenCalled()
    expect((await app.request('http://localhost/api/cities?q=a')).status).toBe(400)
    expect((await app.request('http://localhost/api/cities?q=Taipei&language=invalid')).status).toBe(400)
    expect(weather.search).not.toHaveBeenCalled()
    expect((await app.request('http://foreign.invalid/api/weather?latitude=0&longitude=0')).status).toBe(403)
    expect((await app.request('http://localhost/api/weather?latitude=0&longitude=0')).status).toBe(200)
    expect(weather.read).toHaveBeenCalledWith(0, 0)
    expect((await app.request('http://localhost/api/cities?q=Taipei&language=ja')).status).toBe(200)
    expect(weather.search).toHaveBeenCalledWith('Taipei', 'ja')
    weather.read.mockRejectedValue(new Error('private upstream diagnostics'))
    const failure = await app.request('http://localhost/api/weather?latitude=1&longitude=1')
    expect(failure.status).toBe(502)
    expect(await failure.text()).not.toContain('private upstream')
  })
})
