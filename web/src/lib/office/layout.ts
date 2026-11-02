import type { OfficeAgent } from '../../../../shared/api'
import { OFFICE_DEPTS, type OfficeDept } from '../../../../shared/office'

export type Vec3 = [number, number, number]
/** group = plan slug 或 'desks'／'manager'；table = plan 會議桌號（非 plan group 為 0） */
export type Seat = { dept: OfficeDept; group: string; table: number; index: number }
export type SeatMap = Map<string, Seat>
export type CommonKey =
  'review' | 'mailbox' | 'counter' | 'serverRoom' | 'archive' | 'monitorWall' | 'library' | 'meeting' | 'pantry'

// 格局（原點＝中庭中心，北＝-z，東＝+x）：北／東／西三翼各分兩個部門區，南翼是大廳，四角是房間，
// 中庭外圍一圈環形走廊。部門區局部座標：a 沿翼（u）、d 由走廊往窗（n），世界座標 = base + a·u + d·n。

/** 外框半寬（整層 2·HALF 見方） */
export const HALF = 24
/** 翼與角落房間的內緣 */
export const WING_IN = 13
/** 中庭外緣（走廊內緣） */
export const RING_IN = 9
/** 環形走廊中線的半寬：走路沿 |x|、|z| = CORRIDOR 的正方形 */
export const CORRIDOR = 11
/** 部門區沿翼寬、深（a ∈ [-ZONE_W/2, ZONE_W/2]、d ∈ [0, ZONE_D]） */
export const ZONE_W = 13
export const ZONE_D = 11
/** 中庭大樹與環形長椅的半徑 */
export const TREE_R = 1.6
export const FLOOR_W = 2 * HALF
export const FLOOR_D = 2 * HALF

export const DEPT_ORDER: OfficeDept[] = [...OFFICE_DEPTS, 'west-south']

export type Dir2 = [number, number]
/** base：區靠走廊那邊（d=0）的中點；n：往窗的外向；u：沿翼 */
export interface DeptZone {
  base: Vec3
  n: Dir2
  u: Dir2
}

const ZONES: Record<OfficeDept, DeptZone> = {
  'north-west': { base: [-6.5, 0, -13], n: [0, -1], u: [1, 0] },
  'north-east': { base: [6.5, 0, -13], n: [0, -1], u: [1, 0] },
  'east-north': { base: [13, 0, -6.5], n: [1, 0], u: [0, 1] },
  'east-south': { base: [13, 0, 6.5], n: [1, 0], u: [0, 1] },
  'west-north': { base: [-13, 0, -6.5], n: [-1, 0], u: [0, -1] },
  'west-south': { base: [-13, 0, 6.5], n: [-1, 0], u: [0, -1] },
}

export function deptZone(dept: OfficeDept): DeptZone {
  return ZONES[dept] ?? ZONES['west-south']
}

export function zonePoint(dept: OfficeDept, a: number, d: number): Vec3 {
  const { base, n, u } = deptZone(dept)
  return [base[0] + a * u[0] + d * n[0], 0, base[2] + a * u[1] + d * n[1]]
}

/** rotation-y 讓 local +x 對齊該區 u（北翼 0、東翼 -π/2、西翼 π/2） */
export function zoneYaw(dept: OfficeDept): number {
  const { u } = deptZone(dept)
  return Math.atan2(-u[1], u[0])
}

/** rotation-y 讓 local -z 指向 (dx, dz) */
const yawToward = (dx: number, dz: number) => Math.atan2(-dx, -dz)

export type CornerKey = 'nw' | 'ne' | 'sw' | 'se'
type Rect = { x0: number; z0: number; x1: number; z1: number }
/** 四角房間：門口在內角；door＝門內點，ring＝對應的走廊角 */
export const CORNER_ROOMS: Record<CornerKey, Rect & { door: Vec3; ring: Vec3 }> = {
  nw: { x0: -HALF, z0: -HALF, x1: -WING_IN, z1: -WING_IN, door: [-14, 0, -14], ring: [-CORRIDOR, 0, -CORRIDOR] },
  ne: { x0: WING_IN, z0: -HALF, x1: HALF, z1: -WING_IN, door: [14, 0, -14], ring: [CORRIDOR, 0, -CORRIDOR] },
  sw: { x0: -HALF, z0: WING_IN, x1: -WING_IN, z1: HALF, door: [-14, 0, 14], ring: [-CORRIDOR, 0, CORRIDOR] },
  se: { x0: WING_IN, z0: WING_IN, x1: HALF, z1: HALF, door: [14, 0, 14], ring: [CORRIDOR, 0, CORRIDOR] },
}

/** 南翼入口大廳 */
export const LOBBY: Rect = { x0: -WING_IN, z0: WING_IN, x1: WING_IN, z1: HALF }

/** 中庭四組沙發：角度 45°+90°k、半徑 6；facing 是 rotation-y，local -z 指向原點（同 seatFacing 慣例） */
export const ATRIUM_SOFAS: { position: Vec3; facing: number }[] = [0, 1, 2, 3].map((k) => {
  const angle = Math.PI / 4 + (k * Math.PI) / 2
  const x = Math.cos(angle) * 6
  const z = Math.sin(angle) * 6
  return { position: [x, 0, z] as Vec3, facing: yawToward(-x, -z) }
})

// 部門區內配置：散座靠窗（d 大）面向窗、manager 在靠走廊的角落、plan 會議桌靠走廊側
const DESK_A = [-4.4, -2.8, -1.2]
const DESK_D0 = 9.6
const DESK_STEP_D = 2
const MANAGER_A = -5.8
const MANAGER_D0 = 0.8
const MANAGER_STEP = 1.5
const TABLE_SEATS = 6
const TABLE_A = [2.0, 5.0]
/** 巡視時站在座位外側多遠 */
const PATROL_OUT = 0.6
/** reviewer 站在 target 座位旁多遠 */
const REVIEW_OFF = 1

export const COMMONS: Record<CommonKey, Vec3> = {
  serverRoom: [-20, 0, -17],
  monitorWall: [-16, 0, -22],
  meeting: [18.5, 0, -18.5],
  library: [-20, 0, 17],
  archive: [-16, 0, 21],
  review: [3, 0, 17],
  counter: [-7, 0, 17],
  mailbox: [7, 0, 17],
  pantry: [0, 0, 0],
}

/** 南牆中央的大門：codex-bot 進出、fixer 出場的起點 */
export const DOOR: Vec3 = [0, 0, HALF]

/** 你的主管室：東南角房間 */
export const MANAGER_OFFICE: Vec3 = [18.5, 0, 18.5]

function isPlanGroup(group: string): boolean {
  return group !== 'desks' && group !== 'manager'
}

/** FNV-1a 32-bit */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function groupOf(a: OfficeAgent): string {
  if (a.slug) return a.slug
  return a.job === 'manager' ? 'manager' : 'desks'
}

const groupKey = (dept: OfficeDept, group: string) => `${dept}\u0000${group}`

function smallestFree(used: Set<number>): number {
  let n = 0
  while (used.has(n)) n++
  used.add(n)
  return n
}

/**
 * 已有座位的保留原 index；新 agent 取該 group 最小空 index；不在 agents 的移除。
 * plan group 的桌號在還有任何成員時保留；新 plan 取該部門最小空桌號；成員全走桌子才釋出。
 */
export function assignSeats(prev: SeatMap, agents: OfficeAgent[]): SeatMap {
  const present = new Set(agents.filter((a) => isPlanGroup(groupOf(a))).map((a) => groupKey(a.dept, groupOf(a))))
  const tableOf = new Map<string, number>()
  const tablesUsed = new Map<OfficeDept, Set<number>>()
  const tablesIn = (d: OfficeDept) => {
    let s = tablesUsed.get(d)
    if (!s) tablesUsed.set(d, (s = new Set()))
    return s
  }
  for (const s of prev.values()) {
    const k = groupKey(s.dept, s.group)
    if (!isPlanGroup(s.group) || !present.has(k) || tableOf.has(k)) continue
    tableOf.set(k, s.table)
    tablesIn(s.dept).add(s.table)
  }
  for (const a of agents) {
    const g = groupOf(a)
    const k = groupKey(a.dept, g)
    if (isPlanGroup(g) && !tableOf.has(k)) tableOf.set(k, smallestFree(tablesIn(a.dept)))
  }

  const next: SeatMap = new Map()
  const taken = new Map<string, Set<number>>()
  const takenOf = (k: string) => {
    let s = taken.get(k)
    if (!s) taken.set(k, (s = new Set()))
    return s
  }
  const fresh: OfficeAgent[] = []
  for (const a of agents) {
    const old = prev.get(a.id)
    const g = groupOf(a)
    if (old && old.dept === a.dept && old.group === g && old.table === (tableOf.get(groupKey(a.dept, g)) ?? 0)) {
      next.set(a.id, old)
      takenOf(groupKey(a.dept, g)).add(old.index)
    } else fresh.push(a)
  }
  for (const a of fresh) {
    const g = groupOf(a)
    const k = groupKey(a.dept, g)
    next.set(a.id, { dept: a.dept, group: g, table: tableOf.get(k) ?? 0, index: smallestFree(takenOf(k)) })
  }
  return next
}

/** plan 第 table 號桌中心的 (a, d)：每排 2 張，先往窗長兩排，再往走廊方向長 */
function tableAD(table: number): { a: number; d: number } {
  const r = Math.floor(table / 2)
  return { a: TABLE_A[table % 2], d: r < 2 ? 2.5 + 4 * r : 2.5 - 4 * (r - 1) }
}

/** plan 座位：每桌 6 座（兩側各 3，沿 a 取 -1／0／+1）；超過 6 人往外加一圈（每圈外推 0.5）。side -1＝靠走廊那側 */
function planSeat(seat: Seat): { a: number; d: number; side: number; table: { a: number; d: number } } {
  const table = tableAD(seat.table)
  const ring = Math.floor(seat.index / TABLE_SEATS)
  const k = seat.index % TABLE_SEATS
  const side = k < TABLE_SEATS / 2 ? -1 : 1
  const along = (k % (TABLE_SEATS / 2)) - 1
  return { a: table.a + along, d: table.d + side * (1 + ring * 0.5), side, table }
}

function seatAD(seat: Seat): { a: number; d: number } {
  const i = seat.index
  if (seat.group === 'manager') return { a: MANAGER_A, d: MANAGER_D0 + i * MANAGER_STEP }
  if (seat.group === 'desks')
    return { a: DESK_A[i % DESK_A.length], d: DESK_D0 - Math.floor(i / DESK_A.length) * DESK_STEP_D }
  return planSeat(seat)
}

export function seatPosition(seat: Seat): Vec3 {
  const { a, d } = seatAD(seat)
  return zonePoint(seat.dept, a, d)
}

/** rotation-y 讓 local -z 指向面對方向（Desk 慣例；Character 面向 local +z，要再加 π）：散座／manager 面向窗，plan 成員面向桌心 */
export function seatFacing(seat: Seat): number {
  const { n } = deptZone(seat.dept)
  const s = isPlanGroup(seat.group) ? -planSeat(seat).side : 1
  return yawToward(s * n[0], s * n[1])
}

/** plan slug → 第 table 號桌中心；其他 group → 部門區中心 */
export function groupCenter(dept: OfficeDept, group: string, table = 0): Vec3 {
  if (!isPlanGroup(group)) return zonePoint(dept, 0, ZONE_D / 2)
  const { a, d } = tableAD(table)
  return zonePoint(dept, a, d)
}

/** plan 成員的螢幕離桌心沿 d 多遠（放在自己那側桌緣） */
export const PLAN_SCREEN_DZ = 0.4

/** plan 成員的螢幕落點（地面高度）：與座位同 a、桌心 d 往自己那側 PLAN_SCREEN_DZ */
export function planScreenPosition(seat: Seat): Vec3 {
  const { a, side, table } = planSeat(seat)
  return zonePoint(seat.dept, a, table.d + side * PLAN_SCREEN_DZ)
}

/** 巡視站點：plan 座位沿 d 往離桌心方向外推；其他座位往身後（走廊側）退 */
export function patrolSpot(seat: Seat): Vec3 {
  const { a, d } = seatAD(seat)
  const out = isPlanGroup(seat.group) ? planSeat(seat).side : -1
  return zonePoint(seat.dept, a, d + out * PATROL_OUT)
}

/**
 * reviewer 站在 target 座位旁：散座／manager 沿該區 u 偏 +1（東西翼不會站進桌子）；
 * plan 成員沿 d 往離桌心方向退 1（站在椅子後，區邊緣的座位不會站進角落房間）
 */
export function reviewSpot(seat: Seat): Vec3 {
  if (isPlanGroup(seat.group)) {
    const { a, d, side } = planSeat(seat)
    return zonePoint(seat.dept, a, d + side * REVIEW_OFF)
  }
  const { a, d } = seatAD(seat)
  return zonePoint(seat.dept, a + REVIEW_OFF, d)
}

/** 部門名標籤：區內靠走廊那側 */
export function deptLabelPos(dept: OfficeDept): Vec3 {
  return zonePoint(dept, 0, 0.4)
}

const PANTRY_SPOTS = 8

/** session done 時的閒晃位置：中庭內、避開大樹與沙發，依 id 固定 */
export function pantrySpot(id: string): Vec3 {
  const [px, , pz] = COMMONS.pantry
  const slot = hash(id) % PANTRY_SPOTS
  const angle = ((slot * 45 + 22.5) * Math.PI) / 180
  const r = slot % 2 === 0 ? 3 : 4.8
  return [px + Math.cos(angle) * r, 0, pz + Math.sin(angle) * r]
}
