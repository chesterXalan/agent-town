import type { OfficeDept, OfficeJob, OfficeStatus } from '../../../../shared/office'
import type { FigureAnim } from './anim'
import { WALK_SPEED } from './eventQueue'
import type { Vec3 } from './layout'
import {
  activitySteps,
  chooseActivity,
  decayNeeds,
  initNeeds,
  NEAR_ACTIVITIES,
  NEED_RESTORE,
  roamOf,
  type ActivityKind,
  type CarryProp,
  type LifeStep,
  type Needs,
} from './life'
import type { Emote } from './mood'
import type { Rng } from './npc'
import type { RoutineBias, RoutineSlot } from './routine'

/** 同時在生活行程中的 agent 上限 */
export const MAX_ACTIVE = 6
/** 內部推進的最大切段（秒）；大 dt 切成等長小段，讓 tick(5) 與 50 次 tick(0.1) 結果相同 */
const MAX_SLICE = 0.1

export interface LifeAgentInput {
  id: string
  status: OfficeStatus
  dept: OfficeDept
  slug: string | null
  job: OfficeJob
  home: Vec3
  homeFacing: number
  /** 心情步速倍率，預設 1 */
  speed: number
}

export interface LifePose {
  position: Vec3
  anim: FigureAnim
  facing: number | null
  carry: CarryProp | null
  emote: Emote | null
  line: string | null
}

/** 進行中的行程：steps 依序播；seg／t 為目前步驟進度（move：線段與已走距離；stay：已過秒數） */
interface LifeRun {
  kind: ActivityKind
  steps: LifeStep[]
  i: number
  seg: number
  t: number
  /** 佔用的設施站位；中斷或結束時釋出 */
  facility: string | null
  slot: number
  /** 已被中斷改走回座位：不套 NEED_RESTORE、不再重複中斷 */
  interrupted: boolean
  /** 最近一段 stay 的 carry，move 時沿用 */
  carry: CarryProp | null
  /** 產生 steps 時的 home／homeFacing；行程中 home 變了（例：session 做完座位→pantry）就改道 */
  home: Vec3
  homeFacing: number
}

export interface AgentLife {
  needs: Needs
  run: LifeRun | null
  /** 首次出現時是 morning 且可遠距 → 下一個推進切段從門口 arrive；那一段出不了門就清掉 */
  arrivePending: boolean
}

export interface LifeState {
  clock: number
  agents: Map<string, AgentLife>
}

export interface LifeCtx {
  bias: RoutineBias
  /** 目前作息時段；只用來判斷 morning 時新出現的 agent 要不要 arrive */
  slot?: RoutineSlot
  route(a: Vec3, b: Vec3): Vec3[]
  rng: Rng
  paused?: ReadonlySet<string>
}

/** 有站位上限的設施（同設施站位數）；whiteboard 依部門各一組 */
const CAPACITY: Partial<Record<ActivityKind, number>> = { coffee: 4, 'water-chat': 3, sofa: 4, whiteboard: 3, lunch: 6 }

const facilityOf = (kind: ActivityKind, dept: OfficeDept): string | null =>
  CAPACITY[kind] === undefined ? null : kind === 'whiteboard' ? `whiteboard:${dept}` : kind

const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
/** 同一點（home 比對用） */
const HOME_EPS = 1e-3
const samePoint = (a: Vec3, b: Vec3) => dist(a, b) < HOME_EPS

export function createLife(): LifeState {
  return { clock: 0, agents: new Map() }
}

export function activeCount(s: LifeState): number {
  let n = 0
  for (const a of s.agents.values()) if (a.run) n++
  return n
}

/** 最小的空站位；滿額回 -1 */
function freeSlot(s: LifeState, facility: string, cap: number): number {
  const held = new Set<number>()
  for (const a of s.agents.values()) if (a.run?.facility === facility) held.add(a.run.slot)
  for (let k = 0; k < cap; k++) if (!held.has(k)) return k
  return -1
}

/** 目前位置；move 中依已走距離內插（advance 保證目前 move 段有起訖點） */
function currentPosition(run: LifeRun, home: Vec3): Vec3 {
  const step = run.steps[run.i]
  if (!step) return home
  if (step.kind === 'stay') return step.at
  const a = step.path[run.seg]
  const b = step.path[run.seg + 1]
  if (!a || !b) return home
  const len = dist(a, b)
  const k = len > 0 ? Math.min(1, run.t / len) : 0
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

/** 推進 dt 秒；回傳是否已播完。dt = 0 也會跳過空路徑與零長度段，停在下一個有長度的位置 */
function advance(run: LifeRun, dt: number, speed: number): boolean {
  while (run.i < run.steps.length) {
    const step = run.steps[run.i]
    if (step.kind === 'move') {
      const a = step.path[run.seg]
      const b = step.path[run.seg + 1]
      if (!a || !b) {
        run.i++
        run.seg = 0
        run.t = 0
        continue
      }
      const rest = dist(a, b) - run.t
      if (dt <= 0 && rest > 0) break
      if (dt * speed >= rest) {
        dt -= rest / speed
        run.seg++
        run.t = 0
      } else {
        run.t += dt * speed
        dt = 0
      }
    } else {
      run.carry = step.carry ?? null
      const rest = step.secs - run.t
      if (dt <= 0 && rest > 0) break
      if (dt >= rest) {
        dt -= rest
        run.i++
        run.t = 0
      } else {
        run.t += dt
        dt = 0
      }
    }
  }
  return run.i >= run.steps.length
}

/** 中斷：剩餘步驟換成一段從目前位置走回 home，立即釋出站位 */
function interrupt(run: LifeRun, a: LifeAgentInput, route: LifeCtx['route']): void {
  const from = currentPosition(run, a.home)
  run.steps = [{ kind: 'move', path: route(from, a.home) }]
  run.i = 0
  run.seg = 0
  run.t = 0
  run.facility = null
  run.slot = -1
  run.interrupted = true
  run.home = a.home
  run.homeFacing = a.homeFacing
}

/**
 * 行程中 home 換了：剩下走回舊 home 的 move 改走新 home、舊 home 的 stay 搬到新 home（朝向保持相對偏角）；
 * 目前正停在舊 home（伸展、轉頭、放包、拿杯回座）就取消剩下步驟，直接走去新 home。只換朝向時只更新 stay 朝向。
 */
function rehome(run: LifeRun, a: LifeAgentInput, route: LifeCtx['route']): void {
  const old = run.home
  const turn = a.homeFacing - run.homeFacing
  const moved = !samePoint(old, a.home)
  const cur = run.steps[run.i]
  if (moved && cur?.kind === 'stay' && samePoint(cur.at, old)) {
    run.steps = [{ kind: 'move', path: route(cur.at, a.home) }]
    run.i = 0
    run.seg = 0
    run.t = 0
  } else {
    run.steps = run.steps.map((st, j): LifeStep => {
      if (j < run.i) return st
      if (st.kind === 'stay') return samePoint(st.at, old) ? { ...st, at: a.home, facing: st.facing + turn } : st
      const end = st.path[st.path.length - 1]
      if (!moved || !end || !samePoint(end, old)) return st
      return { kind: 'move', path: route(j === run.i ? currentPosition(run, old) : st.path[0], a.home) }
    })
    if (moved && cur?.kind === 'move' && run.steps[run.i] !== cur) {
      run.seg = 0
      run.t = 0
    }
  }
  run.home = a.home
  run.homeFacing = a.homeFacing
}

function restore(needs: Needs, kind: ActivityKind): Needs {
  const add = NEED_RESTORE[kind]
  const r = (k: keyof Needs) => Math.min(100, needs[k] + (add[k] ?? 0))
  return { energy: r('energy'), social: r('social'), thirst: r('thirst') }
}

function startRun(s: LifeState, life: AgentLife, a: LifeAgentInput, kind: ActivityKind, ctx: LifeCtx): boolean {
  const facility = facilityOf(kind, a.dept)
  let slot = 0
  if (facility) {
    slot = freeSlot(s, facility, CAPACITY[kind]!)
    if (slot < 0) return false
  }
  const steps = activitySteps(kind, {
    home: a.home,
    homeFacing: a.homeFacing,
    dept: a.dept,
    slot,
    route: ctx.route,
    rng: ctx.rng,
    needs: life.needs,
  })
  life.run = {
    kind,
    steps,
    i: 0,
    seg: 0,
    t: 0,
    facility,
    slot,
    interrupted: false,
    carry: null,
    home: a.home,
    homeFacing: a.homeFacing,
  }
  advance(life.run, 0, 1)
  return true
}

function hasMate(a: LifeAgentInput, inputs: readonly LifeAgentInput[]): boolean {
  if (a.slug === null) return false
  return inputs.some((o) => o.id !== a.id && o.slug === a.slug && o.job === 'engineer' && roamOf(o.status) !== 'none')
}

function step(s: LifeState, inputs: readonly LifeAgentInput[], dt: number, ctx: LifeCtx): void {
  s.clock += dt
  for (const a of inputs) {
    const life = s.agents.get(a.id)!
    // arrive 只在首次出現的那一刻有效；這一刻出不了門（暫停、名額滿）就作罷，免得之後從座位瞬移到門口
    const arrive = life.arrivePending
    life.arrivePending = false
    if (ctx.paused?.has(a.id)) continue
    const roam = roamOf(a.status)

    if (life.run) {
      const run = life.run
      const mustReturn = roam === 'none' || (roam === 'near' && !NEAR_ACTIVITIES.includes(run.kind))
      if (mustReturn && !run.interrupted) interrupt(run, a, ctx.route)
      else if (!samePoint(run.home, a.home) || run.homeFacing !== a.homeFacing) rehome(run, a, ctx.route)
      if (advance(run, dt, WALK_SPEED * a.speed)) {
        if (!run.interrupted) life.needs = restore(life.needs, run.kind)
        life.run = null
      }
      continue
    }

    life.needs = decayNeeds(life.needs, dt)
    if (activeCount(s) >= MAX_ACTIVE) continue
    if (arrive && ctx.slot === 'morning' && roam === 'far') {
      startRun(s, life, a, 'arrive', ctx)
      continue
    }
    const kind = chooseActivity({
      needs: life.needs,
      roam,
      bias: ctx.bias,
      hasMate: hasMate(a, inputs),
      dt,
      rng: ctx.rng,
    })
    if (kind === null || kind === 'arrive') continue
    startRun(s, life, a, kind, ctx)
  }
}

/** 推進 dt 秒（內部以 ≤ 0.1 秒切段）；inputs 是目前在場且有座位的 agent；不在 inputs 的 agent 狀態刪除 */
export function tickLife(s: LifeState, inputs: readonly LifeAgentInput[], dt: number, ctx: LifeCtx): void {
  const present = new Set(inputs.map((a) => a.id))
  for (const id of [...s.agents.keys()]) if (!present.has(id)) s.agents.delete(id)
  for (const a of inputs) {
    if (s.agents.has(a.id)) continue
    s.agents.set(a.id, {
      needs: initNeeds(a.id),
      run: null,
      arrivePending: ctx.slot === 'morning' && roamOf(a.status) === 'far',
    })
  }
  if (!(dt > 0)) return
  const n = Math.max(1, Math.ceil(dt / MAX_SLICE - 1e-9))
  const h = dt / n
  for (let k = 0; k < n; k++) step(s, inputs, h, ctx)
}

/** 進行中的 agent 才有值；沒有行程（在座位或 pantry）回 null */
export function lifePose(s: LifeState, id: string): LifePose | null {
  const run = s.agents.get(id)?.run
  if (!run) return null
  const cur = run.steps[run.i]
  if (!cur) return null
  if (cur.kind === 'stay') {
    return {
      position: cur.at,
      anim: cur.anim,
      facing: cur.facing,
      carry: cur.carry ?? null,
      emote: cur.emote ?? null,
      line: cur.line ?? null,
    }
  }
  return {
    position: currentPosition(run, cur.path[0] ?? [0, 0, 0]),
    anim: 'walk',
    facing: null,
    carry: run.carry,
    emote: null,
    line: null,
  }
}
