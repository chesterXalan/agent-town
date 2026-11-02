import { HALF, type Vec3 } from './layout'
import type { Rng } from './npc'
import type { Weather } from './sky'

export const CLOUD_COUNT: Record<Weather, number> = { clear: 6, cloudy: 14, rain: 18, storm: 18, snow: 12 }

export interface Cloud {
  base: Vec3
  scale: number
  puffs: { offset: Vec3; r: number }[]
}

/** 雲只放在南北兩條帶（|z| ∈ [BAND_IN, BAND_OUT]），沿 x 飄就永遠在外圈 */
const BAND_IN = 40
const BAND_OUT = 70
const X_LIMIT = 90
const DRIFT_SPEED = 0.6

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)

export function cloudLayout(weather: Weather, rng: Rng): Cloud[] {
  return Array.from({ length: CLOUD_COUNT[weather] }, (_, i) => {
    const z = (i % 2 === 0 ? 1 : -1) * between(rng, BAND_IN, BAND_OUT)
    const base: Vec3 = [between(rng, -X_LIMIT, X_LIMIT), between(rng, 22, 28), z]
    const puffCount = 3 + Math.floor(rng() * 3)
    const puffs = Array.from({ length: puffCount }, (_, k) => ({
      offset: [
        (k - (puffCount - 1) / 2) * 2.2 + between(rng, -0.5, 0.5),
        between(rng, 0, 1.2),
        between(rng, -1, 1),
      ] as Vec3,
      r: between(rng, 1.4, 2.6),
    }))
    return { base, scale: between(rng, 0.8, 1.5), puffs }
  })
}

/** 雲隨時間沿 +x 飄移（0.6／秒），超出 ±90 從另一側回來；y、z 不變，結果仍在外圈 */
export function cloudAt(c: Cloud, tSec: number): Vec3 {
  return [cloudX(c, tSec), c.base[1], c.base[2]]
}

/** cloudAt 的 x（不配置陣列，給每幀更新用） */
export function cloudX(c: Cloud, tSec: number): number {
  const span = 2 * X_LIMIT
  return ((((c.base[0] + DRIFT_SPEED * tSec + X_LIMIT) % span) + span) % span) - X_LIMIT
}

/** 只需 x/y/z 的點：three 的 Vector3 可直接傳入，不必每幀配置陣列 */
export interface XYZ {
  x: number
  y: number
  z: number
}

/** 雲與相機距離小於此值就視為遮擋 */
export const CLOUD_HIDE_DIST = 25
/** 雲中心到「相機 → 觀看目標」視線段的距離小於此值就視為遮擋（含雲團半徑：puff 展開約 ±5、scale 最大 1.5） */
export const CLOUD_SIGHT_RADIUS = 12
/** 超過門檻後再這麼遠才完全不透明，中間 smoothstep 過渡 */
export const CLOUD_FADE_BAND = 8

/** 第一人稱的觀看距離（FP_DIST=0.01）小於此值：只做近相機判斷，看向雲時不淡掉 */
export const FP_VIEW_DIST = 1

/** 預先算好的線段：起點 a、向量 d = b - a、|d|² */
export interface Segment {
  ax: number
  ay: number
  az: number
  dx: number
  dy: number
  dz: number
  len2: number
}

export const newSegment = (): Segment => ({ ax: 0, ay: 0, az: 0, dx: 0, dy: 0, dz: 0, len2: 0 })

/** 把線段 a→b 的資料寫進 out（不配置） */
export function prepareSegment(out: Segment, a: XYZ, b: XYZ): Segment {
  out.ax = a.x
  out.ay = a.y
  out.az = a.z
  out.dx = b.x - a.x
  out.dy = b.y - a.y
  out.dz = b.z - a.z
  out.len2 = out.dx * out.dx + out.dy * out.dy + out.dz * out.dz
  return out
}

/** 點 p 到預先算好的線段的距離（不配置） */
export function distToPrepared(p: XYZ, s: Segment): number {
  const t =
    s.len2 === 0
      ? 0
      : Math.min(1, Math.max(0, ((p.x - s.ax) * s.dx + (p.y - s.ay) * s.dy + (p.z - s.az) * s.dz) / s.len2))
  return Math.hypot(p.x - (s.ax + t * s.dx), p.y - (s.ay + t * s.dy), p.z - (s.az + t * s.dz))
}

const scratchSeg = newSegment()

/** 點 p 到線段 a→b 的距離 */
export function distToSegment(p: XYZ, a: XYZ, b: XYZ): number {
  return distToPrepared(p, prepareSegment(scratchSeg, a, b))
}

const smoothstep = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/** 要保護的辦公室樓板點：中心與四角 */
export const FLOOR_GUARD_POINTS: readonly XYZ[] = [
  { x: 0, y: 0, z: 0 },
  { x: HALF, y: 0, z: HALF },
  { x: HALF, y: 0, z: -HALF },
  { x: -HALF, y: 0, z: HALF },
  { x: -HALF, y: 0, z: -HALF },
]

/** 一幀的保護視線：相機位置、segs[0] 為實際視線段、其後為 cam→各樓板點；guard=false 時只做近相機判斷 */
export interface SightLines {
  cam: XYZ
  segs: Segment[]
  guard: boolean
}

export const newSightLines = (): SightLines => ({
  cam: { x: 0, y: 0, z: 0 },
  segs: Array.from({ length: 1 + FLOOR_GUARD_POINTS.length }, newSegment),
  guard: true,
})

/** 每幀算一次：viewDist 為相機到觀看目標的距離，小於 FP_VIEW_DIST（第一人稱）時不做視線與樓板判斷 */
export function prepareSightLines(out: SightLines, cam: XYZ, sightEnd: XYZ, viewDist: number): SightLines {
  out.cam.x = cam.x
  out.cam.y = cam.y
  out.cam.z = cam.z
  out.guard = viewDist >= FP_VIEW_DIST
  if (!out.guard) return out
  prepareSegment(out.segs[0]!, cam, sightEnd)
  FLOOR_GUARD_POINTS.forEach((p, i) => prepareSegment(out.segs[i + 1]!, cam, p))
  return out
}

/** 雲中心到各條保護視線的最短距離 */
export function sightDist(pos: XYZ, lines: SightLines): number {
  let d = Infinity
  for (const s of lines.segs) d = Math.min(d, distToPrepared(pos, s))
  return d
}

/** 雲該有的不透明度：擋在任一保護視線上或貼近相機為 0，離門檻 CLOUD_FADE_BAND 外為 1 */
export function opacityFor(pos: XYZ, lines: SightLines): number {
  const { cam } = lines
  const near = smoothstep(
    CLOUD_HIDE_DIST,
    CLOUD_HIDE_DIST + CLOUD_FADE_BAND,
    Math.hypot(pos.x - cam.x, pos.y - cam.y, pos.z - cam.z),
  )
  if (!lines.guard) return near
  return Math.min(near, smoothstep(CLOUD_SIGHT_RADIUS, CLOUD_SIGHT_RADIUS + CLOUD_FADE_BAND, sightDist(pos, lines)))
}

const scratchLines = newSightLines()

/** 單次便利版：viewDist 預設為 cam 到 sightEnd 的距離 */
export function cloudOpacity(
  pos: XYZ,
  cam: XYZ,
  sightEnd: XYZ,
  viewDist = Math.hypot(sightEnd.x - cam.x, sightEnd.y - cam.y, sightEnd.z - cam.z),
): number {
  return opacityFor(pos, prepareSightLines(scratchLines, cam, sightEnd, viewDist))
}

/** 雲中心到各條保護視線的最短距離（單次便利版） */
export function cloudSightDist(pos: XYZ, cam: XYZ, sightEnd: XYZ): number {
  return sightDist(pos, prepareSightLines(scratchLines, cam, sightEnd, Infinity))
}

/** 雲是否遮擋辦公室（不透明度為 0） */
export function cloudOccludes(pos: XYZ, cam: XYZ, sightEnd: XYZ, viewDist?: number): boolean {
  return cloudOpacity(pos, cam, sightEnd, viewDist) === 0
}
