export type TownWeather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm'

export interface City {
  id: number
  name: string
  region: string
  country: string
  latitude: number
  longitude: number
  timezone: string
}

export interface WeatherReading {
  weather: TownWeather
  observedAt: number
  fetchedAt: number
  stale: boolean
}

export const WEATHER_REFRESH_MS = 15 * 60_000
export const WEATHER_MAX_AGE_MS = 24 * 60 * 60_000

export function weatherFromCode(code: number): TownWeather | null {
  if ([0, 1].includes(code)) return 'clear'
  if ([2, 3, 45, 48].includes(code)) return 'cloudy'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([95, 96, 99].includes(code)) return 'storm'
  return null
}

export function validCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180
  )
}

export function isCity(value: unknown): value is City {
  if (!value || typeof value !== 'object') return false
  const c = value as City
  if (
    !Number.isInteger(c.id) ||
    typeof c.name !== 'string' ||
    !c.name ||
    typeof c.region !== 'string' ||
    typeof c.country !== 'string' ||
    typeof c.timezone !== 'string' ||
    !c.timezone ||
    !validCoordinates(c.latitude, c.longitude)
  )
    return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: c.timezone })
    return true
  } catch {
    return false
  }
}

export function cityLabel(city: City): string {
  return [...new Set([city.name, city.region, city.country].filter(Boolean))].join(', ')
}

export function coordinateKey(city: Pick<City, 'latitude' | 'longitude'>): string {
  return `${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}`
}

export function isWeatherReading(value: unknown): value is WeatherReading {
  if (!value || typeof value !== 'object') return false
  const r = value as WeatherReading
  return (
    ['clear', 'cloudy', 'rain', 'snow', 'storm'].includes(r.weather) &&
    Number.isFinite(r.observedAt) &&
    Number.isFinite(r.fetchedAt) &&
    typeof r.stale === 'boolean'
  )
}
