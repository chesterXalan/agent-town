// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OfficeAgent } from '../../../../shared/api'
import type { EventPose } from './eventQueue'
import { assignSeats, pantrySpot, seatFacing, seatPosition, type Vec3 } from './layout'
import type { LifePose } from './lifeRun'
import { LUNCH_SEATS, sofaSeat } from './lifeSpots'
import { agentHome, BENCH_LIFT, lifeSeatLift, resolvePose, SOFA_LIFT } from './resolvePose'

const home: Vec3 = [1, 0, 2]
const NO_EVENT: EventPose = { position: null, anim: null, facing: null, emote: null, carry: null }
const ev = (o: Partial<EventPose>): EventPose => ({ ...NO_EVENT, ...o })
const life: LifePose = { position: [5, 0, 5], anim: 'hold', facing: 1, carry: 'cup', emote: 'coffee', line: '早安' }

describe('resolvePose', () => {
  it('事件有位置：用事件位置與動作、不坐、不拿生活道具', () => {
    const d = resolvePose({ event: ev({ position: [3, 0, 3], anim: 'walk' }), life, home, atSeat: true, emote: null })
    expect(d).toEqual({
      position: [3, 0, 3],
      anim: 'walk',
      facing: null,
      seated: false,
      carry: null,
      emote: null,
      lift: 0,
      line: null,
    })
  })

  it('座位上的事件（position null、有動作）：壓過生活姿勢，回座位且 seated', () => {
    const d = resolvePose({ event: ev({ anim: 'cheer' }), life, home, atSeat: true, emote: 'heart' })
    expect(d).toEqual({
      position: home,
      anim: 'cheer',
      facing: null,
      seated: true,
      carry: null,
      emote: 'heart',
      lift: 0,
      line: null,
    })
  })

  it('無事件有生活姿勢：用生活位置、動作、朝向、手持物與台詞', () => {
    const d = resolvePose({ event: NO_EVENT, life, home, atSeat: true, emote: null })
    expect(d).toEqual({
      position: [5, 0, 5],
      anim: 'hold',
      facing: 1,
      seated: false,
      carry: 'cup',
      emote: 'coffee',
      lift: 0,
      line: '早安',
    })
  })

  it('座位原地的生活動作（轉頭、放包、拿杯回座）：seated，不站進椅子', () => {
    for (const anim of ['idle', 'cheer', 'pick-up', 'hold'] as const) {
      const d = resolvePose({
        event: NO_EVENT,
        life: { ...life, position: [1, 0, 2 + 1e-6], anim },
        home,
        atSeat: true,
        emote: null,
      })
      expect(d.seated).toBe(true)
      expect(d.anim).toBe(anim)
      expect(d.lift).toBe(0)
    }
  })

  it('生活姿勢走路中、離開座位、或 home 在 pantry：不 seated', () => {
    expect(
      resolvePose({ event: NO_EVENT, life: { ...life, position: home, anim: 'walk' }, home, atSeat: true, emote: null })
        .seated,
    ).toBe(false)
    expect(
      resolvePose({
        event: NO_EVENT,
        life: { ...life, position: [1.5, 0, 2], anim: 'idle' },
        home,
        atSeat: true,
        emote: null,
      }).seated,
    ).toBe(false)
    expect(
      resolvePose({
        event: NO_EVENT,
        life: { ...life, position: home, anim: 'idle' },
        home,
        atSeat: false,
        emote: null,
      }).seated,
    ).toBe(false)
  })

  it('生活姿勢時外部 emote 優先於行程內建 emote', () => {
    expect(resolvePose({ event: NO_EVENT, life, home, atSeat: true, emote: 'angry' }).emote).toBe('angry')
  })

  it('兩者皆無且在座位：seated、位置＝home', () => {
    const d = resolvePose({ event: NO_EVENT, life: null, home, atSeat: true, emote: 'idea' })
    expect(d).toEqual({
      position: home,
      anim: null,
      facing: null,
      seated: true,
      carry: null,
      emote: 'idea',
      lift: 0,
      line: null,
    })
  })

  it('兩者皆無且在 pantry：不坐', () => {
    const d = resolvePose({ event: NO_EVENT, life: null, home, atSeat: false, emote: null })
    expect(d.seated).toBe(false)
    expect(d.position).toEqual(home)
  })

  it('事件帶 emote／carry／facing：優先於生活姿勢與外部 emote', () => {
    const moving = resolvePose({
      event: ev({ position: [3, 0, 3], anim: null, facing: 0.5, emote: 'heart', carry: 'clipboard' }),
      life,
      home,
      atSeat: true,
      emote: 'idea',
    })
    expect(moving).toMatchObject({
      position: [3, 0, 3],
      facing: 0.5,
      emote: 'heart',
      carry: 'clipboard',
      seated: false,
    })
    const seated = resolvePose({
      event: ev({ anim: 'slump', facing: 1.5, emote: 'angry' }),
      life,
      home,
      atSeat: true,
      emote: 'idea',
    })
    expect(seated).toMatchObject({
      position: home,
      anim: 'slump',
      facing: 1.5,
      emote: 'angry',
      carry: null,
      seated: true,
    })
  })

  it('emote 在各分支都透傳', () => {
    for (const event of [ev({ position: [3, 0, 3], anim: 'walk' }), NO_EVENT]) {
      for (const l of [life, null])
        expect(resolvePose({ event, life: l, home, atSeat: true, emote: 'sleep' }).emote).toBe('sleep')
    }
  })
})

function agent(o: Partial<OfficeAgent>): OfficeAgent {
  return {
    id: 'A',
    kind: 'session',
    slug: null,
    agentId: null,
    taskId: null,
    dept: 'north-west',
    job: 'engineer',
    rank: 'mid',
    effort: null,
    status: 'tool',
    verdict: null,
    model: null,
    agentType: null,
    lastTool: null,
    lastTs: null,
    projectDir: 'p',
    ...o,
  }
}

describe('agentHome', () => {
  it('做完的 session 在 pantry、朝向 0、不在座位', () => {
    const a = agent({ status: 'done' })
    const seat = assignSeats(new Map(), [a]).get('A')!
    expect(agentHome(a, seat)).toEqual({ home: pantrySpot('A'), facing: 0, atSeat: false })
  })

  it('其他在座位、面向桌子', () => {
    const a = agent({ kind: 'subagent', status: 'done' })
    const seat = assignSeats(new Map(), [a]).get('A')!
    expect(agentHome(a, seat)).toEqual({ home: seatPosition(seat), facing: seatFacing(seat) + Math.PI, atSeat: true })
  })
})

describe('lifeSeatLift', () => {
  const sit = (position: Vec3): LifePose => ({ position, anim: 'sit', facing: 0, carry: null, emote: null, line: null })

  it('坐沙發抬到沙發座墊頂、坐長椅抬到長椅座墊頂', () => {
    expect(SOFA_LIFT).toBeCloseTo(0.42, 2)
    expect(BENCH_LIFT).toBeCloseTo(0.44, 2)
    for (const k of [0, 1, 2, 3] as const) expect(lifeSeatLift(sit(sofaSeat(k).at))).toBe(SOFA_LIFT)
    for (const s of LUNCH_SEATS) expect(lifeSeatLift(sit(s.at))).toBe(BENCH_LIFT)
  })

  it('不是 sit 或不在家具座位上不抬', () => {
    expect(lifeSeatLift({ ...sit(sofaSeat(0).at), anim: 'idle' })).toBe(0)
    expect(lifeSeatLift(sit([5, 0, 5]))).toBe(0)
  })

  it('resolvePose 的生活姿勢帶出 lift', () => {
    expect(resolvePose({ event: NO_EVENT, life: sit(sofaSeat(2).at), home, atSeat: true, emote: null }).lift).toBe(
      SOFA_LIFT,
    )
  })
})
