// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CHARACTER_MODELS } from './appearance'
import { WALK_SPEED } from './eventQueue'
import { ATRIUM_SOFAS, CORNER_ROOMS, DOOR, pantrySpot, type Vec3 } from './layout'
import {
  buildScene,
  CHAT_CENTERS,
  COFFEE_SPOT,
  DELIVERY_SPOT,
  pickScene,
  runPoses,
  sofaSpot,
  STAFF_DOORS,
  startRun,
  tickRun,
  VISIT_STOPS,
  WINDOW_SPOTS,
  type NpcActor,
  type NpcScene,
  type NpcStep,
  type Rng,
  type SceneKind,
  scriptSecs,
  WATER_SPOTS,
} from './npc'
import { COPIER, copierSpot } from './lifeSpots'
import { NPC_JOKES } from './speech'

/** 依序回傳 xs、循環 */
function seq(xs: number[]): Rng {
  let i = 0
  return () => xs[i++ % xs.length]
}

const OLD_KINDS: SceneKind[] = ['visitor', 'chat', 'rest', 'delivery', 'cleaning']
const NEW_KINDS: SceneKind[] = ['paper-plane', 'chair-spin', 'water-plants', 'vacuum', 'cart-pass', 'copier-jam']
const KINDS: SceneKind[] = [...OLD_KINDS, ...NEW_KINDS]
const RNGS: number[][] = [
  [0.1, 0.5, 0.9],
  [0],
  [0.999],
  [0.3, 0.7],
  [0.6, 0.2, 0.8, 0.4],
  [0.45, 0.05, 0.95, 0.65, 0.35],
]
const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
const pathLen = (p: Vec3[]) => p.slice(1).reduce((s, q, k) => s + dist(p[k], q), 0)
const stepSecs = (s: NpcStep) => (s.kind === 'stay' ? s.secs : pathLen(s.path) / WALK_SPEED)
const stays = (a: NpcActor) => a.steps.filter((s): s is Extract<NpcStep, { kind: 'stay' }> => s.kind === 'stay')
/** 錯開出發：開頭可有一段在起點原地 idle 的等待 */
const leadWait = (a: NpcActor) => {
  const s = a.steps[0]
  return s.kind === 'stay' ? s : null
}
/** 扣掉開頭等待的 stay */
const bodyStays = (a: NpcActor) => stays(a).filter((x) => x !== leadWait(a))
/** 開頭等待只能是起點原地 idle，下一步是從起點出發的 move */
function expectLeadWait(a: NpcActor) {
  const w = leadWait(a)
  const m = a.steps.find((x) => x.kind === 'move')!
  expect(a.steps[w ? 1 : 0]).toBe(m)
  if (w) {
    expect(w.anim).toBe('idle')
    expect(same(w.at, startOf(a))).toBe(true)
    expect(w.secs).toBeGreaterThan(0)
  }
}
const moves = (a: NpcActor) => a.steps.filter((s): s is Extract<NpcStep, { kind: 'move' }> => s.kind === 'move')
const startOf = (a: NpcActor) => moves(a)[0].path[0]
const endOf = (a: NpcActor) => {
  const m = moves(a)
  const p = m[m.length - 1].path
  return p[p.length - 1]
}

function allScenes(): NpcScene[] {
  return KINDS.flatMap((k) => RNGS.map((xs) => buildScene(k, seq(xs))))
}

describe('pickScene', () => {
  // 權重：visitor／chat／rest 各 2，其餘各 1（共 14）
  it.each([
    [0, 'visitor'],
    [1.99 / 14, 'visitor'],
    [2 / 14, 'chat'],
    [4 / 14, 'rest'],
    [6 / 14, 'delivery'],
    [7 / 14, 'cleaning'],
    [8 / 14, 'paper-plane'],
    [9 / 14, 'chair-spin'],
    [10 / 14, 'water-plants'],
    [11 / 14, 'vacuum'],
    [12 / 14, 'cart-pass'],
    [13 / 14, 'copier-jam'],
    [0.999, 'copier-jam'],
  ] as const)('%s → %s', (r, kind) => {
    expect(pickScene(() => r)).toBe(kind)
  })

  it('exclude 的種類永不回傳，其餘都抽得到', () => {
    const seen = new Set<SceneKind>()
    for (let k = 0; k < 200; k++) {
      const kind = pickScene(() => k / 200, new Set(['chat']))
      expect(kind).not.toBe('chat')
      seen.add(kind)
    }
    expect(seen).toEqual(new Set(KINDS.filter((x) => x !== 'chat')))
    const only = new Set(KINDS.filter((x) => x !== 'vacuum'))
    for (const r of [0, 0.5, 0.999]) expect(pickScene(() => r, only)).toBe('vacuum')
  })
})

describe('buildScene', () => {
  it('visitor：1–2 人，DOOR 起訖，2–3 個 VISIT_STOPS 停留 3–5 秒', () => {
    const counts = new Set<number>()
    for (const xs of RNGS) {
      const s = buildScene('visitor', seq(xs))
      expect(s.kind).toBe('visitor')
      expect(s.actors.length).toBeGreaterThanOrEqual(1)
      expect(s.actors.length).toBeLessThanOrEqual(2)
      counts.add(s.actors.length)
      // 第一人直接出發；第二人在 DOOR 原地等一下才出發
      expect(leadWait(s.actors[0])).toBeNull()
      for (const a of s.actors) {
        expectLeadWait(a)
        expect(same(startOf(a), DOOR)).toBe(true)
        expect(a.steps[a.steps.length - 1].kind).toBe('move')
        expect(same(endOf(a), DOOR)).toBe(true)
        const st = bodyStays(a)
        expect(st.length).toBeGreaterThanOrEqual(2)
        expect(st.length).toBeLessThanOrEqual(3)
        for (const x of st) {
          expect(VISIT_STOPS.some((v) => same(v.at, x.at))).toBe(true)
          expect(x.secs).toBeGreaterThanOrEqual(3)
          expect(x.secs).toBeLessThanOrEqual(5)
        }
      }
    }
    expect(counts).toEqual(new Set([1, 2]))
  })

  it('chat：2–3 人同門起訖、同時開聊、輪流冒泡、面向圈心', () => {
    const counts = new Set<number>()
    for (const xs of RNGS) {
      const s = buildScene('chat', seq(xs))
      const n = s.actors.length
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(3)
      counts.add(n)
      const door = startOf(s.actors[0])
      expect(STAFF_DOORS.some((d) => same(d, door))).toBe(true)
      const starts: number[] = []
      const timelines: { from: number; to: number; bubble: boolean }[][] = []
      for (const a of s.actors) {
        expectLeadWait(a)
        expect(same(startOf(a), door)).toBe(true)
        expect(same(endOf(a), door)).toBe(true)
        const k = a.steps.findIndex((x) => x.kind === 'stay' && x.bubble !== undefined)
        expect(k).toBeGreaterThan(0)
        let t = a.steps.slice(0, k).reduce((acc, x) => acc + stepSecs(x), 0)
        starts.push(t)
        // 補等只能是 idle
        for (const x of a.steps.slice(0, k)) if (x.kind === 'stay') expect(x.anim).toBe('idle')
        const chat = stays(a).filter((x) => x.bubble !== undefined)
        const total = chat.reduce((acc, x) => acc + x.secs, 0)
        expect(total).toBeGreaterThanOrEqual(15)
        expect(total).toBeLessThanOrEqual(25)
        const tl: { from: number; to: number; bubble: boolean }[] = []
        for (const x of chat) {
          tl.push({ from: t, to: t + x.secs, bubble: x.bubble === true })
          t += x.secs
        }
        timelines.push(tl)
        const c = CHAT_CENTERS.find((cc) => dist(cc, chat[0].at) < 0.8 + 1e-6)
        expect(c).toBeDefined()
        for (const x of bodyStays(a)) {
          expect(Math.abs(dist(c!, x.at) - 0.8)).toBeLessThan(1e-6)
          expect(Math.abs(x.facing - Math.atan2(c![0] - x.at[0], c![2] - x.at[2]))).toBeLessThan(1e-6)
        }
      }
      for (const v of starts) expect(Math.abs(v - starts[0])).toBeLessThan(1e-6)
      // 每 3 秒取中點：恰好一人冒泡，且講者每段輪替
      const end = timelines[0][timelines[0].length - 1].to
      let prev = -1
      for (let t = starts[0] + 1.5; t < end; t += 3) {
        const speakers = timelines
          .map((tl, j) => (tl.find((g) => g.from <= t && t < g.to)?.bubble ? j : -1))
          .filter((j) => j >= 0)
        expect(speakers).toHaveLength(1)
        expect(speakers[0]).not.toBe(prev)
        prev = speakers[0]
      }
    }
    expect(counts).toEqual(new Set([2, 3]))
  })

  it('rest：1 人，唯一 stay 是咖啡機／沙發／窗邊之一', () => {
    const seen = new Set<string>()
    for (const xs of RNGS) {
      const s = buildScene('rest', seq(xs))
      expect(s.actors).toHaveLength(1)
      const a = s.actors[0]
      const st = stays(a)
      expect(st).toHaveLength(1)
      const x = st[0]
      expect(STAFF_DOORS.some((d) => same(d, startOf(a)))).toBe(true)
      expect(same(startOf(a), endOf(a))).toBe(true)
      const sofa = ([0, 1, 2, 3] as const).map(sofaSpot).find((p) => same(p.at, x.at))
      const win = WINDOW_SPOTS.find((p) => same(p.at, x.at))
      if (same(x.at, COFFEE_SPOT.at)) {
        seen.add('coffee')
        expect(x).toMatchObject({ secs: 4, anim: 'idle', facing: COFFEE_SPOT.facing })
      } else if (sofa) {
        seen.add('sofa')
        expect(x).toMatchObject({ secs: 8, anim: 'idle', facing: sofa.facing })
      } else if (win) {
        seen.add('window')
        expect(x).toMatchObject({ secs: 3, anim: 'cheer', facing: win.facing })
      } else throw new Error(`unexpected stay ${x.at}`)
    }
    expect(seen).toEqual(new Set(['coffee', 'sofa', 'window']))
  })

  it('delivery：1 人帶箱子，DELIVERY_SPOT 停 3 秒 drop，之後空手', () => {
    const s = buildScene('delivery', seq([0.3, 0.7]))
    expect(s.actors).toHaveLength(1)
    const a = s.actors[0]
    expect(a.prop).toBe('box')
    expect(same(startOf(a), DOOR)).toBe(true)
    expect(same(endOf(a), DOOR)).toBe(true)
    const st = stays(a)
    expect(st).toHaveLength(1)
    expect(st[0]).toMatchObject({ at: DELIVERY_SPOT.at, secs: 3, drop: true, facing: DELIVERY_SPOT.facing })
    // DOOR 與 DELIVERY_SPOT 同在大廳：直線來回，不繞走廊
    expect(moves(a).map((m) => m.path)).toEqual([
      [DOOR, DELIVERY_SPOT.at],
      [DELIVERY_SPOT.at, DOOR],
    ])

    const run = startRun(s)
    const toDrop = stepSecs(a.steps[0])
    let t = 0
    while (t < toDrop + 1) {
      tickRun(run, 0.1)
      t += 0.1
    }
    expect(runPoses(run)[0].prop).toBe('box')
    while (t < toDrop + 3.2) {
      tickRun(run, 0.1)
      t += 0.1
    }
    expect(runPoses(run)[0].prop).toBeNull()
    expect(runPoses(run)[0].anim).toBe('walk')
  })

  it('cleaning：1 人推車，順時針經走廊四角各一次，同門起訖', () => {
    const order = [CORNER_ROOMS.nw.ring, CORNER_ROOMS.ne.ring, CORNER_ROOMS.se.ring, CORNER_ROOMS.sw.ring]
    for (const xs of RNGS) {
      const s = buildScene('cleaning', seq(xs))
      expect(s.actors).toHaveLength(1)
      const a = s.actors[0]
      expect(a.prop).toBe('cart')
      expect(STAFF_DOORS.some((d) => same(d, startOf(a)))).toBe(true)
      expect(same(startOf(a), endOf(a))).toBe(true)
      const pts = moves(a).flatMap((m) => m.path)
      const corners = pts.map((p) => order.findIndex((c) => same(c, p))).filter((k) => k >= 0)
      // 出門角 → 其餘三角 → 回到出門角
      expect(corners).toHaveLength(5)
      expect(corners[4]).toBe(corners[0])
      for (let k = 1; k < 5; k++) expect(corners[k]).toBe((corners[0] + k) % 4)
    }
  })

  it('同一情境 model 不重複且都在 CHARACTER_MODELS', () => {
    for (const s of allScenes()) {
      const ms = s.actors.map((a) => a.model).filter((m) => m !== null)
      expect(new Set(ms).size).toBe(ms.length)
      for (const m of ms) expect(CHARACTER_MODELS).toContain(m)
      s.actors.forEach((a, i) => expect(a.id).toBe(`${s.kind}-${i}`))
    }
  })

  it('多人錯開：任兩人距離 < 0.4 的累計時間 < 2 秒（兩人都站著不算）', () => {
    /** 線性同餘亂數，固定種子 */
    const lcg = (seed: number): Rng => {
      let x = seed * 9301 + 49297
      return () => {
        x = (x * 9301 + 49297) % 233280
        return x / 233280
      }
    }
    const seen = new Map<string, number>()
    for (const kind of ['visitor', 'chat', 'copier-jam'] as const) {
      for (let seed = 0; seed < 60; seed++) {
        const s = buildScene(kind, lcg(seed))
        if (s.actors.length < 2) continue
        const key = `${kind}-${s.actors.length}`
        seen.set(key, (seen.get(key) ?? 0) + 1)
        const run = startRun(s)
        let close = 0
        while (tickRun(run, 0.05)) {
          const p = runPoses(run)
          let hit = false
          for (let i = 0; i < p.length; i++) {
            for (let j = i + 1; j < p.length; j++) {
              if (p[i].anim === 'walk' || p[j].anim === 'walk') hit ||= dist(p[i].position, p[j].position) < 0.4
            }
          }
          if (hit) close += 0.05
        }
        expect(close, `${kind} seed ${seed}`).toBeLessThan(2)
      }
    }
    expect([...seen.keys()].sort()).toEqual(['chat-2', 'chat-3', 'copier-jam-2', 'copier-jam-3', 'visitor-2'])
  })

  it('Review Focus 5：stay 位置距 pantrySpot 與沙發 ≥ 0.8', () => {
    const pantry = new Map<string, Vec3>()
    for (let i = 0; pantry.size < 8 && i < 1000; i++) {
      const p = pantrySpot(`npc-${i}`)
      pantry.set(p.join(','), p)
    }
    expect(pantry.size).toBe(8)
    const avoid = [...pantry.values(), ...ATRIUM_SOFAS.map((s) => s.position)]
    const extraStays = [
      COFFEE_SPOT,
      ...VISIT_STOPS,
      ...WINDOW_SPOTS,
      DELIVERY_SPOT,
      ...([0, 1, 2, 3] as const).map(sofaSpot),
    ].map((s) => s.at)
    const all = [...allScenes().flatMap((s) => s.actors.flatMap((a) => stays(a).map((x) => x.at))), ...extraStays]
    for (const p of all) for (const q of avoid) expect(dist(p, q)).toBeGreaterThanOrEqual(0.8)
  })
})

describe('runner', () => {
  const A: Vec3 = [0, 0, 0]
  const B: Vec3 = [4, 0, 0]
  const scene = (steps: NpcStep[]): NpcScene => ({
    id: 0,
    kind: 'rest',
    uses: [],
    actors: [{ id: 'rest-0', model: CHARACTER_MODELS[0], prop: null, steps }],
  })

  it('move 以 WALK_SPEED 前進，stay 照步驟，走完消失', () => {
    const run = startRun(
      scene([
        { kind: 'move', path: [A, B] },
        { kind: 'stay', at: B, secs: 1, anim: 'wave', facing: 1.5, bubble: true, line: '先 /compact 一下' },
      ]),
    )
    for (let k = 0; k < 10; k++) expect(tickRun(run, 0.1)).toBe(true)
    let [p] = runPoses(run)
    expect(p.position[0]).toBeCloseTo(WALK_SPEED * 1, 6)
    expect(p).toMatchObject({ anim: 'walk', facing: null, bubble: false, line: null, id: 'rest-0' })
    for (let k = 0; k < 15; k++) tickRun(run, 0.1)
    ;[p] = runPoses(run)
    expect(p).toMatchObject({ position: B, anim: 'wave', facing: 1.5, bubble: true, line: '先 /compact 一下' })
    let alive = true
    for (let k = 0; k < 20 && alive; k++) alive = tickRun(run, 0.1)
    expect(alive).toBe(false)
    expect(runPoses(run)).toHaveLength(0)
  })

  it('Review Focus 3：dt 上限 0.1 秒', () => {
    const run = startRun(scene([{ kind: 'move', path: [A, B] }]))
    tickRun(run, 5)
    expect(runPoses(run)[0].position[0]).toBeCloseTo(0.1 * WALK_SPEED, 6)
  })

  it('Review Focus 4：零長路徑立即完成、無 NaN', () => {
    const run = startRun(
      scene([
        { kind: 'move', path: [A] },
        { kind: 'move', path: [A, A, B] },
        { kind: 'stay', at: B, secs: 1, anim: 'idle', facing: 0 },
      ]),
    )
    for (const p of runPoses(run)) expect(p.position.every(Number.isFinite)).toBe(true)
    tickRun(run, 0.05)
    const [p] = runPoses(run)
    expect(p.position.every(Number.isFinite)).toBe(true)
    expect(p.position[0]).toBeCloseTo(0.05 * WALK_SPEED, 6)
  })

  it('多人：一人走完消失，另一人還在則 tickRun 回 true', () => {
    const run = startRun({
      id: 0,
      kind: 'chat',
      uses: [],
      actors: [
        {
          id: 'chat-0',
          model: CHARACTER_MODELS[0],
          prop: null,
          steps: [{ kind: 'stay', at: A, secs: 0.1, anim: 'idle', facing: 0 }],
        },
        {
          id: 'chat-1',
          model: CHARACTER_MODELS[1],
          prop: null,
          steps: [{ kind: 'stay', at: B, secs: 1, anim: 'idle', facing: 0 }],
        },
      ],
    })
    expect(tickRun(run, 0.2)).toBe(true)
    expect(runPoses(run).map((p) => p.id)).toEqual(['chat-1'])
  })
})

describe('聊天台詞', () => {
  const talking = (s: NpcScene) => s.actors.flatMap((a) => stays(a).filter((x) => x.bubble === true))

  it.each(RNGS)('沒有八卦：每次發言都配梗，非發言不配 (%#)', (...xs) => {
    const s = buildScene('chat', seq(xs))
    expect(talking(s).length).toBeGreaterThan(0)
    for (const x of talking(s)) expect(NPC_JOKES).toContain(x.line)
    for (const a of s.actors) for (const x of stays(a)) if (x.bubble !== true) expect(x.line).toBeUndefined()
  })

  it.each(RNGS)('發言用 nod，不舉手 wave (%#)', (...xs) => {
    const s = buildScene('chat', seq(xs))
    for (const x of talking(s)) expect(x.anim).toBe('nod')
    for (const a of s.actors) for (const x of stays(a)) expect(x.anim).not.toBe('wave')
  })

  it('有八卦：rng < 0.5 的輪次講八卦', () => {
    const lines = talking(buildScene('chat', seq([0.1]), { gossip: ['retail-foo 卡住了'] })).map((x) => x.line)
    expect(lines.every((l) => l === 'retail-foo 卡住了')).toBe(true)
    const jokes = talking(buildScene('chat', seq([0.9]), { gossip: ['retail-foo 卡住了'] })).map((x) => x.line)
    for (const l of jokes) expect(NPC_JOKES).toContain(l)
  })

  it('其他情境沒有台詞', () => {
    for (const s of allScenes().filter((x) => x.kind !== 'chat'))
      for (const a of s.actors) for (const x of stays(a)) expect(x.line).toBeUndefined()
  })
})

describe('小插曲', () => {
  const lastStays = (a: NpcActor) => bodyStays(a)

  it.each(NEW_KINDS)('%s：actors 非空、每人腳本 5–40 秒', (kind) => {
    for (const xs of RNGS) {
      const s = buildScene(kind, seq(xs))
      expect(s.kind).toBe(kind)
      expect(s.actors.length).toBeGreaterThan(0)
      for (const a of s.actors) {
        expect(scriptSecs(a.steps)).toBeGreaterThanOrEqual(5)
        expect(scriptSecs(a.steps)).toBeLessThanOrEqual(40)
      }
    }
  })

  it.each(KINDS)('%s：id 原樣保留（預設 0），uses 是站位鍵', (kind) => {
    expect(buildScene(kind, seq([0.3, 0.7]), undefined, 7).id).toBe(7)
    const s = buildScene(kind, seq([0.3, 0.7]))
    expect(s.id).toBe(0)
    for (const u of s.uses) expect(u).toMatch(/^[a-z0-9-]+$/)
    if (kind !== 'paper-plane') expect(s.uses.length).toBeGreaterThan(0)
  })

  it('paper-plane：只有道具、沿 y≈1.6 飛', () => {
    for (const xs of RNGS) {
      const s = buildScene('paper-plane', seq(xs))
      expect(s.actors).toHaveLength(1)
      const a = s.actors[0]
      expect(a.model).toBeNull()
      expect(a.prop).toBe('plane')
      const pts = moves(a).flatMap((m) => m.path)
      expect(pts.every((p) => p[1] > 1)).toBe(true)
      expect(Math.abs(pts[0][1] - 1.6)).toBeLessThan(0.3)
      expect(s.uses).toEqual([])
    }
  })

  it('chair-spin：推椅子到窗邊坐下 spin 1 轉 4 秒，朝向隨時間轉', () => {
    for (const xs of RNGS) {
      const s = buildScene('chair-spin', seq(xs))
      expect(s.actors).toHaveLength(1)
      const a = s.actors[0]
      expect(a.model).not.toBeNull()
      expect(a.prop).toBe('chair')
      const st = stays(a)
      expect(st).toHaveLength(1)
      expect(st[0]).toMatchObject({ anim: 'sit', spin: 1, secs: 4 })
      const k = WINDOW_SPOTS.findIndex((w) => same(w.at, st[0].at))
      expect(k).toBeGreaterThanOrEqual(0)
      expect(s.uses).toEqual([`window-${k}`])
      expect(same(startOf(a), endOf(a))).toBe(true)
    }
    const s = buildScene('chair-spin', seq([0]))
    const run = startRun(s)
    const toSpin = stepSecs(s.actors[0].steps[0])
    let t = 0
    while (t < toSpin + 0.5) {
      tickRun(run, 0.1)
      t += 0.1
    }
    const f0 = runPoses(run)[0].facing!
    tickRun(run, 0.1)
    const f1 = runPoses(run)[0].facing!
    expect(runPoses(run)[0].anim).toBe('sit')
    expect(f1 - f0).toBeCloseTo(2 * Math.PI * 0.1, 6)
  })

  it('water-plants：拿澆水壺，2–3 個盆栽點各 crouch 2 秒、面向盆栽', () => {
    const counts = new Set<number>()
    for (const xs of RNGS) {
      const s = buildScene('water-plants', seq(xs))
      expect(s.actors).toHaveLength(1)
      const a = s.actors[0]
      expect(a.prop).toBe('can')
      expect(STAFF_DOORS.some((d) => same(d, startOf(a)))).toBe(true)
      expect(STAFF_DOORS.some((d) => same(d, endOf(a)))).toBe(true)
      const st = stays(a)
      counts.add(st.length)
      const ks = st.map((x) => WATER_SPOTS.findIndex((w) => same(w.at, x.at)))
      for (const [j, x] of st.entries()) {
        expect(ks[j]).toBeGreaterThanOrEqual(0)
        expect(x).toMatchObject({ anim: 'crouch', secs: 2, facing: WATER_SPOTS[ks[j]].facing })
      }
      expect(new Set(ks).size).toBe(ks.length)
      expect(s.uses).toEqual(ks.map((k) => `plant-${k}`))
    }
    expect(counts).toEqual(new Set([2, 3]))
  })

  it('vacuum：只有掃地機器人，從一扇員工門沿走廊順時針到下一扇', () => {
    const order = [CORNER_ROOMS.nw.ring, CORNER_ROOMS.ne.ring, CORNER_ROOMS.se.ring, CORNER_ROOMS.sw.ring]
    for (const xs of RNGS) {
      const s = buildScene('vacuum', seq(xs))
      expect(s.actors).toHaveLength(1)
      const a = s.actors[0]
      expect(a.model).toBeNull()
      expect(a.prop).toBe('robot')
      expect(stays(a)).toHaveLength(0)
      const from = STAFF_DOORS.findIndex((d) => same(d, startOf(a)))
      const to = STAFF_DOORS.findIndex((d) => same(d, endOf(a)))
      expect(from).toBeGreaterThanOrEqual(0)
      expect(to).toBeGreaterThanOrEqual(0)
      expect(to).not.toBe(from)
      const corners = moves(a)
        .flatMap((m) => m.path)
        .map((p) => order.findIndex((c) => same(c, p)))
        .filter((k) => k >= 0)
      for (let k = 1; k < corners.length; k++) expect(corners[k]).toBe((corners[k - 1] + 1) % 4)
      expect(s.uses.length).toBeGreaterThan(0)
      for (const u of s.uses) expect(u).toMatch(/^corridor-[nesw]$/)
    }
  })

  it('cart-pass：一人推車從一扇員工門走到另一扇', () => {
    for (const xs of RNGS) {
      const s = buildScene('cart-pass', seq(xs))
      expect(s.actors).toHaveLength(1)
      const a = s.actors[0]
      expect(a.model).not.toBeNull()
      expect(a.prop).toBe('cart')
      const from = STAFF_DOORS.findIndex((d) => same(d, startOf(a)))
      const to = STAFF_DOORS.findIndex((d) => same(d, endOf(a)))
      expect(from).toBeGreaterThanOrEqual(0)
      expect(to).toBeGreaterThanOrEqual(0)
      expect(to).not.toBe(from)
      for (const u of s.uses) expect(u).toMatch(/^corridor-[nesw]$/)
    }
  })

  it('chat：uses 含出發的員工門', () => {
    for (const xs of RNGS) {
      const s = buildScene('chat', seq(xs))
      const k = STAFF_DOORS.findIndex((d) => same(d, startOf(s.actors[0])))
      expect(s.uses).toContain(['door-nw', 'door-ne', 'door-sw'][k])
    }
  })

  it('uses 不重疊的兩段同時演：不同情境的兩個站著的人距離 ≥ 0.4', () => {
    const lcg = (seed: number): Rng => {
      let x = seed * 9301 + 49297
      return () => {
        x = (x * 9301 + 49297) % 233280
        return x / 233280
      }
    }
    let pairs = 0
    for (const ka of KINDS) {
      for (const kb of KINDS) {
        if (ka === kb) continue
        for (let seed = 0; seed < 12; seed++) {
          const a = buildScene(ka, lcg(seed), undefined, 1)
          const b = buildScene(kb, lcg(seed + 100), undefined, 2)
          if (a.uses.some((u) => b.uses.includes(u))) continue
          pairs++
          const ra = startRun(a)
          const rb = startRun(b)
          let aliveA = true
          let aliveB = true
          while (aliveA || aliveB) {
            if (aliveA) aliveA = tickRun(ra, 0.1)
            if (aliveB) aliveB = tickRun(rb, 0.1)
            const pa = runPoses(ra).filter((p) => p.anim !== 'walk')
            const pb = runPoses(rb).filter((p) => p.anim !== 'walk')
            for (const p of pa)
              for (const q of pb)
                expect(dist(p.position, q.position), `${ka}/${kb} seed ${seed}`).toBeGreaterThanOrEqual(0.4)
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(500)
  })

  it('cleaning 佔滿四邊走廊', () => {
    expect([...buildScene('cleaning', seq([0.3])).uses].sort()).toEqual([
      'corridor-e',
      'corridor-n',
      'corridor-s',
      'corridor-w',
    ])
  })

  it('copier-jam：一人拍 wave 2 秒再 crouch 4 秒，1–2 人在 copierSpot(1|2) idle 圍觀', () => {
    const counts = new Set<number>()
    for (const xs of RNGS) {
      const s = buildScene('copier-jam', seq(xs))
      expect(s.uses).toContain('copier')
      const [fixer, ...watchers] = s.actors
      expect(s.uses).toContain(['door-nw', 'door-ne', 'door-sw'][STAFF_DOORS.findIndex((d) => same(d, startOf(fixer)))])
      counts.add(watchers.length)
      expect(watchers.length).toBeGreaterThanOrEqual(1)
      expect(watchers.length).toBeLessThanOrEqual(2)
      const fix = lastStays(fixer)
      expect(fix.map((x) => [x.anim, x.secs])).toEqual([
        ['wave', 2],
        ['crouch', 4],
      ])
      for (const x of fix) expect(x).toMatchObject({ at: copierSpot(0).at, facing: copierSpot(0).facing })
      const fixEnd = fixer.steps.slice(0, fixer.steps.indexOf(fix[1]) + 1).reduce((t, x) => t + stepSecs(x), 0)
      const spots = new Set<number>()
      for (const w of watchers) {
        expectLeadWait(w)
        const st = bodyStays(w)
        expect(st.length).toBeGreaterThan(0)
        const k = ([1, 2] as const).find((j) => same(copierSpot(j).at, st[0].at))
        expect(k).toBeDefined()
        spots.add(k!)
        for (const x of st) {
          expect(x.anim).toBe('idle')
          expect(same(x.at, copierSpot(k!).at)).toBe(true)
          expect(x.facing).toBeCloseTo(Math.atan2(COPIER.at[0] - x.at[0], COPIER.at[2] - x.at[2]), 6)
        }
        // 圍觀者在修理期間都在場
        const i = w.steps.indexOf(st[0])
        const arrive = w.steps.slice(0, i).reduce((t, x) => t + stepSecs(x), 0)
        const leave = arrive + st.reduce((t, x) => t + x.secs, 0)
        expect(arrive).toBeLessThanOrEqual(fixEnd - 2)
        expect(leave).toBeGreaterThanOrEqual(fixEnd)
      }
      expect(spots.size).toBe(watchers.length)
    }
    expect(counts).toEqual(new Set([1, 2]))
  })
})
