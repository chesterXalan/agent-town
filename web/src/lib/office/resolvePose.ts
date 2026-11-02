import type { OfficeAgent } from '../../../../shared/api'
import type { FigureAnim } from './anim'
import type { EventPose } from './eventQueue'
import { pantrySpot, seatFacing, seatPosition, type Seat, type Vec3 } from './layout'
import type { CarryProp } from './life'
import type { LifePose } from './lifeRun'
import { LUNCH_SEATS, sofaSeat } from './lifeSpots'
import type { Emote } from './mood'

/**
 * 一個 agent 這一幀怎麼畫；facing null 表示沿用座位朝向（走路時跟著移動方向）。
 * lift：生活行程坐在沙發／長椅時模型抬高多少（座位上的坐姿由 Character 自己抬，這裡為 0）；line：生活行程的台詞
 */
export interface AgentDraw {
  position: Vec3
  anim: FigureAnim | null
  facing: number | null
  seated: boolean
  carry: CarryProp | null
  emote: Emote | null
  lift: number
  line: string | null
}

/** sit clip 的臀高：(腿根 0.176 − root 下移 0.15) × FIGURE_SCALE 1.4 ≈ 0.037 */
const SIT_HIP = 0.037
/** 中庭家具的縮放（Atrium 的 S） */
const ATRIUM_SCALE = 2
/** loungeDesignSofa.glb 座面中心 (0.56, -0.2) 的座墊頂 y（模型原尺寸，三角形取樣實測） */
const SOFA_SEAT_TOP = 0.23
/** benchCushion.glb 座面中心 (0.2, -0.1) 的座墊頂 y（模型原尺寸，三角形取樣實測） */
const BENCH_SEAT_TOP = 0.24
/** 坐沙發時抬高：0.23 × 2 − 0.037 ≈ 0.42 */
export const SOFA_LIFT = SOFA_SEAT_TOP * ATRIUM_SCALE - SIT_HIP
/** 坐中庭長椅（午餐）時抬高：0.24 × 2 − 0.037 ≈ 0.44 */
export const BENCH_LIFT = BENCH_SEAT_TOP * ATRIUM_SCALE - SIT_HIP

const SOFA_SPOTS: readonly Vec3[] = ([0, 1, 2, 3] as const).map((k) => sofaSeat(k).at)
const BENCH_SPOTS: readonly Vec3[] = LUNCH_SEATS.map((s) => s.at)
const near = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-3

/** 生活姿勢坐在哪件家具上就抬到它的座墊頂；不是 sit 或不在沙發／長椅座位上為 0 */
export function lifeSeatLift(life: LifePose): number {
  if (life.anim !== 'sit') return 0
  if (SOFA_SPOTS.some((p) => near(p, life.position))) return SOFA_LIFT
  if (BENCH_SPOTS.some((p) => near(p, life.position))) return BENCH_LIFT
  return 0
}

/**
 * 優先序：事件姿勢（position 非 null）> 生活姿勢 > 座位（seated=true）／pantry（seated=false）。
 * 座位上的事件（position null、anim 非 null，例：review-end 的 cheer／slump）也壓過生活姿勢，回座位播；同一人不畫兩個位置。
 * 事件的 facing／carry／emote 壓過生活姿勢（emote 事件沒帶才用外部的）；emote 一律透傳；生活姿勢時沒有外部 emote 才用行程內建的。
 */
export function resolvePose(o: {
  event: EventPose
  life: LifePose | null
  home: Vec3
  atSeat: boolean
  emote: Emote | null
}): AgentDraw {
  const { event, life, home, atSeat, emote } = o
  if (event.position !== null)
    return {
      position: event.position,
      anim: event.anim,
      facing: event.facing,
      seated: false,
      carry: event.carry,
      emote: event.emote ?? emote,
      lift: 0,
      line: null,
    }
  if (life && event.anim === null) {
    // 在座位原地的生活動作（轉頭、伸展、放包、拿杯回座）仍算 seated：Character 有 action 不抬座高，只往桌前移 STAND_FORWARD，不站進椅子
    const seated = atSeat && life.anim !== 'walk' && near(life.position, home)
    return {
      position: life.position,
      anim: life.anim,
      facing: life.facing,
      seated,
      carry: life.carry,
      emote: emote ?? life.emote,
      lift: lifeSeatLift(life),
      line: life.line,
    }
  }
  return {
    position: home,
    anim: event.anim,
    facing: event.facing,
    seated: atSeat,
    carry: event.carry,
    emote: event.emote ?? emote,
    lift: 0,
    line: null,
  }
}

/** session 做完去茶水間閒晃；subagent 做完留在原座位 */
export function restsInPantry(a: OfficeAgent): boolean {
  return a.kind === 'session' && a.status === 'done'
}

/** agent 的落點與朝向：pantry（朝向 0、不在座位）或座位（面向桌子 seatFacing + π） */
export function agentHome(a: OfficeAgent, seat: Seat): { home: Vec3; facing: number; atSeat: boolean } {
  if (restsInPantry(a)) return { home: pantrySpot(a.id), facing: 0, atSeat: false }
  return { home: seatPosition(seat), facing: seatFacing(seat) + Math.PI, atSeat: true }
}
