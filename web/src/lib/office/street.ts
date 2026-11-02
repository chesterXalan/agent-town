import type { Vec3 } from './layout'
import type { Rng } from './npc'

// 辦公室外圍的方環街景（數值為到原點的 |x| 或 |z|，HALF = 24 是建築外緣）。

type Band = readonly [number, number]
/** 一圈方環街道：內人行道、雙線道、外人行道、對街建地 */
export interface StreetRing {
  sidewalkIn: Band
  road: Band
  laneIn: number
  laneOut: number
  sidewalkOut: Band
  lots: Band
}

export const STREET = {
  sidewalkIn: [24, 26.5],
  road: [26.5, 33.5],
  laneIn: 28.25,
  laneOut: 31.75,
  sidewalkOut: [33.5, 36],
  lots: [36, 48],
} as const satisfies StreetRing

/** 外環：緊貼內環對街建地外緣，再一圈馬路與較高的城市大樓 */
export const OUTER_STREET = {
  sidewalkIn: [48, 50.5],
  road: [50.5, 57.5],
  laneIn: 52.25,
  laneOut: 55.75,
  sidewalkOut: [57.5, 60],
  lots: [60, 84],
} as const satisfies StreetRing

/** 路面與人行道頂面高（Street 繪製、Traffic 車與路人站立共用） */
export const ROAD_TOP = -0.02
export const SIDEWALK_TOP = 0.06

/** 內側人行道路人行走線（人行道中線，該側沒有其他物件） */
export const WALK_IN_LINE = (STREET.sidewalkIn[0] + STREET.sidewalkIn[1]) / 2
/** 外側人行道路樹與紅綠燈桿所在線：靠路緣側 */
export const curbLine = (ring: StreetRing) => ring.sidewalkOut[0] + 0.5
export const CURB_LINE = curbLine(STREET)
/** 外側人行道路人行走線：靠建地側，與 CURB_LINE 錯開不穿過樹與燈桿 */
export const WALK_OUT_LINE = STREET.sidewalkOut[1] - 0.7
/** 外環的內外人行道路人行走線（外環沒有紅綠燈，路樹在 curbLine） */
export const OUTER_WALK_IN_LINE = (OUTER_STREET.sidewalkIn[0] + OUTER_STREET.sidewalkIn[1]) / 2
export const OUTER_WALK_OUT_LINE = OUTER_STREET.sidewalkOut[1] - 0.7

/**
 * 半徑 r 的方環（四角點，從 (r, 0, r) 起）。
 * 順時針＝由上（+y）往下看、北（-z）朝上：東南 → 西南 → 西北 → 東北。
 * reverse 為逆時針：同一起點，其餘三點反序（東南 → 東北 → 西北 → 西南）。
 */
export function squareLoop(r: number, reverse = false): Vec3[] {
  const cw: Vec3[] = [
    [r, 0, r],
    [-r, 0, r],
    [-r, 0, -r],
    [r, 0, -r],
  ]
  return reverse ? [cw[0], ...cw.slice(1).reverse()] : cw
}

const segLen = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

export function loopLength(loop: readonly Vec3[]): number {
  return loop.reduce((sum, a, i) => sum + segLen(a, loop[(i + 1) % loop.length]), 0)
}

/** 轉角前後各 CORNER_BLEND 單位內 heading 線性轉向，避免在角上瞬間跳 90° */
const CORNER_BLEND = 1.5

const segHeading = (a: Vec3, b: Vec3) => Math.atan2(b[0] - a[0], b[2] - a[2])
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const lerpAngle = (a: number, b: number, t: number) => wrapAngle(a + wrapAngle(b - a) * t)

/**
 * 沿 loop 走 s 單位（自動 wrap，含負值）的位置與朝向。
 * heading = atan2(dx, dz)，與 Figure 的 +z 前方一致；轉角附近平滑轉向。
 */
export function loopPose(loop: readonly Vec3[], s: number): { position: Vec3; heading: number } {
  const n = loop.length
  const total = loopLength(loop)
  if (n === 0) return { position: [0, 0, 0], heading: 0 }
  if (total === 0) return { position: [...loop[0]], heading: 0 }
  let u = ((s % total) + total) % total
  for (let i = 0; i < n; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % n]
    const len = segLen(a, b)
    if (len === 0) continue
    if (u > len && i < n - 1) {
      u -= len
      continue
    }
    u = Math.min(u, len)
    const t = u / len
    const position: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    const h = segHeading(a, b)
    const blend = Math.min(CORNER_BLEND, len / 4)
    let heading = h
    if (u < blend) {
      const hp = segHeading(loop[(i - 1 + n) % n], a)
      heading = lerpAngle(hp, h, 0.5 + (0.5 * u) / blend)
    } else if (u > len - blend) {
      const hn = segHeading(b, loop[(i + 2) % n])
      heading = lerpAngle(h, hn, (0.5 * (u - (len - blend))) / blend)
    }
    return { position, heading }
  }
  return { position: [...loop[0]], heading: 0 }
}

/** 固定 seed 的線性同餘產生器（Numerical Recipes 常數，mod 2³²），回傳 [0, 1) */
export function seeded(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

export type LotKind = 'house' | 'shop'
/**
 * 對街一棟建物。size = [寬（沿街）, 高, 深（朝馬路）] 是局部框，
 * 繪製時 group 以 rotation.y = facing 旋轉（東西兩側的世界 footprint 因此 x／z 互換）。
 */
export interface Lot {
  center: Vec3
  size: Vec3
  facing: number
  kind: LotKind
  color: 0 | 1 | 2 | 3
  roof: 'gable' | 'flat'
}

type Side = { facing: number; place: (along: number, dist: number) => Vec3 }
// 北（-z）面朝 +z、南面朝 -z、東（+x）面朝 -x、西面朝 +x
const SIDES: Side[] = [
  { facing: 0, place: (a, d) => [a, 0, -d] },
  { facing: Math.PI, place: (a, d) => [a, 0, d] },
  { facing: -Math.PI / 2, place: (a, d) => [d, 0, a] },
  { facing: Math.PI / 2, place: (a, d) => [-d, 0, a] },
]
/** 建物離建地內緣的最小退縮 */
const LOT_SETBACK = 0.5

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)

/** 一圈建地的規格：span＝每邊沿街可用範圍（不進四角，四邊之間就不會重疊）；count 兩值各半機率 */
export interface LotSpec {
  ring: StreetRing
  span: number
  count: readonly [number, number]
  houseRatio: number
  depth: Band
  house: Band
  shop: Band
}

/** 內環對街：四邊各 4–5 棟矮房與小店 */
export const INNER_LOTS: LotSpec = {
  ring: STREET,
  span: 34,
  count: [4, 5],
  houseRatio: 0.55,
  depth: [6, 10],
  house: [3.5, 5.5],
  shop: [4.5, 9],
}
/** 外環對街：四邊各 6–7 棟，較深較高的城市大樓 */
export const OUTER_LOTS: LotSpec = {
  ring: OUTER_STREET,
  span: 56,
  count: [6, 7],
  houseRatio: 0.3,
  depth: [9, 16],
  house: [6, 10],
  shop: [12, 30],
}

/** 對街四邊各 count 棟，落在 ring.lots 內、彼此不重疊、面向馬路 */
export function buildingLots(rng: Rng, spec: LotSpec = INNER_LOTS): Lot[] {
  const [lotIn, lotOut] = spec.ring.lots
  const lots: Lot[] = []
  for (const side of SIDES) {
    const count = rng() < 0.5 ? spec.count[0] : spec.count[1]
    const slot = (2 * spec.span) / count
    for (let k = 0; k < count; k++) {
      const kind: LotKind = rng() < spec.houseRatio ? 'house' : 'shop'
      const width = slot * between(rng, 0.6, 0.85)
      const depth = between(rng, ...spec.depth)
      const height = kind === 'house' ? between(rng, ...spec.house) : between(rng, ...spec.shop)
      const along = -spec.span + slot * (k + 0.5) + (slot - width) * (rng() - 0.5)
      const room = lotOut - lotIn - LOT_SETBACK - depth
      const dist = lotIn + LOT_SETBACK + rng() * Math.min(room, 1.5) + depth / 2
      lots.push({
        center: side.place(along, dist),
        size: [width, height, depth],
        facing: side.facing,
        kind,
        color: Math.min(3, Math.floor(rng() * 4)) as Lot['color'],
        roof: kind === 'house' ? 'gable' : 'flat',
      })
    }
  }
  return lots
}

/** 外環四角各一棟高塔：方形底、平頂，面向南北街 */
export function cornerTowers(rng: Rng, ring: StreetRing = OUTER_STREET): Lot[] {
  const [lotIn, lotOut] = ring.lots
  const c = (lotIn + lotOut) / 2
  return (
    [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ] as const
  ).map(([sx, sz]) => {
    const w = between(rng, 12, 16)
    return {
      center: [sx * c, 0, sz * c] as Vec3,
      size: [w, between(rng, 28, 42), w] as Vec3,
      facing: sz > 0 ? Math.PI : 0,
      kind: 'shop' as const,
      color: Math.min(3, Math.floor(rng() * 4)) as Lot['color'],
      roof: 'flat' as const,
    }
  })
}

/** 四角紅綠燈：外側人行道轉角（CURB_LINE），面向原點 */
export const TRAFFIC_LIGHTS: { at: Vec3; facing: number }[] = squareLoop(CURB_LINE).map((at) => ({
  at,
  facing: Math.atan2(-at[0], -at[2]),
}))

/** 每邊路樹沿街座標：間隔 8，避開 x=0 斑馬線與四角紅綠燈 */
const TREE_ALONG = [-28, -20, -12, -4, 4, 12, 20, 28]

/** 外側人行道路樹座標（CURB_LINE 上每 8 單位一棵，避開四角紅綠燈與南側斑馬線） */
export function treeSpots(): Vec3[] {
  return SIDES.flatMap((side) => TREE_ALONG.map((a) => side.place(a, CURB_LINE)))
}

/** 外環路樹沿街座標：間隔 8，不進四角 */
const OUTER_TREE_ALONG = Array.from({ length: 14 }, (_, i) => -52 + i * 8)

/** 外環外側人行道路樹座標 */
export function outerTreeSpots(): Vec3[] {
  return SIDES.flatMap((side) => OUTER_TREE_ALONG.map((a) => side.place(a, curbLine(OUTER_STREET))))
}

const LIGHT_CYCLE = 20
const GREEN_END = 9
const YELLOW_END = 11

/** 紅綠燈目前燈號：20 秒一循環（綠 9、黃 2、紅 9） */
export function lightPhase(tSec: number): 'green' | 'yellow' | 'red' {
  const t = ((tSec % LIGHT_CYCLE) + LIGHT_CYCLE) % LIGHT_CYCLE
  return t < GREEN_END ? 'green' : t < YELLOW_END ? 'yellow' : 'red'
}

/** 減少動態時街景不動、不算進 animating */
export function streetMoving(reduceMotion: boolean): boolean {
  return !reduceMotion
}

/** 使用者是否要求減少動態；沒有 matchMedia（node 測試）時為 false */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
