// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CLOUD_COUNT,
  CLOUD_FADE_BAND,
  CLOUD_HIDE_DIST,
  CLOUD_SIGHT_RADIUS,
  FP_VIEW_DIST,
  cloudAt,
  cloudLayout,
  cloudOccludes,
  cloudOpacity,
  cloudSightDist,
  distToSegment,
  newSightLines,
  opacityFor,
  prepareSightLines,
} from './clouds'
import type { Weather } from './sky'
import { seeded } from './street'

const WEATHERS: Weather[] = ['clear', 'cloudy', 'rain', 'storm', 'snow']

describe('CLOUD_COUNT', () => {
  it('晴 6、多雲 14、雨 18、雷雨 18、雪 12', () => {
    expect(CLOUD_COUNT).toEqual({ clear: 6, cloudy: 14, rain: 18, storm: 18, snow: 12 })
  })
})

describe('cloudLayout', () => {
  for (const w of WEATHERS) {
    it(`${w}：數量、高度 22–30、可重現`, () => {
      const clouds = cloudLayout(w, seeded(1))
      expect(clouds).toHaveLength(CLOUD_COUNT[w])
      expect(cloudLayout(w, seeded(1))).toEqual(clouds)
      for (const c of clouds) {
        expect(c.base[1]).toBeGreaterThanOrEqual(22)
        expect(c.base[1]).toBeLessThanOrEqual(30)
        expect(c.scale).toBeGreaterThan(0)
        expect(c.puffs.length).toBeGreaterThan(0)
      }
    })
  }
})

describe('cloudAt', () => {
  it('任何時間都在外圈且 |x| ≤ 90', () => {
    for (const w of WEATHERS)
      for (const c of cloudLayout(w, seeded(1)))
        for (const t of [0, 37, 120, 999]) {
          const [x, y, z] = cloudAt(c, t)
          expect(Math.abs(x) >= 30 || Math.abs(z) >= 30).toBe(true)
          expect(Math.abs(x)).toBeLessThanOrEqual(90)
          expect(y).toBe(c.base[1])
        }
  })

  it('沿 +x 約 0.6／秒飄，超出 90 從 -90 回來', () => {
    const c = { base: [0, 25, 50] as [number, number, number], scale: 1, puffs: [] }
    expect(cloudAt(c, 0)).toEqual([0, 25, 50])
    expect(cloudAt(c, 10)[0]).toBeCloseTo(6, 9)
    expect(cloudAt(c, 160)[0]).toBeCloseTo(-84, 9)
  })
})

const v = (x: number, y: number, z: number) => ({ x, y, z })
const ORIGIN = v(0, 0, 0)

describe('distToSegment', () => {
  it('投影落在段內取垂距，段外取端點距離', () => {
    expect(distToSegment(v(0, 3, 5), v(0, 0, 0), v(0, 0, 10))).toBeCloseTo(3, 9)
    expect(distToSegment(v(0, 0, 13), v(0, 0, 0), v(0, 0, 10))).toBeCloseTo(3, 9)
    expect(distToSegment(v(0, 4, -3), v(0, 0, 0), v(0, 0, 10))).toBeCloseTo(5, 9)
    expect(distToSegment(v(3, 4, 0), v(0, 0, 0), v(0, 0, 0))).toBeCloseTo(5, 9)
  })
})

describe('cloudOccludes／cloudOpacity', () => {
  it('相機拉遠時，雲在相機→目標視線上即使距相機 68 仍視為遮擋', () => {
    const cam = v(0, 60, 104)
    const cloud = v(0, 25, 45)
    expect(Math.hypot(0, 35, 59)).toBeGreaterThan(CLOUD_HIDE_DIST)
    expect(cloudOccludes(cloud, cam, ORIGIN)).toBe(true)
    expect(cloudOpacity(cloud, cam, ORIGIN)).toBe(0)
  })

  it('預設相機看原點時，遠離視線的雲不遮擋且完全不透明', () => {
    const cam = v(34, 40, 46)
    expect(cloudOccludes(v(-60, 25, -50), cam, ORIGIN)).toBe(false)
    expect(cloudOpacity(v(-60, 25, -50), cam, ORIGIN)).toBe(1)
  })

  it('預設相機 (34,40,46) 時雲 (25,25,40) 遮擋', () => {
    expect(cloudOccludes(v(25, 25, 40), v(34, 40, 46), ORIGIN)).toBe(true)
  })

  it('擋在相機→樓板角落的雲也遮擋（即使離中心視線超過門檻、離相機很遠）', () => {
    const cam = v(0, 40, 100)
    const cloud = v(12, 20, 62)
    expect(Math.hypot(12, 20, 38)).toBeGreaterThan(CLOUD_HIDE_DIST)
    expect(distToSegment(cloud, cam, ORIGIN)).toBeGreaterThan(CLOUD_SIGHT_RADIUS)
    expect(cloudSightDist(cloud, cam, ORIGIN)).toBeLessThan(CLOUD_SIGHT_RADIUS)
    expect(cloudOccludes(cloud, cam, ORIGIN)).toBe(true)
  })

  it('實際視線段（含 focal offset）上的雲也遮擋', () => {
    const cam = v(0, 40, 100)
    const sightEnd = v(60, 0, 40)
    expect(cloudOccludes(v(30, 20, 70), cam, sightEnd)).toBe(true)
    expect(cloudOccludes(v(30, 20, 70), cam, ORIGIN)).toBe(false)
  })

  it('貼近相機的雲即使不在視線段上也遮擋', () => {
    const cam = v(0, 40, 57)
    expect(cloudOccludes(v(20, 40, 57), cam, ORIGIN)).toBe(true)
  })

  it('x 軸取樣：門檻上為 0；(20,0,0) 離中心線 20 但落在 cam→(24,0,-24) 角落線上（約 0.63），仍遮擋', () => {
    const cam = v(0, 0, 100)
    expect(cloudOpacity(v(CLOUD_SIGHT_RADIUS, 0, 0), cam, ORIGIN)).toBe(0)
    const p = v(CLOUD_SIGHT_RADIUS + CLOUD_FADE_BAND, 0, 0)
    expect(distToSegment(p, cam, ORIGIN)).toBeCloseTo(20, 9)
    expect(distToSegment(p, cam, v(24, 0, -24))).toBeLessThan(1)
    expect(cloudOpacity(p, cam, ORIGIN)).toBe(0)
  })

  it('視線門檻外 CLOUD_FADE_BAND 內為半透明過渡（y 軸取樣）', () => {
    const cam = v(0, 0, 100)
    const mid = cloudOpacity(v(0, CLOUD_SIGHT_RADIUS + CLOUD_FADE_BAND / 2, 0), cam, ORIGIN)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(cloudOpacity(v(0, CLOUD_SIGHT_RADIUS, 0), cam, ORIGIN)).toBe(0)
    expect(cloudOpacity(v(0, CLOUD_SIGHT_RADIUS + CLOUD_FADE_BAND, 0), cam, ORIGIN)).toBe(1)
  })

  it('第一人稱（viewDist < FP_VIEW_DIST）朝 +z 上仰看雲，不淡掉', () => {
    const cam = v(0, 1.6, 20)
    const end = v(0, 1.6 + 0.01 * Math.sin(0.6), 20 + 0.01 * Math.cos(0.6))
    expect(FP_VIEW_DIST).toBeGreaterThan(0.01)
    expect(cloudOccludes(v(0, 25, 50), cam, end, 0.01)).toBe(false)
    expect(cloudOpacity(v(0, 25, 50), cam, end, 0.01)).toBe(1)
  })

  it('第一人稱仍做近相機判斷', () => {
    expect(cloudOccludes(v(0, 20, 30), v(0, 1.6, 20), v(0, 1.6, 20.01), 0.01)).toBe(true)
  })
})

describe('prepareSightLines／opacityFor', () => {
  it('一次準備、多朵雲套用，結果與單次版一致', () => {
    const cam = v(34, 40, 46)
    const lines = prepareSightLines(newSightLines(), cam, ORIGIN, Math.hypot(34, 40, 46))
    for (const p of [v(25, 25, 40), v(-60, 25, -50), v(0, 25, 45)])
      expect(opacityFor(p, lines)).toBe(cloudOpacity(p, cam, ORIGIN))
  })
})
