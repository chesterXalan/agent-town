// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { OFFICE_DEPTS, type OfficeDept } from '../../../../shared/office'
import { HALF, pantrySpot, type Vec3 } from './layout'
import {
  coffeeQueueSpot,
  COPIER,
  copierSpot,
  LUNCH_SEATS,
  sofaSeat,
  WATER_COOLER,
  waterChatSpot,
  whiteboard,
  whiteboardSpot,
} from './lifeSpots'
import { CHAT_CENTERS, COFFEE_SPOT, type NpcSpot } from './npc'

const DEPTS: OfficeDept[] = [...OFFICE_DEPTS, 'west-south']
const K3 = [0, 1, 2] as const
const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2])

/** 所有生活站位與設施本體，帶名字方便看失敗訊息 */
const ALL: [string, NpcSpot][] = [
  ['WATER_COOLER', WATER_COOLER],
  ['COPIER', COPIER],
  ...[0, 1, 2, 3].map((k): [string, NpcSpot] => [`coffeeQueueSpot(${k})`, coffeeQueueSpot(k)]),
  ...K3.map((k): [string, NpcSpot] => [`waterChatSpot(${k})`, waterChatSpot(k)]),
  ...([0, 1, 2, 3] as const).map((k): [string, NpcSpot] => [`sofaSeat(${k})`, sofaSeat(k)]),
  ...K3.map((k): [string, NpcSpot] => [`copierSpot(${k})`, copierSpot(k)]),
  ...LUNCH_SEATS.map((s, k): [string, NpcSpot] => [`LUNCH_SEATS[${k}]`, s]),
  ...DEPTS.flatMap((d): [string, NpcSpot][] => [
    [`whiteboard(${d})`, whiteboard(d)],
    ...K3.map((k): [string, NpcSpot] => [`whiteboardSpot(${d}, ${k})`, whiteboardSpot(d, k)]),
  ]),
]

/** 8 個 id 各落在 pantrySpot 的不同 slot */
function pantrySlots(): Vec3[] {
  const seen = new Map<string, Vec3>()
  for (let i = 0; seen.size < 8 && i < 10_000; i++) {
    const p = pantrySpot(`p${i}`)
    seen.set(p.join(','), p)
  }
  return [...seen.values()]
}

describe('lifeSpots', () => {
  it('全部站位與設施兩兩距離 ≥ 0.8', () => {
    for (let i = 0; i < ALL.length; i++) {
      for (let j = i + 1; j < ALL.length; j++) {
        const [na, a] = ALL[i]
        const [nb, b] = ALL[j]
        expect(dist(a.at, b.at), `${na} ↔ ${nb}`).toBeGreaterThanOrEqual(0.8)
      }
    }
  })

  it('與 pantrySpot 的 8 個 slot 距離 ≥ 0.8', () => {
    const slots = pantrySlots()
    expect(slots).toHaveLength(8)
    for (const [name, s] of ALL)
      for (const p of slots) expect(dist(s.at, p), `${name} ↔ pantry ${p.join(',')}`).toBeGreaterThanOrEqual(0.8)
  })

  it('離 NPC 聊天圈心 CHAT_CENTERS 都 ≥ 0.8', () => {
    for (const [name, s] of ALL)
      for (const c of CHAT_CENTERS) expect(dist(s.at, c), `${name} ↔ chat ${c.join(',')}`).toBeGreaterThanOrEqual(0.8)
  })

  it('全部在樓層內', () => {
    for (const [name, s] of ALL) {
      expect(Math.abs(s.at[0]), name).toBeLessThan(HALF)
      expect(Math.abs(s.at[2]), name).toBeLessThan(HALF)
      expect(Number.isFinite(s.facing), name).toBe(true)
    }
  })

  it('每個部門（含 other）各有一面白板且位置不同', () => {
    const keys = DEPTS.map((d) => whiteboard(d).at.join(','))
    expect(new Set(keys).size).toBe(DEPTS.length)
  })

  it('咖啡排隊：k=0 在咖啡機前，往後每 0.9 一位', () => {
    expect(coffeeQueueSpot(0)).toEqual(COFFEE_SPOT)
    for (const k of [1, 2, 3]) expect(dist(coffeeQueueSpot(k).at, coffeeQueueSpot(k - 1).at)).toBeCloseTo(0.9)
  })

  it('咖啡排隊：每人面向前一人', () => {
    for (const k of [1, 2, 3]) {
      const me = coffeeQueueSpot(k)
      const ahead = coffeeQueueSpot(k - 1).at
      expect(me.facing).toBeCloseTo(Math.atan2(ahead[0] - me.at[0], ahead[2] - me.at[2]))
    }
  })

  it('LUNCH_SEATS 至少 6 個', () => {
    expect(LUNCH_SEATS.length).toBeGreaterThanOrEqual(6)
  })
})
