// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { OFFICE_DEPTS, type OfficeDept } from '../../../../shared/office'
import {
  CORNER_ROOMS,
  CORRIDOR,
  DOOR,
  MANAGER_OFFICE,
  pantrySpot,
  seatPosition,
  TREE_R,
  type Seat,
  type Vec3,
} from './layout'
import { ringPath } from './path'

const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const onCorridor = (p: Vec3) => Math.max(Math.abs(p[0]), Math.abs(p[2])) === CORRIDOR
const has = (path: Vec3[], p: Vec3) => path.some((q) => same(q, p))
const ROOMS = Object.values(CORNER_ROOMS)
const RING_CORNERS = ROOMS.map((r) => r.ring)

/** 沿線段取樣：回傳是否有點落在 pred 內 */
function sampleHits(a: Vec3, b: Vec3, pred: (x: number, z: number) => boolean): boolean {
  for (let k = 0; k <= 100; k++) {
    const t = k / 100
    if (pred(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t)) return true
  }
  return false
}
const inRoom = (x: number, z: number) =>
  ROOMS.some((r) => x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && z > r.z0 + 1e-6 && z < r.z1 - 1e-6)
const inTree = (x: number, z: number) => Math.hypot(x, z) < TREE_R

/** 固定種子的亂數，測試可重現 */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('ringPath', () => {
  it('首尾等於 from／to，相鄰無重複點', () => {
    const from: Vec3 = [-5, 0, -20]
    const to: Vec3 = [18, 0, 3]
    const p = ringPath(from, to)
    expect(p[0]).toEqual(from)
    expect(p[p.length - 1]).toEqual(to)
    for (let i = 1; i < p.length; i++) expect(same(p[i], p[i - 1])).toBe(false)
  })

  it('同一側走廊（北翼 tenant → 北翼 teleagent）：中間點全在 z=-11 上，不經走廊角', () => {
    const p = ringPath([-5, 0, -20], [5, 0, -18])
    const mid = p.slice(1, -1)
    expect(mid.length).toBeGreaterThan(0)
    for (const q of mid) expect(q[2]).toBe(-CORRIDOR)
    for (const c of RING_CORNERS) expect(has(p, c)).toBe(false)
  })

  it('DOOR → 任一座位：從大門到走廊那段不經過審查台 (3,17) 半徑 1 內', () => {
    const depts: OfficeDept[] = [...OFFICE_DEPTS, 'west-south']
    for (const dept of depts) {
      for (const seat of [
        { dept, group: 'desks', table: 0, index: 0 },
        { dept, group: 'plan-a', table: 1, index: 4 },
      ] as Seat[]) {
        const p = ringPath(DOOR, seatPosition(seat))
        const k = p.findIndex((q, i) => i > 0 && onCorridor(q))
        for (let i = 1; i <= k; i++)
          expect(sampleHits(p[i - 1], p[i], (x, z) => Math.hypot(x - 3, z - 17) < 1)).toBe(false)
      }
    }
  })

  it('北翼 → 南大廳 DOOR：走較短的西側，只經過兩個走廊角', () => {
    const p = ringPath([-5, 0, -20], DOOR)
    const corners = p.filter((q) => RING_CORNERS.some((c) => same(c, q)))
    expect(corners).toEqual([
      [-11, 0, -11],
      [-11, 0, 11],
    ])
  })

  it('進出角落房間經門內點與走廊角', () => {
    const p = ringPath(MANAGER_OFFICE, [5, 0, -20])
    expect(p.slice(0, 3)).toEqual([MANAGER_OFFICE, [14, 0, 14], [11, 0, 11]])
    const back = ringPath([5, 0, -20], MANAGER_OFFICE)
    expect(back.slice(-3)).toEqual([[11, 0, 11], [14, 0, 14], MANAGER_OFFICE])
  })

  it('中庭點（pantry）出入：先投影到走廊再進來', () => {
    const spot = pantrySpot('abc')
    const seat = seatPosition({ dept: 'east-south', group: 'desks', table: 0, index: 0 })
    const out = ringPath(spot, seat)
    expect(onCorridor(out[1])).toBe(true)
    const into = ringPath(seat, spot)
    expect(onCorridor(into[into.length - 2])).toBe(true)
  })

  it('每段線段不穿過四角房間內部（門內點→走廊角那段除外），也不進入半徑 TREE_R 的樹', () => {
    const depts: OfficeDept[] = [...OFFICE_DEPTS, 'west-south']
    const groups = ['desks', 'manager', 'plan-a']
    const rand = rng(42)
    const pick = (): Vec3 => {
      const r = rand()
      if (r < 0.1) return pantrySpot(`p${Math.floor(rand() * 1000)}`)
      if (r < 0.15) return MANAGER_OFFICE
      const dept = depts[Math.floor(rand() * depts.length)]
      const group = groups[Math.floor(rand() * groups.length)]
      return seatPosition({
        dept,
        group,
        table: group === 'plan-a' ? Math.floor(rand() * 8) : 0,
        index: Math.floor(rand() * 12),
      })
    }
    for (let n = 0; n < 20; n++) {
      const p = ringPath(pick(), pick())
      for (let i = 1; i < p.length; i++) {
        expect(sampleHits(p[i - 1], p[i], inTree)).toBe(false)
        const inside = (q: Vec3) => inRoom(q[0], q[2])
        const doorLeg = ROOMS.some(
          (r) => (same(p[i - 1], r.door) && same(p[i], r.ring)) || (same(p[i - 1], r.ring) && same(p[i], r.door)),
        )
        // 房間內的起訖點→門內點也允許（在房間裡走）
        const roomLeg = inside(p[i - 1]) || inside(p[i])
        if (!doorLeg && !roomLeg) expect(sampleHits(p[i - 1], p[i], inRoom)).toBe(false)
      }
    }
  })
})
