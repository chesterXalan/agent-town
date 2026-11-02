// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { skyAtLocation, sunTimesAtLocation } from './sunlight'
import type { City } from '../../../shared/weather'

const taipei: City = {
  id: 1,
  name: 'Taipei',
  region: '',
  country: 'Taiwan',
  latitude: 25.03,
  longitude: 121.56,
  timezone: 'Asia/Taipei',
}
describe('local sunlight', () => {
  it('follows the sun instead of a fixed 19:00 sunset', () => {
    expect(skyAtLocation(Date.parse('2026-11-02T12:00:00+08:00'), taipei).night).toBe(0)
    const winterEvening = skyAtLocation(Date.parse('2026-11-02T18:00:00+08:00'), taipei)
    expect(winterEvening.sunUp).toBe(false)
    expect(winterEvening.night).toBe(1)
    expect(skyAtLocation(Date.parse('2026-06-21T18:00:00+08:00'), taipei).sunUp).toBe(true)
  })
  it('uses the selected city calendar day even when the device is across midnight', () => {
    const now = Date.parse('2026-11-01T16:30:00Z')
    const times = sunTimesAtLocation(now, taipei)
    const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: taipei.timezone }).format(date)
    expect(day(times.sunrise!)).toBe('2026-11-02')
    expect(day(times.sunset!)).toBe('2026-11-02')
    const previous = sunTimesAtLocation(now - 60 * 60_000, taipei)
    expect(day(previous.sunset!)).toBe('2026-11-01')
  })
  it('uses city timezone offsets on daylight-saving transition days', () => {
    const newYork = { ...taipei, latitude: 40.71, longitude: -74.01, timezone: 'America/New_York' }
    const before = sunTimesAtLocation(Date.parse('2026-03-08T06:30:00Z'), newYork)
    const after = sunTimesAtLocation(Date.parse('2026-03-08T14:30:00Z'), newYork)
    expect(before.sunrise?.getTime()).toBe(after.sunrise?.getTime())
    expect(before.sunset?.getTime()).toBe(after.sunset?.getTime())
  })
  it('keeps the sky finite during polar day and night', () => {
    const arctic = { ...taipei, latitude: 78.22, longitude: 15.65, timezone: 'Arctic/Longyearbyen' }
    for (const date of ['2026-06-21T12:00:00Z', '2026-12-21T12:00:00Z']) {
      const sky = skyAtLocation(Date.parse(date), arctic)
      expect(sky.sunDir.every(Number.isFinite)).toBe(true)
      expect(Math.hypot(...sky.sunDir)).toBeCloseTo(1)
      expect(sunTimesAtLocation(Date.parse(date), arctic).sunset).toBeNull()
    }
  })
})
