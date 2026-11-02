// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { coordinateKey, weatherFromCode, WEATHER_MAX_AGE_MS, type City } from '../../../shared/weather'
import { DEFAULT_ENVIRONMENT, loadEnvironment, saveEnvironment } from './environment'
import { loadWeather, usableWeather, weatherIsStale } from './weather'
import { LOCATION_MAX_AGE_MS, resolveCity } from '../../../shared/location'

const city: City = {
  id: 1,
  name: 'Taipei',
  region: '',
  country: 'Taiwan',
  latitude: 25.03,
  longitude: 121.56,
  timezone: 'Asia/Taipei',
}
afterEach(() => vi.useRealTimers())
describe('environment preferences and offline data', () => {
  it('keeps manual selection ahead of late network results and can return to automatic location', () => {
    const now = 1_800_000_000_000
    const network = { city: { ...city, name: 'Tokyo' }, detectedAt: now, stale: false }
    expect(resolveCity(city, undefined, now)).toBe(city)
    expect(resolveCity(city, network, now)).toBe(city)
    expect(resolveCity(null, network, now)).toBe(network.city)
    expect(resolveCity(null, undefined, now)).toBeNull()
    expect(resolveCity(null, network, now + LOCATION_MAX_AGE_MS)).toBeNull()
    expect(resolveCity(city, network, now + LOCATION_MAX_AGE_MS)).toBe(city)
  })
  it('persists the selected city and both overrides, including automatic modes', () => {
    let value = ''
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next
      },
    }
    for (const preference of [
      DEFAULT_ENVIRONMENT,
      { city, phase: 'night' as const, weather: 'snow' as const },
      { city, phase: 'auto' as const, weather: 'auto' as const },
    ]) {
      saveEnvironment(preference, storage)
      expect(loadEnvironment(storage)).toEqual(preference)
    }
    expect(loadEnvironment({ getItem: () => '{bad json' })).toEqual(DEFAULT_ENVIRONMENT)
    expect(
      loadEnvironment({ getItem: () => JSON.stringify({ city: { ...city, timezone: 'invalid' } }) }).city,
    ).toBeNull()
  })
  it('retains weather for only its city and expires data older than one day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T04:00:00Z'))
    const reading = { weather: 'rain', observedAt: Date.now(), fetchedAt: Date.now(), stale: false } as const
    const storage = { getItem: () => JSON.stringify({ key: coordinateKey(city), reading }) }
    expect(loadWeather(city, storage)).toEqual(reading)
    expect(loadWeather({ ...city, longitude: 139 }, storage)).toBeUndefined()
    expect(weatherIsStale(reading, Date.now() + 16 * 60_000)).toBe(true)
    vi.advanceTimersByTime(WEATHER_MAX_AGE_MS)
    expect(loadWeather(city, storage)).toBeUndefined()
    expect(usableWeather(reading, Date.now())).toBeUndefined()
  })
  it.each([
    [0, 'clear'],
    [2, 'cloudy'],
    [45, 'cloudy'],
    [61, 'rain'],
    [67, 'rain'],
    [75, 'snow'],
    [85, 'snow'],
    [95, 'storm'],
    [99, 'storm'],
    [404, null],
  ] as const)('maps WMO code %s to %s', (code, expected) => expect(weatherFromCode(code)).toBe(expected))
})
