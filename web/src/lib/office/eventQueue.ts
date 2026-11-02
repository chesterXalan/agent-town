import type { FigureAnim } from './anim'
import type { OfficeEvent } from './events'
import { COMMONS, DOOR, type Vec3 } from './layout'
import type { CarryProp } from './life'
import type { Emote } from './mood'

export type EventAnim = FigureAnim
/** facing／emote／carry 非 null 時壓過生活姿勢（resolvePose） */
export interface EventPose {
  position: Vec3 | null
  anim: EventAnim | null
  facing: number | null
  emote: Emote | null
  carry: CarryProp | null
}

/** 場景座標查詢；由 OfficeScene 依目前 SeatMap 提供 */
export interface OfficeLocator {
  seatOf(id: string): Vec3 | null
  /** 兩點間的走路路徑（首尾＝from／to） */
  route(from: Vec3, to: Vec3): Vec3[]
  /** reviewer 審查時站在該 agent 座位旁的位置；沒有座位回 null */
  reviewSpot(id: string): Vec3 | null
  /** 巡視 plan group 時依序經過的站點（各座位外側） */
  patrolRoute(slug: string): Vec3[]
  /** agent 目前所在位置：生活行程中的位置 > home（座位，或做完的 session 在 pantry）> null */
  currentOf(id: string): Vec3 | null
  /**
   * 可被拉去參與劇情的 agent（roamOf(status) !== 'none' 且不在事件佇列中），最多 MAX_ACTIVE 個；reduced-motion 時回 []。
   * 給 among 時先限定在這些 id 內再取上限（開會只挑 blocked plan 的成員，不被其他 plan 的 idle 佔掉名額）
   */
  idleIds(among?: readonly string[]): string[]
  /** 同 slug 的在場 agent id */
  membersOf(slug: string): string[]
  meetingSpot(k: number): Vec3
  cakeSpot(k: number): Vec3
}

/** 每秒走幾單位 */
export const WALK_SPEED = 2
/** reviewer 在 target 桌邊停留秒數 */
const REVIEW_STAY = 2
/** cheer／slump 播放秒數 */
const EMOTE_SECS = 2
/** BLOCKED 開會停留秒數 */
const MEETING_STAY = 8
/** 接待者在門邊揮手秒數 */
const WAVE_STAY = 1
/** 接待者在大門內側等新人的位置 */
const WELCOME_SPOT: Vec3 = [DOOR[0] + 1, DOOR[1], DOOR[2] - 1]
/** 蛋糕顯示秒數 */
export const CAKE_SECS = 20
/** cakeSpot 環上的站位數（同 MAX_ACTIVE；lifeRun 依賴本檔，不反向 import） */
const CAKE_SPOTS = 6
/** 圍蛋糕的人在蛋糕剩這麼多秒時走回 */
const CAKE_LEAVE = 2
/** 蛋糕位置：茶水間南側、cakeSpot 環上兩個站位之間的空檔（角度 97.5°、半徑 2.2） */
export const CAKE_AT: Vec3 = [COMMONS.pantry[0] - 0.29, 0, COMMONS.pantry[2] + 2.18]
/** 分頁切回時 delta 可能很大，單幀最多推進這麼多秒 */
const MAX_DELTA = 0.1

export type Step =
  | { kind: 'move'; path: Vec3[] }
  | {
      kind: 'stay'
      at: Vec3 | null
      anim: EventAnim | null
      secs: number
      facing?: number | null
      emote?: Emote | null
      carry?: CarryProp | null
    }
/**
 * 一段動畫：steps 依序播；seg／t 為目前步驟內的進度（move：線段與已走距離；stay：已過秒數）。
 * reviewTarget：reviewer 走去 target 桌邊的那段（steps[1] 是桌邊停留），讓 review-end 等 reviewer 走到再播；
 * verdict：桌邊停留已換成 review-end 的擊掌／拿 clipboard，不再被下一個 review-end 改寫；
 * passive：被拉去的被動參與者（開會成員、迎新接待者、圍蛋糕），轉工作中由 recallToSeat 召回；
 * cakeSpot：圍蛋糕佔的站位 index（非 undefined 即蛋糕 run）
 */
export interface Run {
  steps: Step[]
  i: number
  seg: number
  t: number
  reviewTarget?: string
  verdict?: boolean
  passive?: boolean
  cakeSpot?: number
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
const samePoint = (a: Vec3, b: Vec3) => dist(a, b) < 1e-6
/** rotation-y 讓模型 +z 從 from 指向 to（同 lifeSpots） */
const faceToward = (from: Vec3, to: Vec3) => Math.atan2(to[0] - from[0], to[2] - from[2])

function stepSecs(step: Step): number {
  if (step.kind === 'stay') return step.secs
  let len = 0
  for (let k = 1; k < step.path.length; k++) len += dist(step.path[k - 1], step.path[k])
  return len / WALK_SPEED
}

/** run 從目前進度播到第 end 步開頭還要幾秒 */
function secsUntilStep(run: Run, end: number): number {
  if (run.i >= end) return 0
  let secs = 0
  for (let k = run.i; k < end && k < run.steps.length; k++) secs += stepSecs(run.steps[k])
  const cur = run.steps[run.i]
  if (cur.kind === 'stay') secs -= run.t
  else {
    let done = run.t
    for (let k = 1; k <= run.seg && k < cur.path.length; k++) done += dist(cur.path[k - 1], cur.path[k])
    secs -= done / WALK_SPEED
  }
  return Math.max(0, secs)
}

/** reviewer 還要幾秒走到 target 桌邊；佇列裡沒有對這個 target 的去程就是 0 */
function arrivalSecs(runs: Run[] | undefined, targetId: string): number {
  if (!runs) return 0
  let k = -1
  for (let j = 0; j < runs.length; j++) if (runs[j].reviewTarget === targetId) k = j
  if (k < 0) return 0
  let secs = 0
  for (let j = 0; j < k; j++) secs += secsUntilStep(runs[j], runs[j].steps.length)
  return secs + secsUntilStep(runs[k], 1)
}

/** 整條佇列還要幾秒播完 */
function queueSecs(runs: Run[] | undefined): number {
  let secs = 0
  for (const r of runs ?? []) secs += secsUntilStep(r, r.steps.length)
  return secs
}

/** 佇列播完時人在哪；at null 的停留算在 home。佇列空回 null */
function queueEnd(runs: Run[] | undefined, home: Vec3 | null): Vec3 | null {
  const last = runs?.[runs.length - 1]?.steps.at(-1)
  if (!last) return null
  return last.kind === 'move' ? (last.path.at(-1) ?? null) : (last.at ?? home)
}

/** 推進 dt 秒；回傳是否已播完 */
function advance(run: Run, dt: number): boolean {
  while (dt > 0 && run.i < run.steps.length) {
    const step = run.steps[run.i]
    if (step.kind === 'move') {
      const a = step.path[run.seg]
      const b = step.path[run.seg + 1]
      if (!b) {
        run.i++
        run.seg = 0
        run.t = 0
        continue
      }
      const rest = dist(a, b) - run.t
      if (dt * WALK_SPEED >= rest) {
        dt -= rest / WALK_SPEED
        run.seg++
        run.t = 0
      } else {
        run.t += dt * WALK_SPEED
        dt = 0
      }
    } else {
      const rest = step.secs - run.t
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

function poseAt(run: Run): EventPose {
  const step = run.steps[run.i]
  if (!step) return { position: null, anim: null, facing: null, emote: null, carry: null }
  if (step.kind === 'stay')
    return {
      position: step.at,
      anim: step.anim,
      facing: step.facing ?? null,
      emote: step.emote ?? null,
      carry: step.carry ?? null,
    }
  const a = step.path[run.seg]
  const b = step.path[run.seg + 1] ?? a
  const len = dist(a, b)
  const k = len > 0 ? run.t / len : 0
  return {
    position: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k],
    anim: 'walk',
    facing: null,
    emote: null,
    carry: null,
  }
}

/** 事件 → 各 agent 要排進佇列的動畫；review-start／qa-patrol 從佇列終點（或目前位置）出發、直接回座位 */
function toRuns(e: OfficeEvent, q: EventQueue, loc: OfficeLocator): [string, Step[]][] {
  switch (e.kind) {
    case 'review-start': {
      const from = startOf(q, e.reviewerId, loc)
      const dest = loc.reviewSpot(e.targetId)
      if (!from || !dest) return []
      return [
        [
          e.reviewerId,
          [
            { kind: 'move', path: loc.route(from, dest) },
            { kind: 'stay', at: dest, anim: null, secs: REVIEW_STAY },
            { kind: 'move', path: loc.route(dest, loc.seatOf(e.reviewerId) ?? from) },
          ],
        ],
      ]
    }
    case 'qa-patrol': {
      const from = startOf(q, e.qaId, loc)
      const route = loc.patrolRoute(e.slug)
      if (!from || route.length === 0) return []
      const back = loc.seatOf(e.qaId) ?? from
      const path = [
        ...loc.route(from, route[0]),
        ...route.slice(1),
        ...loc.route(route[route.length - 1], back).slice(1),
      ]
      return [[e.qaId, [{ kind: 'move', path }]]]
    }
    case 'fixer-enter': {
      const seat = loc.seatOf(e.id)
      if (!seat) return []
      return [[e.id, [{ kind: 'move', path: loc.route(DOOR, seat) }]]]
    }
    // review-end／blocked／enter／plan-complete 另由 enqueue* 排（要看既有佇列）；leave 沒有動畫
    default:
      return []
  }
}

/** 每個 agent 的動畫佇列與目前姿勢；只在 useFrame／effect 裡變動 */
export interface EventQueue {
  queues: Map<string, Run[]>
  poses: Map<string, EventPose>
  /** 目前要顯示的蛋糕（slug 與剩餘秒數）；tickEventQueue 一併倒數 */
  cakes: { slug: string; left: number }[]
}

export function createEventQueue(): EventQueue {
  return { queues: new Map(), poses: new Map(), cakes: [] }
}

function push(q: EventQueue, id: string, run: Run): void {
  const runs = q.queues.get(id) ?? []
  runs.push(run)
  q.queues.set(id, runs)
}

/**
 * review-end：reviewer 在 target 桌邊與 target 面對面——pass 兩人同時 cheer（擊掌）、target 帶 heart；
 * fail reviewer 拿 clipboard 站著、target slump 帶 angry。
 * reviewer 還沒離開桌邊（去程或停留中）就把那段停留換成這段；否則從佇列終點（或目前位置）走過去再回來。
 * target 不在座位先走回座位，再原地等 reviewer 走到。
 */
function enqueueReviewEnd(q: EventQueue, e: Extract<OfficeEvent, { kind: 'review-end' }>, loc: OfficeLocator): void {
  const pass = e.outcome === 'pass'
  const spot = loc.reviewSpot(e.targetId)
  const seat = loc.seatOf(e.targetId)
  if (spot) {
    const meet: Step = {
      kind: 'stay',
      at: spot,
      anim: pass ? 'cheer' : null,
      secs: EMOTE_SECS,
      facing: seat ? faceToward(spot, seat) : null,
      carry: pass ? null : 'clipboard',
    }
    const runs = q.queues.get(e.reviewerId)
    let going: Run | undefined
    for (const r of runs ?? []) if (r.reviewTarget === e.targetId && !r.verdict && r.i <= 1) going = r
    if (going) {
      going.steps[1] = meet
      going.verdict = true
      // 正在桌邊停留：從現在起重新算，與 target 同時開始
      if (going.i === 1) going.t = 0
    } else {
      const from = queueEnd(runs, loc.seatOf(e.reviewerId)) ?? loc.currentOf(e.reviewerId)
      if (from)
        push(q, e.reviewerId, {
          steps: [{ kind: 'move', path: loc.route(from, spot) }, meet, { kind: 'move', path: loc.route(spot, from) }],
          i: 0,
          seg: 0,
          t: 0,
          reviewTarget: e.targetId,
          verdict: true,
        })
    }
  }

  const own = q.queues.get(e.targetId)
  const steps: Step[] = []
  const at = queueEnd(own, seat) ?? loc.currentOf(e.targetId)
  if (at && seat && !samePoint(at, seat)) steps.push({ kind: 'move', path: loc.route(at, seat) })
  // 同批或 reviewer 還在路上：target 先原地等 reviewer 走到，再 cheer／slump
  const wait =
    arrivalSecs(q.queues.get(e.reviewerId), e.targetId) - queueSecs(own) - steps.reduce((n, st) => n + stepSecs(st), 0)
  if (wait > 0) steps.push({ kind: 'stay', at: null, anim: null, secs: wait })
  steps.push({
    kind: 'stay',
    at: null,
    anim: pass ? 'cheer' : 'slump',
    secs: EMOTE_SECS,
    facing: spot && seat ? faceToward(seat, spot) : null,
    emote: pass ? 'heart' : 'angry',
  })
  push(q, e.targetId, { steps, i: 0, seg: 0, t: 0 })
}

/** 佇列播完時的位置，佇列空就是目前位置：新劇情從這裡出發，疊在既有劇情後不瞬移 */
function startOf(q: EventQueue, id: string, loc: OfficeLocator): Vec3 | null {
  return queueEnd(q.queues.get(id), loc.seatOf(id)) ?? loc.currentOf(id)
}

/** blocked：同 slug 可活動的成員（含 lead，最多 MAX_ACTIVE）走到會議桌圍一圈、面向桌心停 MEETING_STAY 秒，再走回出發點 */
function enqueueMeeting(q: EventQueue, slug: string, loc: OfficeLocator): void {
  const members = loc.membersOf(slug)
  const idle = new Set(loc.idleIds(members))
  let k = 0
  for (const id of members) {
    if (!idle.has(id)) continue
    const from = startOf(q, id, loc)
    if (!from) continue
    const spot = loc.meetingSpot(k++)
    push(q, id, {
      steps: [
        { kind: 'move', path: loc.route(from, spot) },
        { kind: 'stay', at: spot, anim: null, secs: MEETING_STAY, facing: faceToward(spot, COMMONS.meeting) },
        { kind: 'move', path: loc.route(spot, from) },
      ],
      i: 0,
      seg: 0,
      t: 0,
      passive: true,
    })
  }
}

/**
 * enter：新 agent 從 DOOR 走到座位（同 fixer-enter）。有可活動的人時，離 DOOR 最近的一位當接待者：
 * 走到門邊 wave → 與新人同時出發走到新人座位旁 → 自己走回；新人在門口等接待者揮完手才出發。
 */
function enqueueWelcome(q: EventQueue, id: string, loc: OfficeLocator): void {
  const seat = loc.seatOf(id)
  if (!seat) return
  let host: string | null = null
  let hostFrom: Vec3 | null = null
  for (const h of loc.idleIds()) {
    if (h === id) continue
    const from = startOf(q, h, loc)
    if (from && (!hostFrom || dist(from, DOOR) < dist(hostFrom, DOOR))) {
      host = h
      hostFrom = from
    }
  }
  const own: Step[] = []
  if (host && hostFrom) {
    const side = loc.reviewSpot(id) ?? seat
    const toDoor: Step = { kind: 'move', path: loc.route(hostFrom, WELCOME_SPOT) }
    const wait = queueSecs(q.queues.get(host)) + stepSecs(toDoor) + WAVE_STAY - queueSecs(q.queues.get(id))
    push(q, host, {
      steps: [
        toDoor,
        { kind: 'stay', at: WELCOME_SPOT, anim: 'wave', secs: WAVE_STAY, facing: faceToward(WELCOME_SPOT, DOOR) },
        { kind: 'move', path: loc.route(WELCOME_SPOT, side) },
        { kind: 'move', path: loc.route(side, hostFrom) },
      ],
      i: 0,
      seg: 0,
      t: 0,
      passive: true,
    })
    if (wait > 0) own.push({ kind: 'stay', at: DOOR, anim: null, secs: wait, facing: faceToward(DOOR, WELCOME_SPOT) })
  }
  own.push({ kind: 'move', path: loc.route(DOOR, seat) })
  push(q, id, { steps: own, i: 0, seg: 0, t: 0 })
}

/** 圍蛋糕 run（去程、cheer、停留、回程）裡停留那步的 index */
const CAKE_WAIT = 2

/**
 * plan-complete：只放一個蛋糕，已有就換成這個 slug 並重設倒數。
 * 已在蛋糕旁（還沒開始走回）的人延長停留到新倒數剩 CAKE_LEAVE 秒；
 * idleIds() 的人從佇列終點（或目前位置）走到第一個空的 cakeSpot、面向蛋糕 cheer 2 秒帶 heart，停到蛋糕剩 CAKE_LEAVE 秒再走回；
 * 去程＋cheer 趕不上（超過剩 CAKE_LEAVE 秒）的人不排。
 */
function enqueueCake(q: EventQueue, slug: string, loc: OfficeLocator): void {
  const until = CAKE_SECS - CAKE_LEAVE
  q.cakes = [{ slug, left: CAKE_SECS }]
  const taken = new Set<number>()
  for (const runs of q.queues.values()) {
    let before = 0
    for (const r of runs) {
      if (r.cakeSpot !== undefined && r.i <= CAKE_WAIT) {
        taken.add(r.cakeSpot)
        const wait = r.steps[CAKE_WAIT]
        const extra = until - before - secsUntilStep(r, CAKE_WAIT + 1)
        if (wait.kind === 'stay' && extra > 0) wait.secs += extra
      }
      before += secsUntilStep(r, r.steps.length)
    }
  }
  for (const id of loc.idleIds()) {
    let k = 0
    while (taken.has(k)) k++
    if (k >= CAKE_SPOTS) break
    const from = startOf(q, id, loc)
    if (!from) continue
    const spot = loc.cakeSpot(k)
    const go: Step = { kind: 'move', path: loc.route(from, spot) }
    const facing = faceToward(spot, CAKE_AT)
    const wait = until - queueSecs(q.queues.get(id)) - stepSecs(go) - EMOTE_SECS
    if (wait < 0) continue
    taken.add(k)
    push(q, id, {
      steps: [
        go,
        { kind: 'stay', at: spot, anim: 'cheer', secs: EMOTE_SECS, facing, emote: 'heart' },
        { kind: 'stay', at: spot, anim: null, secs: wait, facing },
        { kind: 'move', path: loc.route(spot, from) },
      ],
      i: 0,
      seg: 0,
      t: 0,
      passive: true,
      cakeSpot: k,
    })
  }
}

/** 事件排進佇列；leave 丟掉該 agent 的佇列。回傳是否仍有動畫 */
export function enqueueEvents(q: EventQueue, events: OfficeEvent[], loc: OfficeLocator): boolean {
  for (const e of events) {
    if (e.kind === 'leave') {
      q.queues.delete(e.id)
      q.poses.delete(e.id)
      continue
    }
    if (e.kind === 'review-end') {
      enqueueReviewEnd(q, e, loc)
      continue
    }
    if (e.kind === 'blocked') {
      enqueueMeeting(q, e.slug, loc)
      continue
    }
    if (e.kind === 'enter') {
      enqueueWelcome(q, e.id, loc)
      continue
    }
    if (e.kind === 'plan-complete') {
      enqueueCake(q, e.slug, loc)
      continue
    }
    for (const [id, steps] of toRuns(e, q, loc)) {
      const run: Run = { steps, i: 0, seg: 0, t: 0 }
      if (e.kind === 'review-start') run.reviewTarget = e.targetId
      push(q, id, run)
    }
  }
  return q.queues.size > 0 || q.cakes.length > 0
}

/**
 * 工作中（tool／replying）的人不離座：ids 目前在播的被動劇情換成從當下位置走回座位，排在後面的被動劇情丟掉；
 * 主角的劇情（非 passive）不動。回傳是否仍有動畫
 */
export function recallToSeat(q: EventQueue, ids: Iterable<string>, loc: OfficeLocator): boolean {
  for (const id of ids) {
    const runs = q.queues.get(id)
    if (!runs) continue
    const head = runs[0]
    const kept = runs.slice(1).filter((r) => !r.passive)
    if (head.passive) {
      const at = poseAt(head).position
      const seat = loc.seatOf(id)
      if (at && seat && !samePoint(at, seat))
        kept.unshift({ steps: [{ kind: 'move', path: loc.route(at, seat) }], i: 0, seg: 0, t: 0 })
    } else kept.unshift(head)
    if (kept.length > 0) q.queues.set(id, kept)
    else {
      q.queues.delete(id)
      q.poses.delete(id)
    }
  }
  return q.queues.size > 0 || q.cakes.length > 0
}

/** 推進 delta 秒（上限 MAX_DELTA）；回傳是否仍有動畫 */
export function tickEventQueue(q: EventQueue, delta: number): boolean {
  const dt = Math.min(delta, MAX_DELTA)
  for (const c of q.cakes) c.left -= dt
  // 浮點累加誤差：剩不到 1ms 視為倒數結束
  q.cakes = q.cakes.filter((c) => c.left > 1e-3)
  for (const [id, runs] of q.queues) {
    if (advance(runs[0], dt)) runs.shift()
    if (runs.length === 0) {
      q.queues.delete(id)
      q.poses.delete(id)
    } else q.poses.set(id, poseAt(runs[0]))
  }
  return q.queues.size > 0 || q.cakes.length > 0
}
