import type { OfficeDept } from '../../../../shared/office'
import { ATRIUM_SOFAS, COMMONS, deptZone, TREE_R, zonePoint, type Vec3 } from './layout'
import { COFFEE_SPOT, type NpcSpot } from './npc'

// 生活設施與站位（座標慣例同 npc.ts：facing 是 rotation-y，模型本地面向 +z）。
// 飲水機、影印機放中庭外環（|x|≈8、z=-6.6），站位都在設施南側，走廊進出的直線路徑不穿過本體；
// 白板在各部門區靠走廊那條邊（d≈0.3），面向走廊，站位在走廊外半側，不佔走廊中線。

const [CX, , CZ] = COMMONS.pantry
/** rotation-y 讓模型 +z 指向 (dx, dz) */
const faceToward = (dx: number, dz: number) => Math.atan2(dx, dz)
const lookAt = (at: Vec3, target: Vec3): NpcSpot => ({ at, facing: faceToward(target[0] - at[0], target[2] - at[2]) })
/** 模型 local (lx, lz) 經 rotation-y φ 後的世界位移 */
const rotate = (lx: number, lz: number, phi: number): [number, number] => [
  lx * Math.cos(phi) + lz * Math.sin(phi),
  -lx * Math.sin(phi) + lz * Math.cos(phi),
]

/** 飲水機：中庭東北外環，正面朝南 */
export const WATER_COOLER: NpcSpot = { at: [CX + 8, 0, CZ - 6.6], facing: 0 }
/** 影印機：中庭西北外環，正面朝南 */
export const COPIER: NpcSpot = { at: [CX - 8, 0, CZ - 6.6], facing: 0 }

/** 飲水機前的聊天圈：圈心在正面 WATER_CHAT_IN 處，半徑 WATER_CHAT_R */
const WATER_CHAT_IN = 1.1
const WATER_CHAT_R = 0.7
/** 咖啡排隊間距 */
const QUEUE_STEP = 0.9

/**
 * 咖啡隊伍相對 COFFEE_SPOT 的 (後, 右) 位移（以咖啡機為前）：後一格、右轉一格、再往前折回，
 * 繞開正後方的 NPC 聊天圈心 CHAT_CENTERS[3] 與往 pantry slot 5 的 x=-1.84 直線
 */
const QUEUE: [number, number][] = [
  [0, 0],
  [QUEUE_STEP, 0],
  [QUEUE_STEP, QUEUE_STEP],
  [0, QUEUE_STEP],
]

/** k=0 站咖啡機前（COFFEE_SPOT）面向咖啡機，其後每 QUEUE_STEP 一位、面向前一人；k clamp 到 0..3 */
export function coffeeQueueSpot(k: number): NpcSpot {
  const spot = (n: number): Vec3 => {
    const [back, right] = QUEUE[n]
    const [fx, fz] = [Math.sin(COFFEE_SPOT.facing), Math.cos(COFFEE_SPOT.facing)]
    const [x, y, z] = COFFEE_SPOT.at
    // 面向 (fx, fz) 時的右手方向是 (-fz, fx)
    return [x - fx * back - fz * right, y, z - fz * back + fx * right]
  }
  const n = Math.min(Math.max(Math.floor(k), 0), QUEUE.length - 1)
  return n === 0 ? COFFEE_SPOT : lookAt(spot(n), spot(n - 1))
}

/** 飲水機前半圈：圈心左、遠、右三點，面向圈心 */
export function waterChatSpot(k: 0 | 1 | 2): NpcSpot {
  const { at, facing } = WATER_COOLER
  const [fx, fz] = [Math.sin(facing), Math.cos(facing)]
  const c: Vec3 = [at[0] + fx * WATER_CHAT_IN, 0, at[2] + fz * WATER_CHAT_IN]
  // 以正面方向為 0，k=0 轉 +90°、k=1 0°、k=2 -90°
  const turn = facing + (Math.PI / 2) * (1 - k)
  return lookAt([c[0] + Math.sin(turn) * WATER_CHAT_R, 0, c[2] + Math.cos(turn) * WATER_CHAT_R], c)
}

/** loungeDesignSofa.glb（×2）原點在角落、x 0..2.24、z -0.82..0、正面 +z：座面中心 */
const SOFA_SEAT: [number, number] = [1.12, -0.4]

/** ATRIUM_SOFAS[k] 的座面中心，面向沙發正面（Atrium 以 facing + π 擺沙發） */
export function sofaSeat(k: 0 | 1 | 2 | 3): NpcSpot {
  const s = ATRIUM_SOFAS[k]
  const phi = s.facing + Math.PI
  const [dx, dz] = rotate(SOFA_SEAT[0], SOFA_SEAT[1], phi)
  return { at: [CX + s.position[0] + dx, 0, CZ + s.position[2] + dz], facing: phi }
}

/** 影印機前：k=0 修機器的人貼著正面，1–2 在他身後左右圍觀，都面向影印機 */
export function copierSpot(k: 0 | 1 | 2): NpcSpot {
  const { at, facing } = COPIER
  const [fx, fz] = [Math.sin(facing), Math.cos(facing)]
  const [rx, rz] = [fz, -fx]
  const [out, side] = k === 0 ? [0.9, 0] : [1.7, k === 1 ? -0.7 : 0.7]
  return lookAt([at[0] + fx * out + rx * side, 0, at[2] + fz * out + rz * side], at)
}

/** 白板在部門區局部座標的 a（散座與 manager 之間的空檔、避開 plan 桌）與 d（貼走廊邊） */
const BOARD_A = -3
const BOARD_D = 0.3
/** 看白板的人站在走廊外半側（走廊中線在 d=-2） */
const VIEW_D = -0.9
const VIEW_A = [0, -0.9, 0.9] as const

/** 每部門一面，在部門區靠中庭（走廊）那條邊，正面朝走廊 */
export function whiteboard(dept: OfficeDept): NpcSpot {
  const { n } = deptZone(dept)
  return { at: zonePoint(dept, BOARD_A, BOARD_D), facing: faceToward(-n[0], -n[1]) }
}

/** 白板前：k=0 正前方，1、2 左右，都面向白板 */
export function whiteboardSpot(dept: OfficeDept, k: 0 | 1 | 2): NpcSpot {
  return lookAt(zonePoint(dept, BOARD_A + VIEW_A[k], VIEW_D), whiteboard(dept).at)
}

/** Atrium 的環形長椅：BENCHES 張、圓心距 TREE_R、benchCushion.glb（×2）原點在角落、x 0..0.8、z -0.4..0、正面朝外 */
const BENCHES = 8
const BENCH_SEAT: [number, number] = [0.4, -0.2]

/** 中庭吃飯位：大樹旁每張環形長椅一位，坐在座面中心、面朝外 */
export const LUNCH_SEATS: NpcSpot[] = Array.from({ length: BENCHES }, (_, k) => {
  const a = (k * 2 * Math.PI) / BENCHES
  const x = Math.cos(a) * TREE_R
  const z = Math.sin(a) * TREE_R
  const phi = Math.atan2(x, z)
  const [dx, dz] = rotate(BENCH_SEAT[0], BENCH_SEAT[1], phi)
  return { at: [CX + x + dx, 0, CZ + z + dz] as Vec3, facing: phi }
})
