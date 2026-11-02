import {
  coordinateKey,
  isCity,
  weatherFromCode,
  WEATHER_MAX_AGE_MS,
  WEATHER_REFRESH_MS,
  type City,
  type WeatherReading,
} from '../shared/weather'

export function createWeatherService(request: typeof fetch = fetch) {
  const cache = new Map<string, { reading?: WeatherReading; retryAt: number }>()
  const pending = new Map<string, Promise<WeatherReading>>()

  async function json(url: URL): Promise<unknown> {
    const response = await request(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
    if (!response.ok) throw new Error('Weather provider unavailable')
    return response.json()
  }

  async function search(name: string, language: string): Promise<City[]> {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
    url.search = new URLSearchParams({ name, language, count: '6', format: 'json' }).toString()
    const data = (await json(url)) as { results?: Record<string, unknown>[] }
    if (!Array.isArray(data.results)) return []
    return data.results
      .map((c) => ({
        id: c.id,
        name: c.name,
        region: c.admin1 ?? '',
        country: c.country ?? '',
        latitude: c.latitude,
        longitude: c.longitude,
        timezone: c.timezone,
      }))
      .filter(isCity)
  }

  async function read(latitude: number, longitude: number): Promise<WeatherReading> {
    const key = coordinateKey({ latitude, longitude })
    const entry = cache.get(key)
    if (entry && Date.now() < entry.retryAt) {
      if (entry.reading && Date.now() - entry.reading.observedAt < WEATHER_MAX_AGE_MS) return entry.reading
      throw new Error('Weather provider unavailable')
    }
    const existing = pending.get(key)
    if (existing) return existing
    const work = (async () => {
      try {
        const url = new URL('https://api.open-meteo.com/v1/forecast')
        url.search = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          current: 'weather_code',
          timeformat: 'unixtime',
          timezone: 'GMT',
          forecast_days: '1',
        }).toString()
        const data = (await json(url)) as { current?: { time?: number; weather_code?: number } }
        const weather = weatherFromCode(data.current?.weather_code ?? -1)
        const observedAt = (data.current?.time ?? NaN) * 1000
        const now = Date.now()
        if (
          !weather ||
          !Number.isFinite(observedAt) ||
          observedAt > now + WEATHER_REFRESH_MS ||
          now - observedAt >= WEATHER_MAX_AGE_MS
        )
          throw new Error('Invalid weather response')
        const reading = { weather, observedAt, fetchedAt: now, stale: now - observedAt > 2 * WEATHER_REFRESH_MS }
        cache.set(key, { reading, retryAt: now + WEATHER_REFRESH_MS })
        return reading
      } catch {
        const reading =
          entry?.reading && Date.now() - entry.reading.observedAt < WEATHER_MAX_AGE_MS
            ? { ...entry.reading, stale: true }
            : undefined
        cache.set(key, { reading, retryAt: Date.now() + 60_000 })
        if (reading) return reading
        throw new Error('Weather provider unavailable')
      } finally {
        pending.delete(key)
        if (cache.size > 100) cache.delete(cache.keys().next().value!)
      }
    })()
    pending.set(key, work)
    return work
  }

  return { search, read }
}
