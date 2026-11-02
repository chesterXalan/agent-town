import type { OfficeDept } from '../../../../shared/office'
import type { FigureAnim } from './anim'
import { CHARACTER_MODELS } from './appearance'
import { WALK_SPEED } from './eventQueue'
import { CORNER_ROOMS, CORRIDOR, DOOR, RING_IN, zonePoint, type Vec3 } from './layout'
// lifeSpots 也 import 本檔（COFFEE_SPOT）：這裡只在函式內呼叫 copierSpot，不在模組頂層取值
import { copierSpot } from './lifeSpots'
import { ringPath } from './path'
import { NPC_JOKES } from './speech'

// NPC 氛圍情境：純腳本，不讀任何資料來源。座標（原點＝中庭中心，北＝-z，東＝+x）；
// facing 是 rotation-y，模型本地面向 +z：0 面向 +z、π 面向 -z、-π/2 面向 -x。

export interface NpcSpot {
  at: Vec3
  facing: number
}

/** 員工進出門：nw、ne、sw（se 是主管室） */
export const STAFF_DOORS: Vec3[] = [CORNER_ROOMS.nw.door, CORNER_ROOMS.ne.door, CORNER_ROOMS.sw.door]

/** 訪客停留點：監控牆前、圖書區前、中庭南緣 */
export const VISIT_STOPS: NpcSpot[] = [
  { at: [-16, 0, -20.5], facing: Math.PI },
  { at: [-18.5, 0, 17], facing: -Math.PI / 2 },
  { at: [0, 0, 7.5], facing: Math.PI },
]

export const COFFEE_SPOT: NpcSpot = { at: [0.2, 0, -5.4], facing: 0 }

/** 沙發旁：ATRIUM_SOFAS[k] 的角度 +15°、半徑 6，面向中庭中心 */
export function sofaSpot(k: 0 | 1 | 2 | 3): NpcSpot {
  const angle = Math.PI / 4 + (k * Math.PI) / 2 + Math.PI / 12
  const x = Math.cos(angle) * 6
  const z = Math.sin(angle) * 6
  return { at: [x, 0, z], facing: Math.atan2(-x, -z) }
}

/** 窗邊：北兩點、西兩點 */
export const WINDOW_SPOTS: NpcSpot[] = [
  { at: [-6, 0, -22.8], facing: Math.PI },
  { at: [6, 0, -22.8], facing: Math.PI },
  { at: [-22.8, 0, -6], facing: -Math.PI / 2 },
  { at: [-22.8, 0, 6], facing: -Math.PI / 2 },
]

/** 聊天圈心：半徑 7.2，角度 0°／90°／180°／270° */
export const CHAT_CENTERS: Vec3[] = [0, 1, 2, 3].map((k) => {
  const angle = (k * Math.PI) / 2
  return [Math.cos(angle) * 7.2, 0, Math.sin(angle) * 7.2] as Vec3
})

/** 外送停點：櫃台東側 */
export const DELIVERY_SPOT: NpcSpot = { at: [-5.8, 0, 17], facing: -Math.PI / 2 }

/** Atrium 四角盆栽（中庭外緣內 0.6）；澆花站在盆栽外側（靠走廊）的對角點，面向盆栽 */
const PLANT_AT = RING_IN - 0.6
const WATER_AT = PLANT_AT + 0.7
/** 澆花站位：西北、東北、東南、西南（同 RING_CW 的角落順序） */
export const WATER_SPOTS: NpcSpot[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
].map(([sx, sz]) => ({ at: [sx * WATER_AT, 0, sz * WATER_AT] as Vec3, facing: Math.atan2(-sx, -sz) }))

export type Rng = () => number // [0, 1)
export type NpcAnim = FigureAnim
export type NpcProp = 'box' | 'cart' | 'plane' | 'can' | 'robot' | 'chair'
/** stay.spin：每秒轉幾圈（朝向 = facing + 2π·spin·已過秒數） */
export type NpcStep =
  | { kind: 'move'; path: Vec3[] }
  | {
      kind: 'stay'
      at: Vec3
      secs: number
      anim: NpcAnim
      facing: number
      bubble?: boolean
      line?: string
      drop?: boolean
      spin?: number
    }
/** model null＝只有道具（紙飛機、掃地機器人） */
export interface NpcActor {
  id: string
  model: string | null
  prop: NpcProp | null
  steps: NpcStep[]
}
export type SceneKind =
  | 'visitor'
  | 'chat'
  | 'rest'
  | 'delivery'
  | 'cleaning'
  | 'paper-plane'
  | 'chair-spin'
  | 'water-plants'
  | 'vacuum'
  | 'cart-pass'
  | 'copier-jam'
/** uses：佔用的站位鍵（例 'copier'、'window-0'、'corridor-n'）；同時演的兩段不得重疊 */
export interface NpcScene {
  id: number
  kind: SceneKind
  actors: NpcActor[]
  uses: string[]
}
export interface NpcPose {
  id: string
  model: string | null
  prop: NpcProp | null
  position: Vec3
  anim: NpcAnim
  facing: number | null
  bubble: boolean
  line: string | null
}

/** 單人進度：i＝目前步驟；seg／t＝move 的線段與已走距離，stay 的已過秒數 */
interface ActorRun {
  actor: NpcActor
  prop: NpcProp | null
  i: number
  seg: number
  t: number
}
export interface SceneRun {
  actors: ActorRun[]
}

/** 聊天站位離圈心多遠 */
const CHAT_R = 0.8
/** 聊天幾秒換一人講 */
const CHAT_TURN = 3
/** 單幀最多推進秒數（分頁切回時 dt 可能很大） */
const MAX_DELTA = 0.1
/** 多人同路線時第 j 人晚 j × STAGGER 秒出發，避免重疊 */
const STAGGER = 1.2

const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
const pathLen = (p: Vec3[]) => p.slice(1).reduce((s, q, k) => s + dist(p[k], q), 0)
export const scriptSecs = (steps: NpcStep[]) =>
  steps.reduce((s, x) => s + (x.kind === 'stay' ? x.secs : pathLen(x.path) / WALK_SPEED), 0)

/** [0, n) 的整數 */
const pickInt = (rng: Rng, n: number) => Math.min(n - 1, Math.floor(rng() * n))
const pick = <T>(rng: Rng, xs: T[]): T => xs[pickInt(rng, xs.length)]
const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)

/** 不重複抽 n 個（Fisher–Yates 前 n 步） */
function sample<T>(rng: Rng, xs: T[], n: number): T[] {
  const a = [...xs]
  for (let k = 0; k < n; k++) {
    const j = k + pickInt(rng, a.length - k)
    ;[a[k], a[j]] = [a[j], a[k]]
  }
  return a.slice(0, n)
}

const move = (from: Vec3, to: Vec3): NpcStep => ({ kind: 'move', path: ringPath(from, to) })

/** 朝 path 第一個不同點的方向 */
function headingOf(path: Vec3[]): number {
  const a = path[0]
  const b = path.find((q) => q[0] !== a[0] || q[2] !== a[2])
  return b ? Math.atan2(b[0] - a[0], b[2] - a[2]) : 0
}

/** 在 move 前原地等 secs 秒（secs ≤ 0 不加） */
function waitThenMove(secs: number, path: Vec3[]): NpcStep[] {
  const m: NpcStep = { kind: 'move', path }
  return secs > 0 ? [{ kind: 'stay', at: path[0], secs, anim: 'idle', facing: headingOf(path) }, m] : [m]
}

/** 抽中權重：visitor／chat／rest 各 2，其餘各 1 */
const SCENE_WEIGHTS: [SceneKind, number][] = [
  ['visitor', 2],
  ['chat', 2],
  ['rest', 2],
  ['delivery', 1],
  ['cleaning', 1],
  ['paper-plane', 1],
  ['chair-spin', 1],
  ['water-plants', 1],
  ['vacuum', 1],
  ['cart-pass', 1],
  ['copier-jam', 1],
]

/** 依權重抽一種，跳過 exclude；全被排除時照全部權重抽 */
export function pickScene(rng: Rng, exclude: ReadonlySet<SceneKind> = new Set()): SceneKind {
  const left = SCENE_WEIGHTS.filter(([k]) => !exclude.has(k))
  const pool = left.length > 0 ? left : SCENE_WEIGHTS
  let r = rng() * pool.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of pool) {
    if (r < w) return k
    r -= w
  }
  return pool[pool.length - 1][0]
}

/** 從 home 出發依序停留各點再回 home */
function roundTrip(home: Vec3, visits: Extract<NpcStep, { kind: 'stay' }>[]): NpcStep[] {
  const steps: NpcStep[] = []
  let at = home
  for (const v of visits) {
    steps.push(move(at, v.at), v)
    at = v.at
  }
  steps.push(move(at, home))
  return steps
}

function visitorSteps(rng: Rng, stops: NpcSpot[]): NpcStep[] {
  return roundTrip(
    DOOR,
    stops.map((s) => ({ kind: 'stay', at: s.at, secs: between(rng, 3, 5), anim: 'idle', facing: s.facing })),
  )
}

/** 單一角色的腳本：prop 預設 null；person false＝只有道具、不配模型 */
interface Cast {
  steps: NpcStep[]
  prop?: NpcProp
  person?: boolean
}
interface Built {
  cast: Cast[]
  uses: string[]
}
const castOf = (scripts: NpcStep[][], prop?: NpcProp): Cast[] => scripts.map((steps) => ({ steps, prop }))

/** VISIT_STOPS 的站位鍵；atrium-south 與 CHAT_CENTERS[1] 的聊天圈重疊，共用同一鍵 */
const VISIT_KEYS = ['monitor-wall', 'library', 'atrium-south']
/** 員工門的站位鍵：錯開出發的人會在門口原地等（chat、copier-jam），兩段同門會疊在一起 */
const DOOR_KEYS = ['door-nw', 'door-ne', 'door-sw']
const doorKey = (door: Vec3) => DOOR_KEYS[STAFF_DOORS.indexOf(door)]
const chatKeys = (k: number) => (k === 1 ? ['chat-1', 'atrium-south'] : [`chat-${k}`])

function buildVisitor(rng: Rng): Built {
  const people = 1 + pickInt(rng, 2)
  const stops = sample(rng, VISIT_STOPS, 2 + pickInt(rng, 2))
  const uses = ['door', ...stops.map((s) => VISIT_KEYS[VISIT_STOPS.indexOf(s)])]
  return { cast: castOf(visitorScripts(rng, people, stops)), uses }
}

function visitorScripts(rng: Rng, people: number, stops: NpcSpot[]): NpcStep[][] {
  // 第二人同一組停留點但順序錯開一格，同一時段多半站不同點
  const rotated = [...stops.slice(1), stops[0]]
  if (people === 1) return [visitorSteps(rng, stops)]
  const a = visitorSteps(rng, stops)
  const b = visitorSteps(rng, rotated)
  // 第二人在門口晚 STAGGER 秒出發；回程終點同為 DOOR，抵達時間也要差 ≥ STAGGER，否則再多等
  const endA = scriptSecs(a)
  const endB = scriptSecs(b) + STAGGER
  const delay = Math.abs(endB - endA) < STAGGER ? endA + STAGGER - scriptSecs(b) : STAGGER
  const [first, ...rest] = b as [Extract<NpcStep, { kind: 'move' }>, ...NpcStep[]]
  return [a, [...waitThenMove(delay, first.path), ...rest]]
}

function buildChat(rng: Rng): Built {
  const n = 2 + pickInt(rng, 2)
  const door = pick(rng, STAFF_DOORS)
  const ck = pickInt(rng, CHAT_CENTERS.length)
  const c = CHAT_CENTERS[ck]
  const total = between(rng, 15, 25)
  const turns: number[] = []
  for (let t = 0; t < total; t += CHAT_TURN) turns.push(Math.min(CHAT_TURN, total - t))

  const spots = Array.from({ length: n }, (_, j) => {
    const angle = (2 * Math.PI * j) / n
    const at: Vec3 = [c[0] + Math.cos(angle) * CHAT_R, 0, c[2] + Math.sin(angle) * CHAT_R]
    const go = ringPath(door, at)
    return { at, facing: Math.atan2(c[0] - at[0], c[2] - at[2]), go, back: ringPath(at, door) }
  })
  // 第 j 人晚 j × STAGGER 出門；全員到齊才同時開聊
  const reach = spots.map((s, j) => j * STAGGER + pathLen(s.go) / WALK_SPEED)
  const arrive = Math.max(...reach)
  // 散場：回程短的先走，依序錯開 STAGGER，長路的人後出發不會追上前人
  const leaveOrder = spots
    .map((s, j) => ({ j, len: pathLen(s.back) }))
    .sort((a, b) => a.len - b.len)
    .map((o) => o.j)
  const scripts = spots.map((s, j) => {
    const steps: NpcStep[] = [...waitThenMove(j * STAGGER, s.go)]
    const wait = arrive - reach[j]
    if (wait > 0) steps.push({ kind: 'stay', at: s.at, secs: wait, anim: 'idle', facing: s.facing })
    turns.forEach((secs, k) => {
      const talking = k % n === j
      steps.push({ kind: 'stay', at: s.at, secs, anim: talking ? 'nod' : 'idle', facing: s.facing, bubble: talking })
    })
    const linger = leaveOrder.indexOf(j) * STAGGER
    if (linger > 0) steps.push({ kind: 'stay', at: s.at, secs: linger, anim: 'idle', facing: s.facing })
    steps.push({ kind: 'move', path: s.back })
    return steps
  })
  return { cast: castOf(scripts), uses: [doorKey(door), ...chatKeys(ck)] }
}

function buildRest(rng: Rng): Built {
  const door = pick(rng, STAFF_DOORS)
  const what = pickInt(rng, 3)
  let stay: Extract<NpcStep, { kind: 'stay' }>
  let use: string
  if (what === 0) {
    stay = { kind: 'stay', at: COFFEE_SPOT.at, secs: 4, anim: 'idle', facing: COFFEE_SPOT.facing }
    use = 'coffee'
  } else if (what === 1) {
    const k = pickInt(rng, 4)
    const s = sofaSpot(k as 0 | 1 | 2 | 3)
    stay = { kind: 'stay', at: s.at, secs: 8, anim: 'idle', facing: s.facing }
    use = `sofa-${k}`
  } else {
    const k = pickInt(rng, WINDOW_SPOTS.length)
    const s = WINDOW_SPOTS[k]
    stay = { kind: 'stay', at: s.at, secs: 3, anim: 'cheer', facing: s.facing }
    use = `window-${k}`
  }
  return { cast: castOf([roundTrip(door, [stay])]), uses: [use] }
}

/** DOOR 與 DELIVERY_SPOT 都在大廳，直線來回不繞走廊 */
function buildDelivery(): Built {
  return {
    uses: ['door', 'counter'],
    cast: castOf(
      [
        [
          { kind: 'move', path: [DOOR, DELIVERY_SPOT.at] },
          { kind: 'stay', at: DELIVERY_SPOT.at, secs: 3, anim: 'idle', facing: DELIVERY_SPOT.facing, drop: true },
          { kind: 'move', path: [DELIVERY_SPOT.at, DOOR] },
        ],
      ],
      'box',
    ),
  }
}

/** 走廊四角，順時針（俯視：西北 → 東北 → 東南 → 西南） */
const RING_CW: Vec3[] = [CORNER_ROOMS.nw.ring, CORNER_ROOMS.ne.ring, CORNER_ROOMS.se.ring, CORNER_ROOMS.sw.ring]

/** 走廊四邊的站位鍵：RING_CW[k] → RING_CW[k+1] 是第 k 邊 */
const SIDE_KEYS = ['corridor-n', 'corridor-e', 'corridor-s', 'corridor-w']

/** path 中沿走廊中線走的線段佔了哪幾邊（依 SIDE_KEYS 順序、不重複） */
function corridorUses(path: Vec3[]): string[] {
  const on = new Set<number>()
  path.slice(1).forEach((b, k) => {
    const a = path[k]
    if (a[2] === -CORRIDOR && b[2] === -CORRIDOR) on.add(0)
    else if (a[0] === CORRIDOR && b[0] === CORRIDOR) on.add(1)
    else if (a[2] === CORRIDOR && b[2] === CORRIDOR) on.add(2)
    else if (a[0] === -CORRIDOR && b[0] === -CORRIDOR) on.add(3)
  })
  return SIDE_KEYS.filter((_, k) => on.has(k))
}

const roomOfDoor = (door: Vec3) => Object.values(CORNER_ROOMS).find((r) => r.door === door)!

function buildCleaning(rng: Rng): Built {
  const door = pick(rng, STAFF_DOORS)
  const start = RING_CW.indexOf(roomOfDoor(door).ring)
  const loop = [0, 1, 2, 3, 4].map((d) => RING_CW[(start + d) % 4])
  const path = [door, ...loop, door]
  return { cast: castOf([[{ kind: 'move', path }]], 'cart'), uses: corridorUses(path) }
}

/** 紙飛機的航線：兩翼相鄰的部門（隔著走廊角，不越過中庭大樹與角落房間），起飛 PLANE_Y、落點略低 */
const PLANE_ROUTES: [OfficeDept, OfficeDept][] = [
  ['north-west', 'west-north'],
  ['north-east', 'east-north'],
]
const PLANE_Y = 1.6
/** 起落點在部門區中段（a=0、d=5），桌椅高度都在 1 以下 */
const PLANE_D = 5

function buildPaperPlane(rng: Rng): Built {
  const route = pick(rng, PLANE_ROUTES)
  const [from, to] = rng() < 0.5 ? route : [route[1], route[0]]
  const a = zonePoint(from, 0, PLANE_D)
  const b = zonePoint(to, 0, PLANE_D)
  const path: Vec3[] = [
    [a[0], PLANE_Y, a[2]],
    [(a[0] + b[0]) / 2, PLANE_Y + 0.2, (a[2] + b[2]) / 2],
    [b[0], PLANE_Y - 0.4, b[2]],
  ]
  return { cast: [{ steps: [{ kind: 'move', path }], prop: 'plane', person: false }], uses: [] }
}

/** 到 to 最近（ringPath 最短）的員工門 */
function nearestDoor(to: Vec3): Vec3 {
  return STAFF_DOORS.reduce((best, d) => (pathLen(ringPath(d, to)) < pathLen(ringPath(best, to)) ? d : best))
}

/** 從最近的員工門推椅子到窗邊，坐下轉 4 秒再推回去 */
function buildChairSpin(rng: Rng): Built {
  const k = pickInt(rng, WINDOW_SPOTS.length)
  const s = WINDOW_SPOTS[k]
  const steps = roundTrip(nearestDoor(s.at), [
    { kind: 'stay', at: s.at, secs: 4, anim: 'sit', facing: s.facing, spin: 1 },
  ])
  return { cast: [{ steps, prop: 'chair' }], uses: [`window-${k}`] }
}

/** 角落順序 RING_CW 中有員工門的角（se 是主管室） */
const DOOR_CORNERS = STAFF_DOORS.map((d) => RING_CW.indexOf(roomOfDoor(d).ring))

/**
 * 澆花：從員工門出發，沿走廊相鄰的 2–3 盆依序澆（各 crouch 2 秒），從離最後一盆最近的員工門離開。
 * 3 盆時只從 ne／sw 出發（首尾都有員工門），整段才在 40 秒內
 */
function buildWaterPlants(rng: Rng): Built {
  const n = 2 + pickInt(rng, 2)
  const dir = rng() < 0.5 ? 1 : 3
  const starts = n === 3 ? DOOR_CORNERS.filter((c) => DOOR_CORNERS.includes((c + 2 * dir) % 4)) : DOOR_CORNERS
  const first = pick(rng, starts)
  const ks = Array.from({ length: n }, (_, j) => (first + j * dir) % 4)
  const stays = ks.map((k): Extract<NpcStep, { kind: 'stay' }> => ({
    kind: 'stay',
    at: WATER_SPOTS[k].at,
    secs: 2,
    anim: 'crouch',
    facing: WATER_SPOTS[k].facing,
  }))
  const steps = roundTrip(STAFF_DOORS[DOOR_CORNERS.indexOf(first)], stays)
  steps[steps.length - 1] = move(stays[n - 1].at, nearestDoor(stays[n - 1].at))
  return { cast: [{ steps, prop: 'can' }], uses: ks.map((k) => `plant-${k}`) }
}

/** 掃地機器人：從一扇員工門出來，沿走廊順時針掃到下一扇員工門進去 */
function buildVacuum(rng: Rng): Built {
  const j = pickInt(rng, DOOR_CORNERS.length)
  const from = DOOR_CORNERS[j]
  const to = DOOR_CORNERS[(j + 1) % DOOR_CORNERS.length]
  const corners: Vec3[] = []
  for (let c = from; ; c = (c + 1) % 4) {
    corners.push(RING_CW[c])
    if (c === to) break
  }
  const path = [STAFF_DOORS[j], ...corners, STAFF_DOORS[(j + 1) % STAFF_DOORS.length]]
  return { cast: [{ steps: [{ kind: 'move', path }], prop: 'robot', person: false }], uses: corridorUses(path) }
}

/** 推車經過：從一扇員工門沿走廊推到另一扇 */
function buildCartPass(rng: Rng): Built {
  const [a, b] = sample(rng, STAFF_DOORS, 2)
  const path = ringPath(a, b)
  return { cast: castOf([[{ kind: 'move', path }]], 'cart'), uses: corridorUses(path) }
}

/** 影印機卡紙：從西側兩扇員工門（離影印機近，整段在 40 秒內）出發 */
const COPIER_DOORS: Vec3[] = [CORNER_ROOMS.nw.door, CORNER_ROOMS.sw.door]
/** 拍機器、蹲下修的秒數 */
const JAM_WAVE = 2
const JAM_FIX = 4

/**
 * 修理的人先到 copierSpot(0) 拍 2 秒、蹲修 4 秒；1–2 人晚 STAGGER 依序出門到 copierSpot(1|2) 圍觀，
 * 修完才依序離開。兩人圍觀時靠內（2，離走廊遠）的先到、後走，進出都不穿過已站定的人
 */
function buildCopierJam(rng: Rng): Built {
  const door = pick(rng, COPIER_DOORS)
  const watchers: (1 | 2)[] = pickInt(rng, 2) === 0 ? [rng() < 0.5 ? 1 : 2] : [2, 1]
  const fix = copierSpot(0)
  const go = ringPath(door, fix.at)
  const workEnd = pathLen(go) / WALK_SPEED + JAM_WAVE + JAM_FIX
  const fixer: NpcStep[] = [
    { kind: 'move', path: go },
    { kind: 'stay', at: fix.at, secs: JAM_WAVE, anim: 'wave', facing: fix.facing },
    { kind: 'stay', at: fix.at, secs: JAM_FIX, anim: 'crouch', facing: fix.facing },
    move(fix.at, door),
  ]
  const n = watchers.length
  const scripts = watchers.map((k, j) => {
    const s = copierSpot(k)
    const path = ringPath(door, s.at)
    const arrive = (j + 1) * STAGGER + pathLen(path) / WALK_SPEED
    // 晚到的先走：第 j 人在修完後 (n - j) × STAGGER 離開
    const leave = workEnd + (n - j) * STAGGER
    return [
      ...waitThenMove((j + 1) * STAGGER, path),
      { kind: 'stay', at: s.at, secs: leave - arrive, anim: 'idle', facing: s.facing } as NpcStep,
      move(s.at, door),
    ]
  })
  return { cast: castOf([fixer, ...scripts]), uses: [doorKey(door), 'copier'] }
}

const BUILDERS: Record<SceneKind, (rng: Rng) => Built> = {
  visitor: buildVisitor,
  chat: buildChat,
  rest: buildRest,
  delivery: buildDelivery,
  cleaning: buildCleaning,
  'paper-plane': buildPaperPlane,
  'chair-spin': buildChairSpin,
  'water-plants': buildWaterPlants,
  vacuum: buildVacuum,
  'cart-pass': buildCartPass,
  'copier-jam': buildCopierJam,
}

/** 聊天的發言依輪次（第 k 輪由第 k % n 人講）配台詞：有八卦時一半機率講八卦，其餘從洗過的梗清單依序取 */
function assignLines(scripts: NpcStep[][], rng: Rng, gossip: string[]): void {
  const talks = scripts.map((steps) =>
    steps.filter((s): s is Extract<NpcStep, { kind: 'stay' }> => s.kind === 'stay' && s.bubble === true),
  )
  const n = talks.length
  const total = talks.reduce((sum, t) => sum + t.length, 0)
  const jokes = sample(rng, [...NPC_JOKES], NPC_JOKES.length)
  let j = 0
  for (let k = 0; k < total; k++) {
    const step = talks[k % n][Math.floor(k / n)]
    if (!step) continue
    step.line = gossip.length > 0 && rng() < 0.5 ? pick(rng, gossip) : jokes[j++ % jokes.length]
  }
}

/** talk.gossip：現場八卦（officeGossip）；台詞在選完模型後才抽，不影響前面的 rng 序列；id：排程用的情境編號 */
export function buildScene(kind: SceneKind, rng: Rng, talk: { gossip: string[] } = { gossip: [] }, id = 0): NpcScene {
  const { cast, uses } = BUILDERS[kind](rng)
  const models = sample(rng, CHARACTER_MODELS, cast.filter((c) => c.person !== false).length)
  if (kind === 'chat')
    assignLines(
      cast.map((c) => c.steps),
      rng,
      talk.gossip,
    )
  let m = 0
  return {
    id,
    kind,
    uses,
    actors: cast.map((c, i) => ({
      id: `${kind}-${i}`,
      model: c.person === false ? null : models[m++],
      prop: c.prop ?? null,
      steps: c.steps,
    })),
  }
}

export function startRun(scene: NpcScene): SceneRun {
  return { actors: scene.actors.map((actor) => ({ actor, prop: actor.prop, i: 0, seg: 0, t: 0 })) }
}

function advance(run: ActorRun, dt: number): void {
  const { steps } = run.actor
  while (dt > 0 && run.i < steps.length) {
    const step = steps[run.i]
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
        if (step.drop) run.prop = null
        run.i++
        run.t = 0
      } else {
        run.t += dt
        dt = 0
      }
    }
  }
}

/** 推進 dt 秒（內部上限 0.1）；回傳是否還有人在場 */
export function tickRun(run: SceneRun, dt: number): boolean {
  const d = Math.min(Math.max(dt, 0), MAX_DELTA)
  for (const a of run.actors) advance(a, d)
  return run.actors.some((a) => a.i < a.actor.steps.length)
}

export function runPoses(run: SceneRun): NpcPose[] {
  const poses: NpcPose[] = []
  for (const r of run.actors) {
    const step = r.actor.steps[r.i]
    if (!step) continue
    const base = { id: r.actor.id, model: r.actor.model, prop: r.prop }
    if (step.kind === 'stay') {
      const facing = step.facing + (step.spin ? 2 * Math.PI * step.spin * r.t : 0)
      poses.push({
        ...base,
        position: step.at,
        anim: step.anim,
        facing,
        bubble: step.bubble === true,
        line: step.line ?? null,
      })
      continue
    }
    const a = step.path[r.seg]
    const b = step.path[r.seg + 1]
    const len = b ? dist(a, b) : 0
    const f = len > 0 ? r.t / len : 0
    const position: Vec3 = b ? [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f] : a
    poses.push({ ...base, position, anim: 'walk', facing: null, bubble: false, line: null })
  }
  return poses
}
