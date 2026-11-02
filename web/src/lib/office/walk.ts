/** 第一人稱：眼睛高度、身體半徑、步行速度（每秒） */
export const EYE = 1.6
export const BODY_R = 0.3
export const WALK_SPEED = 3

/** 牆在地面上的投影（x0<x1、z0<z1） */
export interface Rect2 {
  x0: number
  z0: number
  x1: number
  z1: number
}

/** 鏡頭方位角 → 前進／右移量換成世界 xz；方位角 0 時面向 -z */
export function walkDelta(azimuth: number, forward: number, right: number): [number, number] {
  const fx = -Math.sin(azimuth)
  const fz = -Math.cos(azimuth)
  return [forward * fx - right * fz, forward * fz + right * fx]
}

/** 半徑 r 的圓是否壓到任一面牆 */
export function hitsWall(x: number, z: number, walls: readonly Rect2[], r = BODY_R): boolean {
  return walls.some((w) => x > w.x0 - r && x < w.x1 + r && z > w.z0 - r && z < w.z1 + r)
}

/** 先走 x 再走 z，撞牆的那一軸不動（貼牆滑行）；整體限制在 ±half 內 */
export function slide(
  from: [number, number],
  d: [number, number],
  walls: readonly Rect2[],
  half: number,
  r = BODY_R,
): [number, number] {
  const lim = half - r
  const clamp = (v: number) => Math.min(Math.max(v, -lim), lim)
  let [x, z] = from
  const nx = clamp(x + d[0])
  if (!hitsWall(nx, z, walls, r)) x = nx
  const nz = clamp(z + d[1])
  if (!hitsWall(x, nz, walls, r)) z = nz
  return [x, z]
}
