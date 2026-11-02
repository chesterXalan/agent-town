// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  isPrecipitating,
  localHour,
  nextFlashAt,
  phaseSky,
  skyAt,
  weatherAt,
  WEATHER_SLOT_MS,
  type Weather,
} from './sky'

describe('skyAt', () => {
  it('中午是白天', () => {
    const s = skyAt(12)
    expect(s).toMatchObject({ from: 'day', to: 'day', t: 0, night: 0, sunUp: true, moonUp: false })
    expect(s.sunDir[1]).toBeGreaterThan(0.9)
  })

  it('17 點是白天到黃昏的一半', () => {
    const s = skyAt(17)
    expect([s.from, s.to]).toEqual(['day', 'dusk'])
    expect(s.t).toBeCloseTo(0.5)
  })

  it('凌晨兩點是晚上', () => {
    const s = skyAt(2)
    expect(s).toMatchObject({ night: 1, sunUp: false, moonUp: true })
    expect(s.moonDir[1]).toBeGreaterThan(0)
  })

  it('跨午夜仍是晚上', () => {
    for (const h of [23.9, 0.1]) expect([skyAt(h).from, skyAt(h).to]).toEqual(['night', 'night'])
  })

  it('清晨前漸變', () => {
    const s = skyAt(5.75)
    expect([s.from, s.to]).toEqual(['night', 'dawn'])
    expect(s.t).toBeCloseTo(0.25)
  })

  it('黃昏 night', () => {
    expect(skyAt(18).night).toBeCloseTo(0.4)
  })

  it('太陽東升西落', () => {
    expect(skyAt(7).sunDir[0]).toBeGreaterThan(0)
    expect(skyAt(18).sunDir[0]).toBeLessThan(0)
  })
})

describe('localHour', () => {
  it('localHour 用本地時間', () => {
    expect(localHour(new Date(2026, 9, 28, 21, 30).getTime())).toBe(21.5)
  })
})

describe('phaseSky', () => {
  it('取各時段中心', () => {
    expect(phaseSky('night').night).toBe(1)
    expect(phaseSky('day').from).toBe('day')
    expect(phaseSky('dawn')).toEqual(skyAt(7))
    expect(phaseSky('dusk')).toEqual(skyAt(18))
  })
})

describe('weatherAt', () => {
  it('weatherAt 同區段相同', () => {
    const base = 1000 * WEATHER_SLOT_MS
    expect(weatherAt(base + 1)).toBe(weatherAt(base + WEATHER_SLOT_MS - 1))
  })

  it('weatherAt 分布', () => {
    const n = 2000
    const counts: Record<Weather, number> = { clear: 0, cloudy: 0, rain: 0, snow: 0, storm: 0 }
    for (let i = 0; i < n; i++) counts[weatherAt(i * WEATHER_SLOT_MS)]++
    expect(counts.clear / n).toBeGreaterThan(0.5)
    expect(counts.clear / n).toBeLessThan(0.7)
    for (const w of Object.keys(counts) as Weather[]) expect(counts[w]).toBeGreaterThan(0)
  })
})

describe('nextFlashAt', () => {
  it('nextFlashAt 下限', () => {
    expect(nextFlashAt(1000, () => 0)).toBe(9000)
    expect(nextFlashAt(1000, () => 0.999)).toBeLessThan(21000)
  })
})

describe('isPrecipitating', () => {
  it('雨雪雷雨才算', () => {
    expect((['rain', 'snow', 'storm', 'clear', 'cloudy'] as Weather[]).map(isPrecipitating)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
  })
})
