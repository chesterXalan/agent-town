import { useEffect, useMemo } from 'react'
import { BoxGeometry, MeshStandardMaterial } from 'three'
import { CORNER_ROOMS, DEPT_ORDER, DOOR, deptZone, HALF, WING_IN, ZONE_D, type Vec3 } from '@/lib/office/layout'
import { readToken } from '@/lib/office/tokens'
import { EYE, type Rect2 } from '@/lib/office/walk'

type Mat = 'wall' | 'trim' | 'glass'
/** 一個方塊：中心、尺寸（x, y, z）、材質 */
interface Box {
  pos: Vec3
  size: Vec3
  mat: Mat
}
/** 軸向牆：沿 axis 從 s0 到 s1，另一軸固定在 at */
interface Line {
  axis: 'x' | 'z'
  at: number
}

/** 外牆厚 */
const T = 0.2
const EXT_H = 3.2
const BAY = 2.4
const PILLAR = 0.3
const SILL = 0.9
const HEAD = 2.4
const BASEBOARD = 0.12
const PLINTH_H = 0.3
/** 大門兩側各留多寬 */
const DOOR_HALF = 1.2
const GLASS_H = 2.8
const GLASS_DOOR = 1.4
const MULLION_STEP = 1.5
const DIVIDER_H = 1.1
const DIVIDER_T = 0.1

/** 沿牆 [s0, s1]、高 [y0, y1]、厚 t 的方塊 */
function seg(l: Line, s0: number, s1: number, y0: number, y1: number, t: number, mat: Mat): Box {
  const s = (s0 + s1) / 2
  const y = (y0 + y1) / 2
  const len = s1 - s0
  return l.axis === 'x'
    ? { pos: [s, y, l.at], size: [len, y1 - y0, t], mat }
    : { pos: [l.at, y, s], size: [t, y1 - y0, len], mat }
}

/** [s0, s1] 扣掉 gaps 後剩下的段 */
function pieces(s0: number, s1: number, gaps: [number, number][] = []): [number, number][] {
  const out: [number, number][] = []
  let s = s0
  for (const [g0, g1] of gaps) {
    if (g0 > s) out.push([s, g0])
    s = Math.max(s, g1)
  }
  if (s < s1) out.push([s, s1])
  return out
}

/** 全高開窗外牆：每 BAY 一扇窗（窗台 SILL、窗頂 HEAD），窗間立柱，牆腳一條踢腳板 */
function windowWall(l: Line, s0: number, s1: number): Box[] {
  const len = s1 - s0
  const bays = Math.max(1, Math.round(len / BAY))
  const bw = len / bays
  const out: Box[] = []
  for (let i = 0; i < bays; i++) {
    const a = s0 + bw * i
    const b = a + bw
    out.push(seg(l, a, a + PILLAR, 0, EXT_H, T + 0.04, 'wall'))
    out.push(seg(l, a, b, 0, SILL, T, 'wall'))
    out.push(seg(l, a, b, HEAD, EXT_H, T, 'wall'))
    out.push(seg(l, a, b, SILL, SILL + 0.06, T + 0.12, 'trim'))
    out.push(seg(l, a + PILLAR, b, SILL, HEAD, 0.04, 'glass'))
  }
  out.push(seg(l, s1 - PILLAR, s1, 0, EXT_H, T + 0.04, 'wall'))
  out.push(seg(l, s0, s1, 0, BASEBOARD, T + 0.03, 'trim'))
  return out
}

/** 只有牆腳的外牆（南、東：鏡頭從東南方看進來） */
function plinth(l: Line, s0: number, s1: number, gaps?: [number, number][]): Box[] {
  return pieces(s0, s1, gaps).map(([a, b]) => seg(l, a, b, 0, PLINTH_H, T, 'wall'))
}

/** 玻璃隔間：上下框、每約 MULLION_STEP 一根直框、整片玻璃；gaps 開門 */
function glassWall(l: Line, s0: number, s1: number, gaps: [number, number][]): Box[] {
  const out: Box[] = []
  for (const [a, b] of pieces(s0, s1, gaps)) {
    const len = b - a
    out.push(seg(l, a, b, 0, 0.12, 0.1, 'trim'))
    out.push(seg(l, a, b, GLASS_H - 0.08, GLASS_H, 0.1, 'trim'))
    const n = Math.max(1, Math.round(len / MULLION_STEP))
    for (let i = 0; i <= n; i++) {
      const c = Math.min(Math.max(a + (len * i) / n, a + 0.03), b - 0.03)
      out.push(seg(l, c - 0.03, c + 0.03, 0, GLASS_H, 0.1, 'trim'))
    }
    out.push(seg(l, a, b, 0.1, GLASS_H - 0.1, 0.03, 'glass'))
  }
  return out
}

/** 四角房間面向內側的兩面玻璃隔間，門口 GLASS_DOOR 開在內角 */
function cornerPartitions(): Box[] {
  return Object.values(CORNER_ROOMS).flatMap((r) => {
    const sx = Math.sign(r.door[0])
    const sz = Math.sign(r.door[2])
    const innerX = sx * WING_IN
    const innerZ = sz * WING_IN
    const gapZ: [number, number] = sz < 0 ? [innerZ - GLASS_DOOR, innerZ] : [innerZ, innerZ + GLASS_DOOR]
    const gapX: [number, number] = sx < 0 ? [innerX - GLASS_DOOR, innerX] : [innerX, innerX + GLASS_DOOR]
    return [
      ...glassWall({ axis: 'z', at: innerX }, r.z0, r.z1, [gapZ]),
      ...glassWall({ axis: 'x', at: innerZ }, r.x0, r.x1, [gapX]),
    ]
  })
}

/** 同翼兩部門（外向 n 相同）之間的半高隔板：從走廊邊到窗 */
function dividers(): Box[] {
  const out: Box[] = []
  DEPT_ORDER.forEach((a, i) => {
    for (const b of DEPT_ORDER.slice(i + 1)) {
      const za = deptZone(a)
      const zb = deptZone(b)
      if (za.n[0] !== zb.n[0] || za.n[1] !== zb.n[1]) continue
      const mx = (za.base[0] + zb.base[0]) / 2
      const mz = (za.base[2] + zb.base[2]) / 2
      const [nx, nz] = za.n
      const l: Line = nx === 0 ? { axis: 'z', at: mx } : { axis: 'x', at: mz }
      const from = nx === 0 ? mz : mx
      const to = from + ZONE_D * (nx === 0 ? nz : nx)
      out.push(seg(l, Math.min(from, to), Math.max(from, to), 0, DIVIDER_H, DIVIDER_T, 'wall'))
    }
  })
  return out
}

const BOXES: Box[] = [
  ...windowWall({ axis: 'x', at: -HALF }, -HALF, HALF),
  ...windowWall({ axis: 'z', at: -HALF }, -HALF, HALF),
  ...plinth({ axis: 'x', at: HALF }, -HALF, HALF, [[DOOR[0] - DOOR_HALF, DOOR[0] + DOOR_HALF]]),
  ...plinth({ axis: 'z', at: HALF }, -HALF, HALF),
  ...cornerPartitions(),
  ...dividers(),
]

/** 第一人稱的碰撞牆：底部低於眼睛的方塊投影到地面（門口是 pieces 留下的空隙） */
export const WALL_FOOTPRINTS: Rect2[] = BOXES.filter((b) => b.pos[1] - b.size[1] / 2 < EYE).map((b) => ({
  x0: b.pos[0] - b.size[0] / 2,
  z0: b.pos[2] - b.size[2] / 2,
  x1: b.pos[0] + b.size[0] / 2,
  z1: b.pos[2] + b.size[2] / 2,
}))

/** 牆、窗、玻璃隔間與部門隔板：box geometry ＋ token 色（不用 Kenney 牆段，顏色才吃得到 token） */
export function Walls() {
  const unit = useMemo(() => new BoxGeometry(1, 1, 1), [])
  useEffect(() => () => unit.dispose(), [unit])
  const mats = useMemo<Record<Mat, MeshStandardMaterial>>(
    () => ({
      wall: new MeshStandardMaterial({ color: readToken('--office-wall'), roughness: 0.85 }),
      trim: new MeshStandardMaterial({ color: readToken('--office-trim'), roughness: 0.85 }),
      glass: new MeshStandardMaterial({
        color: readToken('--office-glass'),
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        depthWrite: false,
      }),
    }),
    [],
  )
  useEffect(
    () => () => {
      for (const m of Object.values(mats)) m.dispose()
    },
    [mats],
  )

  return (
    <group>
      {BOXES.map((b, i) => (
        <mesh
          key={i}
          geometry={unit}
          material={mats[b.mat]}
          position={b.pos}
          scale={b.size}
          castShadow={b.mat !== 'glass'}
          receiveShadow
        />
      ))}
    </group>
  )
}
