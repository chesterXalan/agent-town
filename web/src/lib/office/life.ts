import type { OfficeDept, OfficeStatus } from '../../../../shared/office'
import type { FigureAnim } from './anim'
import { DOOR, type Vec3 } from './layout'
import { coffeeQueueSpot, LUNCH_SEATS, sofaSeat, waterChatSpot, whiteboardSpot } from './lifeSpots'
import type { Emote } from './mood'
import { DELIVERY_SPOT, type NpcSpot, type Rng } from './npc'
import type { RoutineBias } from './routine'
import { NPC_JOKES } from './speech'
import { seeded } from './street'

export type Need = 'energy' | 'social' | 'thirst'
export type Needs = Record<Need, number>
export const NEED_THRESHOLD = 40

export type Roam = 'none' | 'near' | 'far'

/** tool／replying 不離座、thinking 近距、waiting／done 遠距 */
export function roamOf(status: OfficeStatus): Roam {
  switch (status) {
    case 'tool':
    case 'replying':
      return 'none'
    case 'thinking':
      return 'near'
    case 'waiting':
    case 'done':
      return 'far'
  }
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

/** 各 60–100，依 id 固定 */
export function initNeeds(id: string): Needs {
  const rng = seeded(hash(id))
  const v = () => 60 + rng() * 40
  return { energy: v(), social: v(), thirst: v() }
}

/** 每秒下降量：thirst 100 → 40 約 333 秒；連同 IDLE_RATE 調成遠距 agent 平均約 4 分鐘起身一次（落在 3–6 分鐘） */
const DECAY: Needs = { energy: 0.04, social: 0.06, thirst: 0.18 }

/** 在座位時下降（clamp ≥ 0）；速率讓 thirst 約 5.5 分鐘從 100 降到門檻 */
export function decayNeeds(n: Needs, dt: number): Needs {
  const d = (k: Need) => Math.max(0, n[k] - DECAY[k] * dt)
  return { energy: d('energy'), social: d('social'), thirst: d('thirst') }
}

export type ActivityKind =
  'coffee' | 'water-chat' | 'sofa' | 'whiteboard' | 'stretch' | 'look-around' | 'arrive' | 'lunch'
export const NEAR_ACTIVITIES: readonly ActivityKind[] = ['stretch', 'look-around', 'whiteboard']

/** 需求都夠時自發出門的每秒機率（再乘 roamScale） */
const IDLE_RATE = 1 / 900
/** 自發出門時各活動的預設權重；routine 的 weights 覆蓋 */
const BASE_WEIGHTS: Record<ActivityKind, number> = {
  coffee: 1,
  'water-chat': 1,
  sofa: 1,
  whiteboard: 1,
  stretch: 1,
  'look-around': 1,
  arrive: 0,
  lunch: 0,
}

/**
 * 該補哪條就選對應活動（thirst→coffee、social→water-chat 或有同 plan 夥伴時 whiteboard、energy→sofa）；
 * 沒有需求低於門檻時依 routine 權重小機率挑（每秒機率 × roamScale）；roam='near' 只從 NEAR_ACTIVITIES 挑；roam='none' 回 null
 */
export function chooseActivity(o: {
  needs: Needs
  roam: Roam
  bias: RoutineBias
  hasMate: boolean
  dt: number
  rng: Rng
}): ActivityKind | null {
  const { needs, roam, bias, hasMate, dt, rng } = o
  if (roam === 'none') return null
  const allowed = (k: ActivityKind) => roam === 'far' || NEAR_ACTIVITIES.includes(k)

  // 最低的那條優先補
  const low = (['thirst', 'social', 'energy'] as const)
    .filter((k) => needs[k] < NEED_THRESHOLD)
    .sort((a, b) => needs[a] - needs[b])
  for (const need of low) {
    const kind: ActivityKind =
      need === 'thirst' ? 'coffee' : need === 'energy' ? 'sofa' : hasMate ? 'whiteboard' : 'water-chat'
    if (allowed(kind)) return kind
  }

  if (rng() >= Math.min(1, IDLE_RATE * bias.roamScale * Math.max(0, dt))) return null
  const pool = (Object.keys(BASE_WEIGHTS) as ActivityKind[])
    .filter(allowed)
    .map((k) => [k, Math.max(0, bias.weights[k] ?? BASE_WEIGHTS[k])] as const)
  const total = pool.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return null
  let r = rng() * total
  for (const [k, w] of pool) {
    if (w > 0 && r < w) return k
    r -= w
  }
  return null
}

/** 活動做完回補的量（加到上限 100） */
export const NEED_RESTORE: Record<ActivityKind, Partial<Needs>> = {
  coffee: { thirst: 60, energy: 15 },
  'water-chat': { social: 50, thirst: 20 },
  sofa: { energy: 60 },
  whiteboard: { social: 40 },
  stretch: { energy: 15 },
  'look-around': { social: 5 },
  arrive: {},
  lunch: { energy: 40, thirst: 30, social: 20 },
}

export type CarryProp = 'cup' | 'plate' | 'phone' | 'bag' | 'clipboard' // clipboard 給 part2 的 FAIL 劇情
export type LifeStep =
  | { kind: 'move'; path: Vec3[] }
  | {
      kind: 'stay'
      at: Vec3
      secs: number
      anim: FigureAnim
      facing: number
      carry?: CarryProp
      emote?: Emote
      line?: string
    }

/** 排在第 k 位要多等幾秒（前一人操作咖啡機的時間） */
const QUEUE_WAIT = 3.2
/** 午餐取餐點：沿櫃台（DELIVERY_SPOT 面向的那面）左右交錯排開，間距 PICKUP_STEP；slot clamp 到 0..PICKUP_SLOTS-1 */
const PICKUP_STEP = 0.9
const PICKUP_SLOTS = 6
function lunchPickup(slot: number): NpcSpot {
  const k = clampSlot(slot, PICKUP_SLOTS)
  // 0, +1, -1, +2, -2, +3 格；沿面向的垂直方向（右手）排
  const off = (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * PICKUP_STEP
  const { at, facing } = DELIVERY_SPOT
  const [rx, rz] = [-Math.cos(facing), Math.sin(facing)]
  return { at: [at[0] + rx * off, at[1], at[2] + rz * off], facing }
}

/** energy 低於此值在沙發上打瞌睡 */
const DOZE_ENERGY = 20

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)
const pickLine = (rng: Rng) => NPC_JOKES[Math.min(NPC_JOKES.length - 1, Math.floor(rng() * NPC_JOKES.length))]
/** slot 取整並 clamp 到 [0, n)；NaN → 0 */
const clampSlot = (slot: number, n: number) =>
  Number.isFinite(slot) ? Math.min(Math.max(Math.floor(slot), 0), n - 1) : 0

/**
 * 產生一段活動行程：從 home 出發 → 設施站位（slot 決定第幾位）→ 回 home；arrive 從 DOOR 出發到 home，最後 pick-up 放包。
 * needs 可選：給了才會在 thirst 低時於咖啡第一個 stay 帶 'coffee' 圖示、energy < 20 時在沙發打瞌睡。
 */
export function activitySteps(
  kind: ActivityKind,
  o: {
    home: Vec3
    homeFacing: number
    dept: OfficeDept
    slot: number
    route(a: Vec3, b: Vec3): Vec3[]
    rng: Rng
    needs?: Needs
  },
): LifeStep[] {
  const { home, homeFacing, dept, slot, route, rng, needs } = o
  const move = (a: Vec3, b: Vec3): LifeStep => ({ kind: 'move', path: route(a, b) })
  /** home → 站位 → 那裡的 stays → home */
  const visit = (spot: NpcSpot, stays: (at: Vec3, facing: number) => LifeStep[]): LifeStep[] => [
    move(home, spot.at),
    ...stays(spot.at, spot.facing),
    move(spot.at, home),
  ]

  switch (kind) {
    case 'coffee': {
      const k = clampSlot(slot, 4)
      const queue = coffeeQueueSpot(k)
      const machine = coffeeQueueSpot(0)
      const thirsty = needs !== undefined && needs.thirst < NEED_THRESHOLD
      return [
        move(home, queue.at),
        {
          kind: 'stay',
          at: queue.at,
          secs: 0.5 + k * QUEUE_WAIT,
          anim: 'idle',
          facing: queue.facing,
          ...(thirsty ? { emote: 'coffee' as const } : {}),
        },
        ...(k > 0 ? [move(queue.at, machine.at)] : []),
        { kind: 'stay', at: machine.at, secs: 2, anim: 'wave', facing: machine.facing },
        { kind: 'stay', at: machine.at, secs: 0.8, anim: 'hold', facing: machine.facing, carry: 'cup' },
        move(machine.at, home),
        { kind: 'stay', at: home, secs: 1.5, anim: 'hold', facing: homeFacing, carry: 'cup' },
      ]
    }
    case 'water-chat': {
      const k = clampSlot(slot, 3) as 0 | 1 | 2
      const total = between(rng, 6, 10)
      const turns = 3
      return visit(waterChatSpot(k), (at, facing) =>
        Array.from({ length: turns }, (_, i): LifeStep => {
          const speaking = i % turns === k
          return speaking
            ? { kind: 'stay', at, secs: total / turns, anim: 'idle', facing, line: pickLine(rng) }
            : { kind: 'stay', at, secs: total / turns, anim: 'nod', facing }
        }),
      )
    }
    case 'sofa': {
      const k = clampSlot(slot, 4) as 0 | 1 | 2 | 3
      const secs = between(rng, 15, 25)
      const doze = needs !== undefined && needs.energy < DOZE_ENERGY
      return visit(sofaSeat(k), (at, facing) => [
        doze
          ? { kind: 'stay', at, secs, anim: 'sit', facing, emote: 'sleep' }
          : { kind: 'stay', at, secs, anim: 'sit', facing, carry: 'phone' },
      ])
    }
    case 'whiteboard': {
      const k = clampSlot(slot, 3) as 0 | 1 | 2
      const secs = between(rng, 6, 10)
      return visit(whiteboardSpot(dept, k), (at, facing) => [{ kind: 'stay', at, secs, anim: 'wave', facing }])
    }
    case 'stretch':
      return [{ kind: 'stay', at: home, secs: 1, anim: 'cheer', facing: homeFacing }]
    case 'look-around': {
      const turn = between(rng, 0.6, 1.2)
      const side = rng() < 0.5 ? 1 : -1
      return [
        { kind: 'stay', at: home, secs: between(rng, 1.5, 2.5), anim: 'idle', facing: homeFacing + side * turn },
        { kind: 'stay', at: home, secs: between(rng, 1.5, 2.5), anim: 'idle', facing: homeFacing - side * turn },
        { kind: 'stay', at: home, secs: 0.5, anim: 'idle', facing: homeFacing },
      ]
    }
    case 'arrive':
      return [
        { kind: 'stay', at: DOOR, secs: 0.5, anim: 'idle', facing: Math.PI, carry: 'bag' },
        move(DOOR, home),
        { kind: 'stay', at: home, secs: 1.2, anim: 'pick-up', facing: homeFacing, carry: 'bag' },
      ]
    case 'lunch': {
      const seat = LUNCH_SEATS[clampSlot(slot, LUNCH_SEATS.length)]
      const pickup = lunchPickup(slot)
      return [
        move(home, pickup.at),
        { kind: 'stay', at: pickup.at, secs: 1, anim: 'pick-up', facing: pickup.facing },
        { kind: 'stay', at: pickup.at, secs: 0.5, anim: 'hold', facing: pickup.facing, carry: 'plate' },
        move(pickup.at, seat.at),
        { kind: 'stay', at: seat.at, secs: 20, anim: 'sit', facing: seat.facing, carry: 'plate' },
        move(seat.at, home),
      ]
    }
  }
}
