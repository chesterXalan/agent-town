import { CORNER_ROOMS, CORRIDOR, type Vec3 } from './layout'

const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const clamp = (v: number) => Math.min(CORRIDOR, Math.max(-CORRIDOR, v))
const sign = (v: number) => (v < 0 ? -1 : 1)

/** 走廊正方形周長；參數 s 從西北角 (-C,-C) 起順時針（俯視：先往 +x） */
const SIDE = 2 * CORRIDOR
const PERIMETER = 4 * SIDE
const RING_CORNERS: { s: number; p: Vec3 }[] = [
  { s: 0, p: [-CORRIDOR, 0, -CORRIDOR] },
  { s: SIDE, p: [CORRIDOR, 0, -CORRIDOR] },
  { s: 2 * SIDE, p: [CORRIDOR, 0, CORRIDOR] },
  { s: 3 * SIDE, p: [-CORRIDOR, 0, CORRIDOR] },
]

function roomOf(p: Vec3) {
  return Object.values(CORNER_ROOMS).find((r) => p[0] >= r.x0 && p[0] <= r.x1 && p[2] >= r.z0 && p[2] <= r.z1)
}

/** 投到走廊中線（半寬 CORRIDOR 的正方形）上 */
function project(p: Vec3): Vec3 {
  return Math.abs(p[0]) >= Math.abs(p[2])
    ? [sign(p[0]) * CORRIDOR, 0, clamp(p[2])]
    : [clamp(p[0]), 0, sign(p[2]) * CORRIDOR]
}

/** 從 p 走到走廊上的點序列：角落房間經門內點到走廊角，其他直接投影 */
function exit(p: Vec3): Vec3[] {
  const room = roomOf(p)
  return room ? [room.door, room.ring] : [project(p)]
}

/** 走廊上的點 → 周長參數 */
function param(p: Vec3): number {
  const [x, , z] = p
  if (z === -CORRIDOR && x < CORRIDOR) return x + CORRIDOR
  if (x === CORRIDOR && z < CORRIDOR) return SIDE + z + CORRIDOR
  if (z === CORRIDOR && x > -CORRIDOR) return 2 * SIDE + CORRIDOR - x
  return 3 * SIDE + CORRIDOR - z
}

/** 走廊上 a → b：順、逆時針取較短，依序插入經過的走廊角 */
function alongRing(a: Vec3, b: Vec3): Vec3[] {
  const sa = param(a)
  const fwd = (((param(b) - sa) % PERIMETER) + PERIMETER) % PERIMETER
  const dir = fwd <= PERIMETER - fwd ? 1 : -1
  const len = dir > 0 ? fwd : PERIMETER - fwd
  const passed = RING_CORNERS.map((c) => ({ p: c.p, t: (((dir * (c.s - sa)) % PERIMETER) + PERIMETER) % PERIMETER }))
    .filter((c) => c.t > 0 && c.t < len)
    .sort((x, y) => x.t - y.t)
  return [a, ...passed.map((c) => c.p), b]
}

/** from → 走廊出口 → 沿環形走廊（較短方向，經過轉角）→ 目的地入口 → to；相鄰重複點去掉 */
export function ringPath(from: Vec3, to: Vec3): Vec3[] {
  const room = roomOf(from)
  if (room && room === roomOf(to)) return same(from, to) ? [from] : [from, to]
  const out = exit(from)
  const into = exit(to).reverse()
  const pts: Vec3[] = [from, ...out.slice(0, -1), ...alongRing(out[out.length - 1], into[0]), ...into.slice(1), to]
  return pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]))
}
