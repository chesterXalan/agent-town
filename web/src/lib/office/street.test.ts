// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Vec3 } from './layout'
import {
  buildingLots,
  cornerTowers,
  CURB_LINE,
  OUTER_LOTS,
  OUTER_STREET,
  outerTreeSpots,
  lightPhase,
  loopLength,
  loopPose,
  seeded,
  squareLoop,
  STREET,
  streetMoving,
  prefersReducedMotion,
  TRAFFIC_LIGHTS,
  treeSpots,
  WALK_IN_LINE,
  WALK_OUT_LINE,
  type Lot,
} from './street'

const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
const expectVecClose = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))

/** 世界座標 footprint：size 是建物局部框（寬沿街、深朝馬路），東西兩側要轉 90° */
function footprint(l: Lot) {
  const eastWest = Math.abs(l.center[0]) > Math.abs(l.center[2])
  const [sx, sz] = eastWest ? [l.size[2], l.size[0]] : [l.size[0], l.size[2]]
  return { x0: l.center[0] - sx / 2, x1: l.center[0] + sx / 2, z0: l.center[2] - sz / 2, z1: l.center[2] + sz / 2 }
}
const side = (l: Lot) =>
  Math.abs(l.center[0]) > Math.abs(l.center[2]) ? (l.center[0] > 0 ? 'e' : 'w') : l.center[2] > 0 ? 's' : 'n'

describe('squareLoop / loopPose', () => {
  const loop = squareLoop(10)

  it('從 (r, 0, r) 起四角，reverse 為同起點的反序', () => {
    expect(loop).toEqual([
      [10, 0, 10],
      [-10, 0, 10],
      [-10, 0, -10],
      [10, 0, -10],
    ])
    expect(squareLoop(10, true)).toEqual([loop[0], ...loop.slice(1).reverse()])
  })

  it('周長 80', () => {
    expect(loopLength(loop)).toBeCloseTo(80, 9)
  })

  it('s 自動 wrap（0、一圈、負值）', () => {
    expectVecClose(loopPose(loop, 0).position, loop[0])
    expectVecClose(loopPose(loop, 80).position, loopPose(loop, 0).position)
    expectVecClose(loopPose(loop, 160 + 13).position, loopPose(loop, 13).position)
    const neg = loopPose(loop, -5)
    const pos = loopPose(loop, 75)
    expectVecClose(neg.position, pos.position)
    expect(neg.heading).toBeCloseTo(pos.heading, 9)
  })

  it('每段中點 heading = atan2(dx, dz)，位置在線段上', () => {
    for (const l of [loop, squareLoop(10, true)]) {
      l.forEach((a, i) => {
        const b = l[(i + 1) % l.length]
        const p = loopPose(l, i * 20 + 10)
        expect(p.heading).toBeCloseTo(Math.atan2(b[0] - a[0], b[2] - a[2]), 9)
        expectVecClose(p.position, [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2])
      })
    }
  })

  it('heading 沿環連續（轉角不跳）', () => {
    for (const l of [loop, squareLoop(10, true)]) {
      let prev = loopPose(l, 0).heading
      for (let s = 0.1; s <= 80.001; s += 0.1) {
        const h = loopPose(l, s).heading
        expect(angleDiff(h, prev)).toBeLessThan(0.2)
        prev = h
      }
    }
  })
})

describe('seeded', () => {
  it('同 seed 同序列，值域 [0, 1)', () => {
    const a = seeded(1)
    const b = seeded(1)
    const xs = Array.from({ length: 200 }, () => a())
    expect(xs).toEqual(Array.from({ length: 200 }, () => b()))
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true)
    expect(new Set(xs).size).toBeGreaterThan(190)
    expect(seeded(2)()).not.toBe(seeded(1)())
  })
})

describe('buildingLots', () => {
  for (const seed of [1, 7, 20261029]) {
    it(`seed ${seed}：可重現、在建地內、不重疊、四邊各 4–5 棟、面向馬路`, () => {
      const lots = buildingLots(seeded(seed))
      expect(buildingLots(seeded(seed))).toEqual(lots)
      const [lo, hi] = STREET.lots
      for (const l of lots) {
        const f = footprint(l)
        const inX = f.x0 >= -hi && f.x1 <= hi
        const inZ = f.z0 >= -hi && f.z1 <= hi
        expect(inX && inZ).toBe(true)
        const bandX = f.x0 >= lo || f.x1 <= -lo
        const bandZ = f.z0 >= lo || f.z1 <= -lo
        expect(bandX || bandZ).toBe(true)
        // 面向馬路：facing 指向原點那一側的軸向
        const s = side(l)
        const want = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 }[s]
        expect(angleDiff(l.facing, want)).toBeLessThan(1e-9)
        expect(l.size.every((v) => v > 0)).toBe(true)
      }
      for (let i = 0; i < lots.length; i++)
        for (let j = i + 1; j < lots.length; j++) {
          const a = footprint(lots[i])
          const b = footprint(lots[j])
          const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1
          expect(overlap).toBe(false)
        }
      for (const s of ['n', 's', 'e', 'w']) {
        const n = lots.filter((l) => side(l) === s).length
        expect(n).toBeGreaterThanOrEqual(4)
        expect(n).toBeLessThanOrEqual(5)
      }
    })
  }
})

describe('外環', () => {
  it('緊接內環建地外緣，各帶由內往外遞增', () => {
    const edges = [OUTER_STREET.sidewalkIn, OUTER_STREET.road, OUTER_STREET.sidewalkOut, OUTER_STREET.lots]
    expect(edges[0][0]).toBe(STREET.lots[1])
    for (let i = 1; i < edges.length; i++) expect(edges[i][0]).toBe(edges[i - 1][1])
  })

  for (const seed of [1, 20261102]) {
    it(`seed ${seed}：大樓與四角高塔都在外環建地內、彼此不重疊、四邊各 6–7 棟`, () => {
      const lots = buildingLots(seeded(seed), OUTER_LOTS)
      const all = [...lots, ...cornerTowers(seeded(seed))]
      const [lo, hi] = OUTER_STREET.lots
      for (const l of all) {
        const f = footprint(l)
        expect(f.x0 >= -hi && f.x1 <= hi && f.z0 >= -hi && f.z1 <= hi).toBe(true)
        expect(f.x0 >= lo || f.x1 <= -lo || f.z0 >= lo || f.z1 <= -lo).toBe(true)
      }
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = footprint(all[i])
          const b = footprint(all[j])
          expect(a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1).toBe(false)
        }
      for (const s of ['n', 's', 'e', 'w']) {
        const n = lots.filter((l) => side(l) === s).length
        expect(n).toBeGreaterThanOrEqual(6)
        expect(n).toBeLessThanOrEqual(7)
      }
    })
  }

  it('路樹都在外環外側人行道、間距 ≥ 6', () => {
    const trees = outerTreeSpots()
    const [lo, hi] = OUTER_STREET.sidewalkOut
    for (const t of trees) expect(Math.max(Math.abs(t[0]), Math.abs(t[2]))).toBeGreaterThan(lo)
    for (const t of trees) expect(Math.max(Math.abs(t[0]), Math.abs(t[2]))).toBeLessThan(hi)
    for (let i = 0; i < trees.length; i++)
      for (let j = i + 1; j < trees.length; j++)
        expect(Math.hypot(trees[i][0] - trees[j][0], trees[i][2] - trees[j][2])).toBeGreaterThanOrEqual(6)
  })
})

describe('treeSpots', () => {
  const trees = treeSpots()
  it('全部在外側人行道、間距 ≥ 6、避開紅綠燈', () => {
    expect(trees.length).toBeGreaterThan(20)
    const [lo, hi] = STREET.sidewalkOut
    for (const t of trees) {
      const onX = Math.abs(t[0]) >= lo && Math.abs(t[0]) <= hi && Math.abs(t[2]) <= hi
      const onZ = Math.abs(t[2]) >= lo && Math.abs(t[2]) <= hi && Math.abs(t[0]) <= hi
      expect(onX || onZ).toBe(true)
      for (const l of TRAFFIC_LIGHTS) expect(Math.hypot(t[0] - l.at[0], t[2] - l.at[2])).toBeGreaterThanOrEqual(6)
    }
    for (let i = 0; i < trees.length; i++)
      for (let j = i + 1; j < trees.length; j++)
        expect(Math.hypot(trees[i][0] - trees[j][0], trees[i][2] - trees[j][2])).toBeGreaterThanOrEqual(6)
  })
})

describe('人行道錯線', () => {
  /** 物件所在方環線：|x|、|z| 較大者 */
  const ringOf = (p: Vec3) => Math.max(Math.abs(p[0]), Math.abs(p[2]))
  const objects = [...treeSpots(), ...TRAFFIC_LIGHTS.map((l) => l.at)]

  it('樹與燈桿都在 CURB_LINE，路人線都在各自人行道內', () => {
    for (const p of objects) expect(ringOf(p)).toBeCloseTo(CURB_LINE, 9)
    const [outLo, outHi] = STREET.sidewalkOut
    const [inLo, inHi] = STREET.sidewalkIn
    expect(WALK_OUT_LINE).toBeGreaterThan(outLo)
    expect(WALK_OUT_LINE).toBeLessThan(outHi)
    expect(WALK_IN_LINE).toBeGreaterThan(inLo)
    expect(WALK_IN_LINE).toBeLessThan(inHi)
  })

  it('內外路人線離樹與燈桿線 ≥ 1', () => {
    for (const p of objects) {
      expect(Math.abs(WALK_OUT_LINE - ringOf(p))).toBeGreaterThanOrEqual(1)
      expect(Math.abs(WALK_IN_LINE - ringOf(p))).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('TRAFFIC_LIGHTS', () => {
  it('四角各一支，面向原點', () => {
    expect(TRAFFIC_LIGHTS).toHaveLength(4)
    const quadrants = new Set(TRAFFIC_LIGHTS.map((l) => `${Math.sign(l.at[0])}${Math.sign(l.at[2])}`))
    expect(quadrants.size).toBe(4)
    for (const l of TRAFFIC_LIGHTS) expect(angleDiff(l.facing, Math.atan2(-l.at[0], -l.at[2]))).toBeLessThan(1e-9)
  })
})

describe('lightPhase', () => {
  it('20 秒一循環：綠 9、黃 2、紅 9', () => {
    expect(lightPhase(0)).toBe('green')
    expect(lightPhase(9.5)).toBe('yellow')
    expect(lightPhase(11)).toBe('red')
    expect(lightPhase(19.9)).toBe('red')
    expect(lightPhase(20)).toBe('green')
    expect(lightPhase(-1)).toBe('red')
  })
})

describe('streetMoving', () => {
  it('沒有減少動態 → 街景會動', () => expect(streetMoving(false)).toBe(true))
  it('減少動態 → 街景靜止', () => expect(streetMoving(true)).toBe(false))
})

describe('prefersReducedMotion', () => {
  it('node 環境沒有 matchMedia → false', () => expect(prefersReducedMotion()).toBe(false))
})
