// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DOOR, HALF, type Vec3 } from './layout'
import { CHAT_CENTERS } from './npc'
import {
  activitySteps,
  chooseActivity,
  decayNeeds,
  initNeeds,
  NEAR_ACTIVITIES,
  NEED_THRESHOLD,
  roamOf,
  type ActivityKind,
  type LifeStep,
  type Needs,
} from './life'
import { routineBias } from './routine'
import { seeded } from './street'

const HOME: Vec3 = [3, 0, -8]
const route = (a: Vec3, b: Vec3): Vec3[] => [a, b]
const opts = (slot = 0, seed = 1) => ({
  home: HOME,
  homeFacing: 0,
  dept: 'west-south' as const,
  slot,
  route,
  rng: seeded(seed),
})
const FULL: Needs = { energy: 100, social: 100, thirst: 100 }
const work = routineBias('work')

const startOf = (s: LifeStep): Vec3 => (s.kind === 'move' ? s.path[0] : s.at)
const endOf = (s: LifeStep): Vec3 => (s.kind === 'move' ? s.path[s.path.length - 1] : s.at)
/** 不在 home 的停留點（設施站位） */
const awayStops = (steps: LifeStep[]): Vec3[] =>
  steps.flatMap((s) => (s.kind === 'stay' && s.at !== HOME ? [s.at] : []))

describe('roamOf', () => {
  it('tool／replying none、thinking near、waiting／done far', () => {
    expect(roamOf('tool')).toBe('none')
    expect(roamOf('replying')).toBe('none')
    expect(roamOf('thinking')).toBe('near')
    expect(roamOf('waiting')).toBe('far')
    expect(roamOf('done')).toBe('far')
  })
})

describe('initNeeds', () => {
  it('同 id 相同、值在 60–100', () => {
    expect(initNeeds('a1')).toEqual(initNeeds('a1'))
    for (const id of ['a1', 'b2', 'c3', 'xyz', '']) {
      for (const v of Object.values(initNeeds(id))) {
        expect(v).toBeGreaterThanOrEqual(60)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
  })
})

describe('decayNeeds', () => {
  it('大 dt 不低於 0', () => {
    expect(decayNeeds(FULL, 1e6)).toEqual({ energy: 0, social: 0, thirst: 0 })
  })
  it('thirst 從 100 降到門檻要 180–360 秒', () => {
    let n = FULL
    let t = 0
    while (n.thirst > NEED_THRESHOLD) {
      n = decayNeeds(n, 1)
      t += 1
    }
    expect(t).toBeGreaterThanOrEqual(180)
    expect(t).toBeLessThanOrEqual(360)
  })
  it('不改原物件', () => {
    const n = { ...FULL }
    decayNeeds(n, 10)
    expect(n).toEqual(FULL)
  })
})

describe('chooseActivity', () => {
  it('thirst=30 時回 coffee', () => {
    expect(
      chooseActivity({
        needs: { ...FULL, thirst: 30 },
        roam: 'far',
        bias: work,
        hasMate: false,
        dt: 0.1,
        rng: seeded(1),
      }),
    ).toBe('coffee')
  })
  it('social 低：有夥伴去白板，否則去飲水機；energy 低去沙發', () => {
    const low = { ...FULL, social: 20 }
    expect(chooseActivity({ needs: low, roam: 'far', bias: work, hasMate: true, dt: 0.1, rng: seeded(1) })).toBe(
      'whiteboard',
    )
    expect(chooseActivity({ needs: low, roam: 'far', bias: work, hasMate: false, dt: 0.1, rng: seeded(1) })).toBe(
      'water-chat',
    )
    expect(
      chooseActivity({
        needs: { ...FULL, energy: 10 },
        roam: 'far',
        bias: work,
        hasMate: false,
        dt: 0.1,
        rng: seeded(1),
      }),
    ).toBe('sofa')
  })
  it("roam='near' 只回 NEAR_ACTIVITIES 或 null", () => {
    for (let seed = 1; seed < 200; seed++) {
      const needs = { energy: seed % 100, social: (seed * 7) % 100, thirst: (seed * 13) % 100 }
      const a = chooseActivity({ needs, roam: 'near', bias: work, hasMate: seed % 2 === 0, dt: 1e4, rng: seeded(seed) })
      if (a !== null) expect(NEAR_ACTIVITIES).toContain(a)
    }
  })
  it("roam='none' 回 null", () => {
    expect(
      chooseActivity({
        needs: { energy: 0, social: 0, thirst: 0 },
        roam: 'none',
        bias: work,
        hasMate: true,
        dt: 1e4,
        rng: seeded(1),
      }),
    ).toBeNull()
  })
  it('需求都夠時每秒只有小機率出發，night 更少', () => {
    const count = (bias = work) => {
      const rng = seeded(7)
      let n = 0
      for (let k = 0; k < 10000; k++)
        if (chooseActivity({ needs: FULL, roam: 'far', bias, hasMate: false, dt: 1, rng })) n++
      return n
    }
    const day = count()
    expect(day).toBeGreaterThan(0)
    expect(day).toBeLessThan(200)
    expect(count(routineBias('night'))).toBeLessThan(day)
  })
})

describe('activitySteps', () => {
  const ALL: ActivityKind[] = ['coffee', 'water-chat', 'sofa', 'whiteboard', 'stretch', 'look-around', 'lunch']
  it.each(ALL)('%s 首尾都在 home', (kind) => {
    const steps = activitySteps(kind, opts())
    expect(steps.length).toBeGreaterThan(0)
    expect(startOf(steps[0])).toEqual(HOME)
    expect(endOf(steps[steps.length - 1])).toEqual(HOME)
  })
  it('coffee 有拿杯子的步驟、第一個 stay 帶 coffee 圖示（thirst 低時）', () => {
    const steps = activitySteps('coffee', { ...opts(), needs: { ...FULL, thirst: 30 } })
    expect(steps.some((s) => s.kind === 'stay' && s.carry === 'cup')).toBe(true)
    expect(steps.find((s) => s.kind === 'stay')).toMatchObject({ emote: 'coffee' })
  })
  it.each(['coffee', 'water-chat', 'sofa', 'whiteboard', 'lunch'] as const)(
    '%s 的 slot 0 與 slot 1 站位不同',
    (kind) => {
      const a = awayStops(activitySteps(kind, opts(0)))
      const b = awayStops(activitySteps(kind, opts(1)))
      expect(a.length).toBeGreaterThan(0)
      expect(a).not.toEqual(b)
    },
  )
  it('slot 超出範圍不炸', () => {
    for (const kind of ALL)
      for (const slot of [-3, 99, 2.7, NaN]) expect(() => activitySteps(kind, opts(slot))).not.toThrow()
  })
  it('arrive 第一個 move 從 DOOR 出發，最後 pick-up 在 home', () => {
    const steps = activitySteps('arrive', opts())
    const m = steps.find((s) => s.kind === 'move')
    expect(m && startOf(m)).toEqual(DOOR)
    expect(steps[steps.length - 1]).toMatchObject({ kind: 'stay', anim: 'pick-up', at: HOME })
  })
  it('water-chat 6–10 秒、輪流 nod／idle，講話時帶笑話', () => {
    const stays = activitySteps('water-chat', opts(1, 3)).filter((s) => s.kind === 'stay')
    const secs = stays.reduce((t, s) => t + (s.kind === 'stay' ? s.secs : 0), 0)
    expect(secs).toBeGreaterThanOrEqual(6)
    expect(secs).toBeLessThanOrEqual(10)
    expect(stays.some((s) => s.anim === 'nod')).toBe(true)
    expect(stays.some((s) => s.anim === 'idle' && typeof s.line === 'string')).toBe(true)
  })
  it('sofa 一般滑手機，energy < 20 打瞌睡', () => {
    const sit = (needs?: Needs) =>
      activitySteps('sofa', { ...opts(), needs }).find((s) => s.kind === 'stay' && s.anim === 'sit')
    expect(sit()).toMatchObject({ carry: 'phone' })
    const doze = sit({ ...FULL, energy: 10 })
    expect(doze).toMatchObject({ emote: 'sleep' })
    expect(doze && doze.kind === 'stay' && doze.secs).toBeGreaterThanOrEqual(15)
  })
  it('lunch 取餐點依 slot 錯開 ≥ 0.8、離聊天圈心 ≥ 0.8、在地板內', () => {
    const pickupOf = (slot: number) => {
      const s = activitySteps('lunch', opts(slot)).find((x) => x.kind === 'stay' && x.anim === 'pick-up')
      if (s?.kind !== 'stay') throw new Error('no pick-up')
      return s.at
    }
    const d = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2])
    const spots = [0, 1, 2, 3, 4, 5].map(pickupOf)
    expect(d(spots[0], spots[1])).toBeGreaterThanOrEqual(0.8)
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) expect(d(spots[i], spots[j])).toBeGreaterThanOrEqual(0.8)
      for (const c of CHAT_CENTERS) expect(d(spots[i], c)).toBeGreaterThanOrEqual(0.8)
      expect(Math.abs(spots[i][0])).toBeLessThan(HALF)
      expect(Math.abs(spots[i][2])).toBeLessThan(HALF)
    }
  })
  it('lunch 先到取餐點拿盤子，再坐下吃 20 秒', () => {
    const steps = activitySteps('lunch', opts())
    expect(steps.some((s) => s.kind === 'stay' && s.carry === 'plate' && s.anim === 'sit' && s.secs === 20)).toBe(true)
  })
})
