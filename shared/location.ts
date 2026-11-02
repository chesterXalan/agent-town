import { isCity, type City } from './weather'

export const LOCATION_REFRESH_MS = 60 * 60_000
export const LOCATION_MAX_AGE_MS = 24 * LOCATION_REFRESH_MS

export interface NetworkLocation {
  city: City
  detectedAt: number
  stale: boolean
}

export function isNetworkLocation(value: unknown): value is NetworkLocation {
  if (!value || typeof value !== 'object') return false
  const location = value as NetworkLocation
  return isCity(location.city) && Number.isFinite(location.detectedAt) && typeof location.stale === 'boolean'
}

export function resolveCity(manual: City | null, network: NetworkLocation | undefined, now: number): City | null {
  return manual ?? (network && now - network.detectedAt < LOCATION_MAX_AGE_MS ? network.city : null)
}
