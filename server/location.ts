import { isCity } from '../shared/weather'
import { LOCATION_MAX_AGE_MS, LOCATION_REFRESH_MS, type NetworkLocation } from '../shared/location'

export function createLocationService(request: typeof fetch = fetch) {
  let cached: NetworkLocation | undefined
  let retryAt = 0
  let pending: Promise<NetworkLocation> | undefined

  function available(): NetworkLocation {
    if (cached && Date.now() - cached.detectedAt < LOCATION_MAX_AGE_MS) return cached
    throw new Error('Network location unavailable')
  }

  function read(refresh = false): Promise<NetworkLocation> {
    if (pending) return pending
    if (
      Date.now() < retryAt ||
      (!refresh && cached && !cached.stale && Date.now() - cached.detectedAt < LOCATION_REFRESH_MS)
    ) {
      return Promise.resolve().then(available)
    }
    pending = (async () => {
      try {
        const url = new URL('https://ipwho.is/')
        url.searchParams.set('fields', 'success,city,region,country,latitude,longitude,timezone.id')
        const response = await request(url, { signal: AbortSignal.timeout(8000), redirect: 'error' })
        if (!response.ok) throw new Error('Network location unavailable')
        const data = (await response.json()) as Record<string, unknown> & { timezone?: { id?: string } }
        // An IP estimate has no GeoNames identifier. Never retain the provider's raw IP or network metadata.
        const city = {
          id: 0,
          name: data.city,
          region: data.region ?? '',
          country: data.country ?? '',
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone?.id,
        }
        if (data.success !== true || !isCity(city)) throw new Error('Invalid network location')
        cached = { city, detectedAt: Date.now(), stale: false }
        retryAt = Date.now() + 10_000
        return cached
      } catch {
        retryAt = Date.now() + 60_000
        if (cached) cached = { ...cached, stale: true }
        return available()
      } finally {
        pending = undefined
      }
    })()
    return pending
  }

  return { read }
}
