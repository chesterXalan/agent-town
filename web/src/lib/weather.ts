import {
  coordinateKey,
  isWeatherReading,
  WEATHER_MAX_AGE_MS,
  WEATHER_REFRESH_MS,
  type City,
  type WeatherReading,
} from '../../../shared/weather'

const CACHE_KEY = 'agent-town-weather'
export function loadWeather(city: City, storage?: Pick<Storage, 'getItem'>): WeatherReading | undefined {
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage)?.getItem(CACHE_KEY) ?? 'null')
    if (
      value?.key === coordinateKey(city) &&
      isWeatherReading(value.reading) &&
      Date.now() - value.reading.observedAt < WEATHER_MAX_AGE_MS &&
      value.reading.observedAt <= Date.now() + WEATHER_REFRESH_MS
    ) {
      return value.reading
    }
  } catch {
    /* A missing or blocked cache does not prevent live weather. */
  }
}
export function saveWeather(city: City, reading: WeatherReading): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key: coordinateKey(city), reading }))
  } catch {
    /* Keep the reading in the query cache when browser storage is unavailable. */
  }
}
export function usableWeather(reading: WeatherReading | undefined, now: number): WeatherReading | undefined {
  return reading && now - reading.observedAt < WEATHER_MAX_AGE_MS ? reading : undefined
}
export function weatherIsStale(reading: WeatherReading, now: number): boolean {
  return (
    reading.stale || now - reading.fetchedAt >= WEATHER_REFRESH_MS || now - reading.observedAt > 2 * WEATHER_REFRESH_MS
  )
}
