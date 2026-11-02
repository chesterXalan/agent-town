// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OfficeStatus } from '../../../../shared/office'
import { WALK_SPEED } from './eventQueue'
import { DOOR, type Vec3 } from './layout'
import { coffeeQueueSpot } from './lifeSpots'
import { activeCount, createLife, lifePose, MAX_ACTIVE, tickLife, type LifeAgentInput, type LifeState } from './lifeRun'
import { ringPath } from './path'
import { routineBias, type RoutineSlot } from './routine'
import { seeded } from './street'

const route = (a: Vec3, b: Vec3): Vec3[] => [a, b]
const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2])
const COFFEE = coffeeQueueSpot(0).at

function agent(id: string, o: Partial<LifeAgentInput> = {}): LifeAgentInput {
  const n = Number(id.replace(/\D/g, '') || 0)
  return {
    id,
    status: 'waiting',
    dept: 'west-south',
    slug: null,
    job: 'colleague',
    home: [n * 2 - 8, 0, -8],
    homeFacing: 0,
    speed: 1,
    ...o,
  }
}

function ctxOf(seed = 7, o: { slot?: RoutineSlot; paused?: ReadonlySet<string> } = {}) {
  const slot = o.slot ?? 'work'
  return { bias: routineBias(slot), slot, route, rng: seeded(seed), paused: o.paused }
}

/** 先 tick 0 秒建立狀態，再把指定需求調低 */
function setNeeds(
  s: LifeState,
  inputs: LifeAgentInput[],
  ctx: ReturnType<typeof ctxOf>,
  low: Partial<Record<'energy' | 'social' | 'thirst', number>>,
  ids = inputs.map((a) => a.id),
) {
  tickLife(s, inputs, 0, ctx)
  for (const id of ids) Object.assign(s.agents.get(id)!.needs, low)
}

/** 每 0.1 秒 tick，最多 secs 秒，cond 成立就停；回傳是否成立 */
function tickUntil(
  s: LifeState,
  inputs: LifeAgentInput[],
  ctx: ReturnType<typeof ctxOf>,
  secs: number,
  cond: () => boolean,
): boolean {
  for (let t = 0; t < secs; t += 0.1) {
    tickLife(s, inputs, 0.1, ctx)
    if (cond()) return true
  }
  return false
}

describe('tickLife', () => {
  it('thirst 低的 waiting agent 出發走向咖啡機', () => {
    const s = createLife()
    const a = agent('a1')
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    tickLife(s, [a], 0.5, ctx)
    const p1 = lifePose(s, 'a1')
    expect(p1).not.toBeNull()
    expect(p1!.anim).toBe('walk')
    expect(p1!.facing).toBeNull()
    tickLife(s, [a], 1, ctx)
    const p2 = lifePose(s, 'a1')!
    expect(dist(p2.position, COFFEE)).toBeLessThan(dist(p1!.position, COFFEE))
    expect(activeCount(s)).toBe(1)
  })

  it('8 個都要補的 agent 同時 tick，activeCount 不超過 6', () => {
    const s = createLife()
    const inputs = Array.from({ length: 8 }, (_, i) => agent(`a${i}`))
    const ctx = ctxOf()
    // 咖啡、沙發各 4 個站位，合計 8 > 6
    setNeeds(s, inputs, ctx, { thirst: 5 }, ['a0', 'a1', 'a2', 'a3'])
    for (const id of ['a4', 'a5', 'a6', 'a7']) s.agents.get(id)!.needs.energy = 5
    for (let k = 0; k < 100; k++) {
      tickLife(s, inputs, 0.1, ctx)
      expect(activeCount(s)).toBeLessThanOrEqual(MAX_ACTIVE)
    }
    expect(activeCount(s)).toBe(MAX_ACTIVE)
  })

  it('行程中 status 改 tool → 下一刻改走回，結束後 lifePose 變 null', () => {
    const s = createLife()
    const a = agent('a1')
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    expect(tickUntil(s, [a], ctx, 30, () => lifePose(s, 'a1')?.anim !== 'walk' && lifePose(s, 'a1') !== null)).toBe(
      true,
    )
    // 已在咖啡機（stay）
    const busy: LifeAgentInput = { ...a, status: 'tool' }
    tickLife(s, [busy], 0.1, ctx)
    expect(lifePose(s, 'a1')!.anim).toBe('walk')
    expect(tickUntil(s, [busy], ctx, 30, () => lifePose(s, 'a1') === null)).toBe(true)
    expect(activeCount(s)).toBe(0)
  })

  it('走回途中位置逐步接近 home 並結束', () => {
    const s = createLife()
    const a = agent('a1')
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    tickLife(s, [a], 2, ctx)
    const busy: LifeAgentInput = { ...a, status: 'replying' }
    let last = Infinity
    let lastPos: Vec3 | null = null
    for (let k = 0; k < 300 && lifePose(s, 'a1'); k++) {
      tickLife(s, [busy], 0.1, ctx)
      const p = lifePose(s, 'a1')
      if (!p) break
      expect(p.anim).toBe('walk')
      const d = dist(p.position, a.home)
      expect(d).toBeLessThanOrEqual(last + 1e-9)
      last = d
      lastPos = p.position
    }
    expect(lifePose(s, 'a1')).toBeNull()
    expect(lastPos).not.toBeNull()
    expect(dist(lastPos!, a.home)).toBeLessThan(0.3)
  })

  it('thinking 時遠距活動中斷走回；近距活動不中斷', () => {
    const s = createLife()
    const a = agent('a1')
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    tickLife(s, [a], 1, ctx)
    const near: LifeAgentInput = { ...a, status: 'thinking' }
    tickLife(s, [near], 0.1, ctx)
    expect(lifePose(s, 'a1')!.anim).toBe('walk')
    expect(tickUntil(s, [near], ctx, 30, () => lifePose(s, 'a1') === null)).toBe(true)

    // 近距（whiteboard）：轉 thinking 後照常走到白板停留，不改走回
    const s2 = createLife()
    const b = agent('a2', { slug: 'p', job: 'lead' })
    const mate = agent('a3', { slug: 'p', job: 'engineer', status: 'thinking' })
    setNeeds(s2, [b, mate], ctx, { social: 10 }, ['a2'])
    tickLife(s2, [b, mate], 0.5, ctx)
    expect(s2.agents.get('a2')!.run?.kind).toBe('whiteboard')
    const thinking: LifeAgentInput = { ...b, status: 'thinking' }
    expect(tickUntil(s2, [thinking, mate], ctx, 30, () => lifePose(s2, 'a2')?.anim === 'wave')).toBe(true)
    expect(s2.agents.get('a2')!.run?.interrupted).toBe(false)
  })

  it('agent 從 inputs 移除 → 狀態刪除、activeCount 下降', () => {
    const s = createLife()
    const a = agent('a1')
    const b = agent('a2')
    const ctx = ctxOf()
    setNeeds(s, [a, b], ctx, { thirst: 10 })
    tickLife(s, [a, b], 0.5, ctx)
    expect(activeCount(s)).toBe(2)
    tickLife(s, [b], 0.1, ctx)
    expect(activeCount(s)).toBe(1)
    expect(lifePose(s, 'a1')).toBeNull()
    expect(s.agents.has('a1')).toBe(false)
  })

  it('兩人同選 coffee → 站位不同', () => {
    const s = createLife()
    const inputs = [agent('a1'), agent('a2')]
    const ctx = ctxOf()
    setNeeds(s, inputs, ctx, { thirst: 10 })
    const stops: Record<string, Vec3> = {}
    for (let k = 0; k < 200 && Object.keys(stops).length < 2; k++) {
      tickLife(s, inputs, 0.1, ctx)
      for (const { id } of inputs) {
        const p = lifePose(s, id)
        if (p && p.anim !== 'walk' && !stops[id]) stops[id] = p.position
      }
    }
    expect(Object.keys(stops)).toHaveLength(2)
    expect(dist(stops.a1, stops.a2)).toBeGreaterThan(0.3)
  })

  it('設施站位滿額就不出發，釋出後才出發', () => {
    const s = createLife()
    const inputs = Array.from({ length: 5 }, (_, i) => agent(`a${i}`))
    const ctx = ctxOf()
    setNeeds(s, inputs, ctx, { thirst: 10 })
    tickLife(s, inputs, 0.1, ctx)
    // coffee 只有 4 個站位
    expect(activeCount(s)).toBe(4)
    expect(lifePose(s, 'a4')).toBeNull()
    // a0 改 tool → 中斷即釋出，a4 下一刻出發
    const next = inputs.map((a) => (a.id === 'a0' ? { ...a, status: 'tool' as OfficeStatus } : a))
    tickLife(s, next, 0.1, ctx)
    expect(lifePose(s, 'a4')).not.toBeNull()
  })

  it('單次 tickLife(dt=5) 與 50 次 dt=0.1 結果一致', () => {
    const run = (chunks: number[]) => {
      const s = createLife()
      const inputs = Array.from({ length: 4 }, (_, i) => agent(`a${i}`))
      const ctx = ctxOf(3)
      setNeeds(s, inputs, ctx, { thirst: 10 }, ['a0', 'a1'])
      for (const dt of chunks) tickLife(s, inputs, dt, ctx)
      return inputs.map(({ id }) => lifePose(s, id))
    }
    const one = run([5])
    const many = run(Array.from({ length: 50 }, () => 0.1))
    expect(one).toHaveLength(4)
    one.forEach((p, i) => {
      expect(p === null).toBe(many[i] === null)
      if (p && many[i]) {
        expect(p.position[0]).toBeCloseTo(many[i]!.position[0], 6)
        expect(p.position[2]).toBeCloseTo(many[i]!.position[2], 6)
        expect(p.anim).toBe(many[i]!.anim)
      }
    })
    expect(one[0]).not.toBeNull()
  })

  it('大 dt 不卡死：一次 tick 60 秒後行程走完', () => {
    const s = createLife()
    const a = agent('a1')
    const ctx = { ...ctxOf(), bias: { weights: {}, roamScale: 0 } }
    setNeeds(s, [a], ctx, { thirst: 10, social: 100, energy: 100 })
    tickLife(s, [a], 0.1, ctx)
    expect(lifePose(s, 'a1')).not.toBeNull()
    tickLife(s, [a], 60, ctx)
    expect(lifePose(s, 'a1')).toBeNull()
    const n = s.agents.get('a1')!.needs
    expect(n.thirst).toBeGreaterThan(40)
    expect(Math.min(n.energy, n.social, n.thirst)).toBeGreaterThanOrEqual(0)
  })

  it('paused 的 agent 位置不變也不出發', () => {
    const s = createLife()
    const a = agent('a1')
    const b = agent('a2')
    const ctx = ctxOf()
    setNeeds(s, [a, b], ctx, { thirst: 10 })
    tickLife(s, [a], 0.5, ctx)
    const before = lifePose(s, 'a1')!.position
    const paused = { ...ctx, paused: new Set(['a1', 'a2']) }
    tickLife(s, [a, b], 2, paused)
    expect(lifePose(s, 'a1')!.position).toEqual(before)
    expect(lifePose(s, 'a2')).toBeNull()
  })

  it('tool 狀態的 agent 永不出發', () => {
    const s = createLife()
    const a = agent('a1', { status: 'tool' })
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 1, social: 1, energy: 1 })
    for (let k = 0; k < 600; k++) {
      tickLife(s, [a], 1, ctx)
      expect(lifePose(s, 'a1')).toBeNull()
    }
  })

  it('whiteboard：同 slug 有另一位可走動的 engineer 才去白板補 social', () => {
    const s = createLife()
    const a = agent('a1', { slug: 'p', job: 'lead' })
    const mate = agent('a2', { slug: 'p', job: 'engineer', status: 'thinking' })
    const ctx = ctxOf()
    setNeeds(s, [a, mate], ctx, { social: 10 }, ['a1'])
    tickLife(s, [a, mate], 0.1, ctx)
    expect(s.agents.get('a1')!.run?.kind).toBe('whiteboard')

    const s2 = createLife()
    const busyMate = { ...mate, status: 'tool' as OfficeStatus }
    setNeeds(s2, [a, busyMate], ctx, { social: 10 }, ['a1'])
    tickLife(s2, [a, busyMate], 0.1, ctx)
    expect(s2.agents.get('a1')!.run?.kind).toBe('water-chat')
  })

  it('移動中保留前一段 stay 的 carry', () => {
    const s = createLife()
    const a = agent('a1')
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    let sawCupWalking = false
    for (let k = 0; k < 400 && !sawCupWalking; k++) {
      tickLife(s, [a], 0.1, ctx)
      const p = lifePose(s, 'a1')
      if (p?.anim === 'walk' && p.carry === 'cup') sawCupWalking = true
    }
    expect(sawCupWalking).toBe(true)
  })

  it('morning 首次出現的遠距 agent 從門口 arrive；非 morning 建立的不 arrive', () => {
    const s = createLife()
    const a = agent('a1')
    tickLife(s, [a], 0.1, ctxOf(1, { slot: 'morning' }))
    const p = lifePose(s, 'a1')!
    expect(p.carry).toBe('bag')
    expect(dist(p.position, DOOR)).toBeLessThan(0.5)
    expect(s.agents.get('a1')!.run?.kind).toBe('arrive')

    const s2 = createLife()
    tickLife(s2, [a], 0.1, ctxOf(1, { slot: 'work' }))
    tickLife(s2, [a], 0.1, ctxOf(1, { slot: 'morning' }))
    expect(s2.agents.get('a1')!.run?.kind).not.toBe('arrive')
  })

  it('morning 一次出現 8 人：名額外的 2 人不 arrive，之後也不從座位瞬移到門口', () => {
    const s = createLife()
    const inputs = Array.from({ length: 8 }, (_, i) => agent(`a${i}`))
    const ctx = ctxOf(1, { slot: 'morning' })
    tickLife(s, inputs, 0.1, ctx)
    const arriving = inputs.filter(({ id }) => s.agents.get(id)!.run?.kind === 'arrive')
    expect(arriving).toHaveLength(MAX_ACTIVE)
    const late = inputs.filter(({ id }) => !s.agents.get(id)!.run)
    expect(late).toHaveLength(2)
    for (const { id } of late) expect(s.agents.get(id)!.arrivePending).toBe(false)
    for (let k = 0; k < 600; k++) {
      tickLife(s, inputs, 0.1, ctx)
      for (const { id } of late) {
        expect(s.agents.get(id)!.run?.kind).not.toBe('arrive')
        const p = lifePose(s, id)
        if (p) expect(dist(p.position, DOOR)).toBeGreaterThan(0.5)
      }
    }
  })

  it('morning 首次出現時被 paused：不留 arrive 到之後', () => {
    const s = createLife()
    const a = agent('a1')
    tickLife(s, [a], 0.1, ctxOf(1, { slot: 'morning', paused: new Set(['a1']) }))
    tickLife(s, [a], 0.1, ctxOf(1, { slot: 'morning' }))
    expect(s.agents.get('a1')!.run?.kind).not.toBe('arrive')
  })
})

describe('起身頻率', () => {
  it('單一遠距 waiting agent 平均每 180–360 秒起身一次（固定 seed 模擬 2 小時）', () => {
    const s = createLife()
    const a = agent('a1', { home: [-6, 0, -8] })
    const ctx = { ...ctxOf(42), route: ringPath }
    const T = 7200
    let starts = 0
    let was = false
    for (let k = 0; k < T * 10; k++) {
      tickLife(s, [a], 0.1, ctx)
      const on = lifePose(s, 'a1') !== null
      if (on && !was) starts++
      was = on
    }
    const mean = T / starts
    expect(mean).toBeGreaterThanOrEqual(180)
    expect(mean).toBeLessThanOrEqual(360)
  })
})

describe('行程中 home 改變', () => {
  const SEAT: Vec3 = [-6, 0, -8]
  const PANTRY: Vec3 = [4, 0, 6]
  const STEP = WALK_SPEED * 0.1 + 1e-6

  /** 每 0.1 秒 tick 到行程結束；斷言每幀位移不超過一步（無瞬移），回傳結束前最後位置與最後一段 stay */
  function finish(s: LifeState, a: LifeAgentInput, ctx: ReturnType<typeof ctxOf>, from: Vec3) {
    let last = from
    let lastStay: { position: Vec3; facing: number | null } | null = null
    for (let k = 0; k < 600; k++) {
      tickLife(s, [a], 0.1, ctx)
      const p = lifePose(s, a.id)
      if (!p) return { last, lastStay }
      expect(dist(p.position, last)).toBeLessThanOrEqual(STEP)
      last = p.position
      if (p.anim !== 'walk') lastStay = { position: p.position, facing: p.facing }
    }
    throw new Error('行程沒結束')
  }

  it.each([
    ['waiting→done：座位 → pantry', SEAT, PANTRY, 'done'],
    ['done→waiting：pantry → 座位', PANTRY, SEAT, 'waiting'],
  ] as const)('在咖啡機時 home 改變：回程走到新 home，拿杯停在新 home (%s)', (_, from, to, status) => {
    const s = createLife()
    const a = agent('a1', { home: from, status: status === 'done' ? 'waiting' : 'done' })
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    expect(tickUntil(s, [a], ctx, 60, () => lifePose(s, 'a1')?.anim === 'wave')).toBe(true)
    const moved: LifeAgentInput = { ...a, home: to, homeFacing: 1, status }
    const { last, lastStay } = finish(s, moved, ctx, lifePose(s, 'a1')!.position)
    expect(dist(last, to)).toBeLessThan(0.01)
    expect(lastStay!.position).toEqual(to)
    expect(lastStay!.facing).toBe(1)
  })

  it.each([
    ['座位 → pantry', SEAT, PANTRY],
    ['pantry → 座位', PANTRY, SEAT],
  ] as const)('走回舊 home 途中改變：從目前位置改走新 home (%s)', (_, from, to) => {
    const s = createLife()
    const a = agent('a1', { home: from })
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    expect(
      tickUntil(s, [a], ctx, 60, () => lifePose(s, 'a1')?.carry === 'cup' && lifePose(s, 'a1')?.anim === 'walk'),
    ).toBe(true)
    const { last } = finish(s, { ...a, home: to }, ctx, lifePose(s, 'a1')!.position)
    expect(dist(last, to)).toBeLessThan(0.01)
  })

  it('正停在舊 home（拿杯回座）時改變：取消剩下的 stay，走去新 home', () => {
    const s = createLife()
    const a = agent('a1', { home: SEAT })
    const ctx = ctxOf()
    setNeeds(s, [a], ctx, { thirst: 10 })
    expect(
      tickUntil(s, [a], ctx, 60, () => {
        const p = lifePose(s, 'a1')
        return p?.anim === 'hold' && dist(p.position, SEAT) < 1e-6
      }),
    ).toBe(true)
    tickLife(s, [{ ...a, home: PANTRY }], 0.1, ctx)
    expect(lifePose(s, 'a1')!.anim).toBe('walk')
    const { last } = finish(s, { ...a, home: PANTRY }, ctx, lifePose(s, 'a1')!.position)
    expect(dist(last, PANTRY)).toBeLessThan(0.01)
  })
})
