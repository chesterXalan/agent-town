// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CAKE_SECS,
  createEventQueue,
  enqueueEvents,
  recallToSeat,
  tickEventQueue,
  type EventPose,
  type OfficeLocator,
} from './eventQueue'
import { COMMONS, DOOR, type Vec3 } from './layout'

const seats: Record<string, Vec3> = { R: [0, 0, 0], E: [4, 0, 0], Q: [0, 0, 2], N: [8, 0, 0] }
const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
/** 經 z=2 走道的 L 形（相鄰重複點去掉） */
function lRoute(a: Vec3, b: Vec3): Vec3[] {
  const pts: Vec3[] = [a, [a[0], 0, 2], [b[0], 0, 2], b]
  return pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]))
}
/** 生活行程中的位置；沒設就是座位 */
const lifeAt: Record<string, Vec3> = {}
const loc: OfficeLocator = {
  seatOf: (id) => seats[id] ?? null,
  route: lRoute,
  reviewSpot: (id) => (seats[id] ? [seats[id][0] + 1, 0, seats[id][2]] : null),
  patrolRoute: () => [
    [1, 0, 3],
    [3, 0, 3],
  ],
  currentOf: (id) => lifeAt[id] ?? seats[id] ?? null,
  idleIds: () => [],
  membersOf: () => [],
  meetingSpot: () => [0, 0, 0],
  cakeSpot: () => [0, 0, 0],
}
const pose = (o: Partial<EventPose>): EventPose => ({
  position: null,
  anim: null,
  facing: null,
  emote: null,
  carry: null,
  ...o,
})
const ticks = (q: ReturnType<typeof createEventQueue>, n: number) => {
  for (let i = 0; i < n; i++) tickEventQueue(q, 0.1)
}
const start = { kind: 'review-start', reviewerId: 'R', targetId: 'E' } as const

describe('eventQueue', () => {
  it('排入走動 → 該 agent leave → 不再 animating', () => {
    const q = createEventQueue()
    expect(enqueueEvents(q, [start], loc)).toBe(true)
    tickEventQueue(q, 0.05)
    expect(q.poses.get('R')?.anim).toBe('walk')
    expect(enqueueEvents(q, [{ kind: 'leave', id: 'R' }], loc)).toBe(false)
    expect(q.poses.has('R')).toBe(false)
  })

  it('reviewer 走到 target 桌邊停留後回座，播完結束', () => {
    const q = createEventQueue()
    enqueueEvents(q, [start], loc)
    // 去程 2 + 5 + 2 = 9 單位，速度 2 → 4.5 秒；再過一點進入停留
    for (let i = 0; i < 46; i++) tickEventQueue(q, 0.1)
    expect(q.poses.get('R')).toEqual(pose({ position: [5, 0, 0] }))
    let busy = true
    for (let i = 0; i < 200 && busy; i++) busy = tickEventQueue(q, 0.1)
    expect(busy).toBe(false)
    expect(q.poses.has('R')).toBe(false)
  })

  it('同一 agent 後到的動畫排隊；沒有去程時 reviewer 先走過去，target 等到才 cheer／slump', () => {
    const q = createEventQueue()
    enqueueEvents(
      q,
      [
        { kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'pass' },
        { kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'fail' },
      ],
      loc,
    )
    // reviewer 去程 4.5 秒 → cheer 2 秒 → 回程 4.5 秒；第二段再去程 4.5 秒（第 15.5 秒到）
    ticks(q, 44)
    expect(q.poses.get('E')?.anim).toBeNull()
    ticks(q, 2)
    expect(q.poses.get('E')?.anim).toBe('cheer')
    expect(q.poses.get('R')?.anim).toBe('cheer')
    ticks(q, 108)
    expect(q.poses.get('E')?.anim).toBeNull()
    ticks(q, 2)
    expect(q.poses.get('E')?.anim).toBe('slump')
    expect(q.poses.get('R')?.carry).toBe('clipboard')
  })

  it('review-start 與 review-end 同批：target 等 reviewer 走到桌邊才 cheer', () => {
    const q = createEventQueue()
    enqueueEvents(q, [start, { kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'pass' }], loc)
    // 去程 4.5 秒：走到之前 target 不動作
    for (let i = 0; i < 44; i++) tickEventQueue(q, 0.1)
    expect(q.poses.get('R')?.anim).toBe('walk')
    expect(q.poses.get('E')).toEqual(pose({}))
    for (let i = 0; i < 2; i++) tickEventQueue(q, 0.1)
    expect(q.poses.get('R')).toMatchObject({ position: [5, 0, 0], anim: 'cheer' })
    expect(q.poses.get('E')?.anim).toBe('cheer')
  })

  it('review-end 晚一批到、reviewer 已走了一段：只等剩下的路程', () => {
    const q = createEventQueue()
    enqueueEvents(q, [start], loc)
    for (let i = 0; i < 30; i++) tickEventQueue(q, 0.1)
    enqueueEvents(q, [{ kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'fail' }], loc)
    for (let i = 0; i < 14; i++) tickEventQueue(q, 0.1)
    expect(q.poses.get('E')?.anim).toBeNull()
    for (let i = 0; i < 2; i++) tickEventQueue(q, 0.1)
    expect(q.poses.get('E')?.anim).toBe('slump')
  })

  it('reviewer 已到桌邊或沒有去程：review-end 立刻播', () => {
    const q = createEventQueue()
    enqueueEvents(q, [start], loc)
    for (let i = 0; i < 46; i++) tickEventQueue(q, 0.1)
    enqueueEvents(q, [{ kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'pass' }], loc)
    tickEventQueue(q, 0.05)
    expect(q.poses.get('E')?.anim).toBe('cheer')
  })

  it('fixer-enter 從門口走到座位，播完結束', () => {
    const q = createEventQueue()
    expect(enqueueEvents(q, [{ kind: 'fixer-enter', id: 'E' }], loc)).toBe(true)
    tickEventQueue(q, 0.05)
    expect(q.poses.get('E')?.anim).toBe('walk')
    let busy = true
    for (let i = 0; i < 1000 && busy; i++) busy = tickEventQueue(q, 0.1)
    expect(busy).toBe(false)
  })

  it('enter 沒座位、blocked 沒人可參加：不排動畫', () => {
    const q = createEventQueue()
    expect(
      enqueueEvents(
        q,
        [
          { kind: 'enter', id: 'X' },
          { kind: 'blocked', slug: 'p' },
        ],
        loc,
      ),
    ).toBe(false)
  })

  it('review-end pass：reviewer 與 target 面對面同時 cheer，target 帶 heart', () => {
    const q = createEventQueue()
    enqueueEvents(q, [start, { kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'pass' }], loc)
    ticks(q, 46)
    const r = q.poses.get('R')!
    const e = q.poses.get('E')!
    expect(r).toMatchObject({ position: [5, 0, 0], anim: 'cheer', carry: null })
    expect(e).toMatchObject({ position: null, anim: 'cheer', emote: 'heart' })
    // reviewer 在 target 東側：reviewer 面西、target 面東
    expect(r.facing).toBeCloseTo(-Math.PI / 2)
    expect(e.facing).toBeCloseTo(Math.PI / 2)
    // 擊掌 2 秒後 reviewer 回程
    ticks(q, 21)
    expect(q.poses.get('R')?.anim).toBe('walk')
    expect(q.poses.has('E')).toBe(false)
  })

  it('review-end fail：reviewer 拿 clipboard 站在 target 旁，target slump＋angry', () => {
    const q = createEventQueue()
    enqueueEvents(q, [start], loc)
    ticks(q, 46)
    enqueueEvents(q, [{ kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'fail' }], loc)
    tickEventQueue(q, 0.05)
    expect(q.poses.get('R')).toMatchObject({ position: [5, 0, 0], anim: null, carry: 'clipboard' })
    expect(q.poses.get('E')).toMatchObject({ anim: 'slump', emote: 'angry' })
  })

  it('currentOf 不在座位（生活行程中）：review-start 從該點出發、直接回座位', () => {
    lifeAt.R = [2, 0, 6]
    try {
      const q = createEventQueue()
      enqueueEvents(q, [start], loc)
      const steps = q.queues.get('R')![0].steps
      expect(steps[0]).toMatchObject({ kind: 'move' })
      if (steps[0].kind !== 'move' || steps[2].kind !== 'move') throw new Error('not move')
      expect(steps[0].path[0]).toEqual([2, 0, 6])
      expect(steps[2].path[steps[2].path.length - 1]).toEqual(seats.R)
    } finally {
      delete lifeAt.R
    }
  })

  it('連兩段 review-start／qa-patrol：後一段從前一段終點（座位）出發，不瞬移', () => {
    lifeAt.R = [2, 0, 6]
    try {
      const q = createEventQueue()
      enqueueEvents(q, [start], loc)
      // 事件接手後生活行程清掉，currentOf 回座位
      delete lifeAt.R
      lifeAt.R = [6, 0, 6]
      enqueueEvents(
        q,
        [
          { kind: 'review-start', reviewerId: 'R', targetId: 'Q' },
          { kind: 'qa-patrol', qaId: 'R', slug: 'p' },
        ],
        loc,
      )
      const runs = q.queues.get('R')!
      expect(runs).toHaveLength(3)
      const ends = runs.map((r) => {
        const first = r.steps[0]
        const last = r.steps.at(-1)!
        if (first.kind !== 'move' || last.kind !== 'move') throw new Error('not move')
        return [first.path[0], last.path.at(-1)]
      })
      expect(ends[0]).toEqual([[2, 0, 6], seats.R])
      expect(ends[1]).toEqual([seats.R, seats.R])
      expect(ends[2]).toEqual([seats.R, seats.R])
    } finally {
      delete lifeAt.R
    }
  })

  it('target 不在座位：先從目前位置走回座位，再等 reviewer、播 cheer', () => {
    lifeAt.E = [4, 0, 6]
    try {
      const q = createEventQueue()
      enqueueEvents(q, [start, { kind: 'review-end', reviewerId: 'R', targetId: 'E', outcome: 'pass' }], loc)
      const steps = q.queues.get('E')![0].steps
      if (steps[0].kind !== 'move') throw new Error('not move')
      expect(steps[0].path[0]).toEqual([4, 0, 6])
      expect(steps[0].path[steps[0].path.length - 1]).toEqual([4, 0, 0])
      // 回座 6 單位 3 秒 < reviewer 去程 4.5 秒：同時到
      ticks(q, 46)
      expect(q.poses.get('E')?.anim).toBe('cheer')
      expect(q.poses.get('R')?.anim).toBe('cheer')
    } finally {
      delete lifeAt.E
    }
  })

  describe('plan-complete 切蛋糕', () => {
    const done = (slug = 'p1') => ({ kind: 'plan-complete', slug }) as const
    const cakeLoc = (idle: string[]): OfficeLocator => ({
      ...loc,
      idleIds: () => idle,
      cakeSpot: (k) => [20 + k, 0, 20],
    })

    it('無 idle：只有蛋糕、queues 為空，仍算動畫中；tick 20 秒後蛋糕清空', () => {
      const q = createEventQueue()
      expect(enqueueEvents(q, [done()], cakeLoc([]))).toBe(true)
      expect(q.cakes).toEqual([{ slug: 'p1', left: CAKE_SECS }])
      expect(q.queues.size).toBe(0)
      ticks(q, 100)
      expect(q.cakes).toHaveLength(1)
      expect(q.cakes[0].left).toBeCloseTo(CAKE_SECS - 10)
      ticks(q, 99)
      expect(tickEventQueue(q, 0.1)).toBe(false)
      expect(q.cakes).toEqual([])
    })

    it('兩個 plan-complete 連續到：仍 1 個蛋糕、倒數重設', () => {
      const q = createEventQueue()
      enqueueEvents(q, [done('p1')], cakeLoc([]))
      ticks(q, 50)
      enqueueEvents(q, [done('p2')], cakeLoc([]))
      expect(q.cakes).toEqual([{ slug: 'p2', left: CAKE_SECS }])
      enqueueEvents(q, [done('p3'), done('p4')], cakeLoc([]))
      expect(q.cakes).toHaveLength(1)
    })

    it('idle 3 人各走到不同 cakeSpot：cheer 2 秒帶 heart，停到蛋糕剩 2 秒時走回', () => {
      const q = createEventQueue()
      enqueueEvents(q, [done()], { ...cakeLoc(['R', 'E', 'Q']), cakeSpot: (k) => [k, 0, 4] })
      expect([...q.queues.keys()].sort()).toEqual(['E', 'Q', 'R'])
      const dests = ['R', 'E', 'Q'].map((id) => {
        const steps = q.queues.get(id)![0].steps
        if (steps[0].kind !== 'move' || steps.at(-1)!.kind !== 'move') throw new Error('not move')
        expect(steps[0].path[0]).toEqual(seats[id])
        const back = steps.at(-1)!
        if (back.kind === 'move') expect(back.path.at(-1)).toEqual(seats[id])
        expect(steps[1]).toMatchObject({ kind: 'stay', anim: 'cheer', secs: 2, emote: 'heart' })
        return steps[0].path.at(-1)
      })
      expect(dests).toEqual([
        [0, 0, 4],
        [1, 0, 4],
        [2, 0, 4],
      ])
      // 停留長度：換成 cakeSpot 在旁邊
      const q2 = createEventQueue()
      enqueueEvents(q2, [done()], { ...cakeLoc(['E']), cakeSpot: () => [4, 0, 2] })
      // 去程 2 單位 1 秒 → cheer 2 秒 → 停 15 秒（共 18 秒＝蛋糕剩 2 秒）→ 走回
      ticks(q2, 179)
      expect(q2.poses.get('E')).toMatchObject({ position: [4, 0, 2], anim: null })
      ticks(q2, 2)
      expect(q2.poses.get('E')?.anim).toBe('walk')
      expect(q2.cakes[0].left).toBeCloseTo(CAKE_SECS - 18.1)
    })

    it('蛋糕倒數重設：已在蛋糕旁的人延長停留，新 idle 的人站下一個 cakeSpot', () => {
      const q = createEventQueue()
      const l = (idle: string[]): OfficeLocator => ({ ...cakeLoc(idle), cakeSpot: (k) => [4 + k, 0, 2] })
      enqueueEvents(q, [done('p1')], l(['E']))
      ticks(q, 100)
      // 10 秒後第二個 plan 完成：E 不再 idle（在佇列中），Q 新加入
      enqueueEvents(q, [done('p2')], l(['Q']))
      const qGo = q.queues.get('Q')![0].steps[0]
      if (qGo.kind !== 'move') throw new Error('not move')
      expect(qGo.path.at(-1)).toEqual([5, 0, 2])
      // E 原本第 18 秒走回，現在要停到 10 + 18 = 28 秒
      ticks(q, 179)
      expect(q.poses.get('E')).toMatchObject({ position: [4, 0, 2], anim: null })
      ticks(q, 2)
      expect(q.poses.get('E')?.anim).toBe('walk')
    })

    it('去程＋cheer 趕不上蛋糕（超過剩 2 秒）的人不排、也不佔 cakeSpot', () => {
      lifeAt.R = [40, 0, 40]
      try {
        const q = createEventQueue()
        // R 去程 38+36=74 單位 37 秒 > 16 秒；E 去程 2 單位 1 秒
        enqueueEvents(q, [done()], { ...cakeLoc(['R', 'E']), cakeSpot: (k) => [4 + k, 0, 2] })
        expect([...q.queues.keys()]).toEqual(['E'])
        const go = q.queues.get('E')![0].steps[0]
        if (go.kind !== 'move') throw new Error('not move')
        expect(go.path.at(-1)).toEqual([4, 0, 2])
      } finally {
        delete lifeAt.R
      }
    })

    it('倒數重設：在場者佔 0 號與 2 號（1 號離開）→ 新人取 1 號', () => {
      const q = createEventQueue()
      const l = (idle: string[]): OfficeLocator => ({ ...cakeLoc(idle), cakeSpot: (k) => [4 + k, 0, 2] })
      enqueueEvents(q, [done('p1')], l(['R', 'E', 'N']))
      ticks(q, 50)
      enqueueEvents(q, [{ kind: 'leave', id: 'E' }, done('p2')], l(['Q']))
      const go = q.queues.get('Q')![0].steps[0]
      if (go.kind !== 'move') throw new Error('not move')
      expect(go.path.at(-1)).toEqual([5, 0, 2])
    })

    it('蛋糕途中某成員 leave：只有他的佇列消失，蛋糕與其他人照常', () => {
      const q = createEventQueue()
      const l = cakeLoc(['R', 'E'])
      enqueueEvents(q, [done()], { ...l, cakeSpot: (k) => [4 + k, 0, 2] })
      ticks(q, 30)
      const before = structuredClone(q.queues.get('R'))
      enqueueEvents(q, [{ kind: 'leave', id: 'E' }], l)
      expect(q.queues.has('E')).toBe(false)
      expect(q.poses.has('E')).toBe(false)
      expect(q.queues.get('R')).toEqual(before)
      expect(q.cakes).toHaveLength(1)
      expect(q.cakes[0].slug).toBe('p1')
    })

    it('參與者已有排隊的劇情：從佇列終點出發', () => {
      lifeAt.R = [2, 0, 6]
      try {
        const q = createEventQueue()
        // review-start 從 [2,0,6] 出發、回座位，共 11 秒；之後去 cakeSpot 3 單位 1.5 秒＋cheer 2 秒，趕得上
        enqueueEvents(q, [start, done()], { ...cakeLoc(['R']), cakeSpot: () => [0, 0, 3] })
        const runs = q.queues.get('R')!
        expect(runs).toHaveLength(2)
        const go = runs[1].steps[0]
        if (go.kind !== 'move') throw new Error('not move')
        expect(go.path[0]).toEqual(seats.R)
      } finally {
        delete lifeAt.R
      }
    })
  })

  describe('blocked 開會', () => {
    const meetLoc = (idle: string[]): OfficeLocator => ({
      ...loc,
      membersOf: (slug) => (slug === 'p' ? ['R', 'E', 'Q'] : []),
      idleIds: () => idle,
      meetingSpot: (k) => [10 + k, 0, -10],
    })
    const meetStay = (q: ReturnType<typeof createEventQueue>, id: string) => {
      const steps = q.queues.get(id)![0].steps
      return steps.find((st) => st.kind === 'stay')
    }

    it('3 位成員中 2 位 idle：只有那 2 位走到 meetingSpot(0)、(1)，停 8 秒面向會議桌後走回', () => {
      const q = createEventQueue()
      expect(enqueueEvents(q, [{ kind: 'blocked', slug: 'p' }], meetLoc(['E', 'Q', 'X']))).toBe(true)
      expect([...q.queues.keys()].sort()).toEqual(['E', 'Q'])
      const e = meetStay(q, 'E')
      expect(e).toMatchObject({ kind: 'stay', at: [10, 0, -10], secs: 8 })
      expect(meetStay(q, 'Q')).toMatchObject({ at: [11, 0, -10], secs: 8 })
      if (e?.kind !== 'stay') throw new Error('not stay')
      expect(e.facing).toBeCloseTo(Math.atan2(COMMONS.meeting[0] - 10, COMMONS.meeting[2] + 10))
      const steps = q.queues.get('E')![0].steps
      if (steps[0].kind !== 'move' || steps[2].kind !== 'move') throw new Error('not move')
      expect(steps[0].path[0]).toEqual(seats.E)
      expect(steps[2].path.at(-1)).toEqual(seats.E)
    })

    it('其他 plan 有 7 個 idle 排在前面：blocked 的成員仍能開會（idleIds 限定成員再取上限）', () => {
      const others = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7']
      const q = createEventQueue()
      enqueueEvents(q, [{ kind: 'blocked', slug: 'p' }], {
        ...meetLoc([]),
        idleIds: (among) => [...others, 'E', 'Q'].filter((id) => !among || among.includes(id)).slice(0, 6),
      })
      expect([...q.queues.keys()].sort()).toEqual(['E', 'Q'])
    })

    it('成員全部在工作：沒有任何佇列', () => {
      const q = createEventQueue()
      expect(enqueueEvents(q, [{ kind: 'blocked', slug: 'p' }], meetLoc([]))).toBe(false)
      expect(q.queues.size).toBe(0)
    })

    it('開會途中某成員 leave：只有他的佇列消失', () => {
      const q = createEventQueue()
      const l = meetLoc(['E', 'Q'])
      enqueueEvents(q, [{ kind: 'blocked', slug: 'p' }], l)
      ticks(q, 3)
      enqueueEvents(q, [{ kind: 'leave', id: 'E' }], l)
      expect(q.queues.has('E')).toBe(false)
      expect(q.poses.has('E')).toBe(false)
      expect(q.queues.has('Q')).toBe(true)
    })

    it('成員已有排隊的劇情：開會從佇列終點出發', () => {
      lifeAt.R = [2, 0, 6]
      try {
        const q = createEventQueue()
        enqueueEvents(q, [start, { kind: 'blocked', slug: 'p' }], meetLoc(['R']))
        const runs = q.queues.get('R')!
        expect(runs).toHaveLength(2)
        const go = runs[1].steps[0]
        if (go.kind !== 'move') throw new Error('not move')
        // review-start 回程終點是座位（不是生活位置 [2,0,6]）
        expect(go.path[0]).toEqual(seats.R)
      } finally {
        delete lifeAt.R
      }
    })
  })

  describe('enter 迎新', () => {
    const enterN = { kind: 'enter', id: 'N' } as const
    const welcomeLoc = (idle: string[]): OfficeLocator => ({ ...loc, idleIds: () => idle })

    it('兩位 idle：只有離 DOOR 近的那位接待（走到門邊 wave 1 秒 → 走到新人座位旁 → 走回）', () => {
      const q = createEventQueue()
      // Q [0,0,2] 比 E [4,0,0] 近 DOOR
      enqueueEvents(q, [enterN], welcomeLoc(['E', 'Q', 'N']))
      expect(q.queues.has('E')).toBe(false)
      expect(q.queues.has('N')).toBe(true)
      const steps = q.queues.get('Q')![0].steps
      expect(steps.map((st) => st.kind)).toEqual(['move', 'stay', 'move', 'move'])
      expect(steps[1]).toMatchObject({ anim: 'wave', secs: 1 })
      if (steps[0].kind !== 'move' || steps[2].kind !== 'move' || steps[3].kind !== 'move') throw new Error('not move')
      expect(steps[0].path[0]).toEqual(seats.Q)
      expect(steps[2].path.at(-1)).toEqual(loc.reviewSpot('N'))
      expect(steps[3].path.at(-1)).toEqual(seats.Q)
    })

    it('新 agent 在門口等接待者 wave 完才一起走向座位', () => {
      const q = createEventQueue()
      enqueueEvents(q, [enterN], welcomeLoc(['Q']))
      const own = q.queues.get('N')![0].steps
      expect(own[0]).toMatchObject({ kind: 'stay', at: DOOR })
      const last = own.at(-1)!
      if (last.kind !== 'move') throw new Error('not move')
      expect(last.path[0]).toEqual(DOOR)
      expect(last.path.at(-1)).toEqual(seats.N)
      // 接待者走到門邊前新人不走
      tickEventQueue(q, 0.05)
      expect(q.poses.get('N')).toMatchObject({ position: DOOR, anim: null })
      // 接待者 wave 時新人仍在門口；wave 結束兩人都在走
      let waving = false
      for (let i = 0; i < 500 && !waving; i++) {
        tickEventQueue(q, 0.1)
        waving = q.poses.get('Q')?.anim === 'wave'
      }
      expect(waving).toBe(true)
      expect(q.poses.get('N')?.position).toEqual(DOOR)
      ticks(q, 11)
      expect(q.poses.get('Q')?.anim).toBe('walk')
      expect(q.poses.get('N')?.anim).toBe('walk')
    })

    it('沒有 idle：只有新 agent 自己從 DOOR 走到座位', () => {
      const q = createEventQueue()
      expect(enqueueEvents(q, [enterN], welcomeLoc([]))).toBe(true)
      expect([...q.queues.keys()]).toEqual(['N'])
      const steps = q.queues.get('N')![0].steps
      expect(steps).toHaveLength(1)
      if (steps[0].kind !== 'move') throw new Error('not move')
      expect(steps[0].path[0]).toEqual(DOOR)
      expect(steps[0].path.at(-1)).toEqual(seats.N)
    })
  })

  describe('recallToSeat 被動參與者轉工作中', () => {
    const meetLoc: OfficeLocator = {
      ...loc,
      membersOf: () => ['E', 'Q'],
      idleIds: () => ['E', 'Q'],
      meetingSpot: (k) => [10 + k, 0, -10],
    }
    const onlyMove = (q: ReturnType<typeof createEventQueue>, id: string) => {
      const runs = q.queues.get(id)!
      expect(runs).toHaveLength(1)
      expect(runs[0].passive).toBeFalsy()
      expect(runs[0].steps).toHaveLength(1)
      const st = runs[0].steps[0]
      if (st.kind !== 'move') throw new Error('not move')
      return st.path
    }

    it('開會停留中被召回：只剩一段從當下位置走回座位，其他成員照常', () => {
      const q = createEventQueue()
      enqueueEvents(q, [{ kind: 'blocked', slug: 'p' }], meetLoc)
      // E 去程 2+6+12=20 單位 10 秒；11 秒時在 meetingSpot(0) 停留
      ticks(q, 110)
      const qBefore = structuredClone(q.queues.get('Q'))
      expect(recallToSeat(q, ['E'], meetLoc)).toBe(true)
      const path = onlyMove(q, 'E')
      expect(path[0]).toEqual([10, 0, -10])
      expect(path.at(-1)).toEqual(seats.E)
      expect(q.queues.get('Q')).toEqual(qBefore)
    })

    it('走在路上被召回：從當下的走路位置出發', () => {
      const q = createEventQueue()
      enqueueEvents(q, [{ kind: 'blocked', slug: 'p' }], meetLoc)
      ticks(q, 2)
      const at = q.poses.get('E')!.position!
      recallToSeat(q, ['E'], meetLoc)
      expect(onlyMove(q, 'E')[0]).toEqual(at)
    })

    it('蛋糕圍觀者被召回：蛋糕仍在、其他圍觀者照常', () => {
      const q = createEventQueue()
      const l: OfficeLocator = { ...loc, idleIds: () => ['R', 'E'], cakeSpot: (k) => [4 + k, 0, 2] }
      enqueueEvents(q, [{ kind: 'plan-complete', slug: 'p1' }], l)
      ticks(q, 50)
      const rBefore = structuredClone(q.queues.get('R'))
      expect(recallToSeat(q, ['E'], l)).toBe(true)
      expect(onlyMove(q, 'E').at(-1)).toEqual(seats.E)
      expect(q.queues.get('R')).toEqual(rBefore)
      expect(q.cakes).toHaveLength(1)
    })

    it('迎新接待者被召回：新人仍走到座位', () => {
      const q = createEventQueue()
      const l: OfficeLocator = { ...loc, idleIds: () => ['Q'] }
      enqueueEvents(q, [{ kind: 'enter', id: 'N' }], l)
      ticks(q, 3)
      recallToSeat(q, ['Q'], l)
      expect(onlyMove(q, 'Q').at(-1)).toEqual(seats.Q)
      const own = q.queues.get('N')![0].steps
      const last = own.at(-1)!
      if (last.kind !== 'move') throw new Error('not move')
      expect(last.path.at(-1)).toEqual(seats.N)
      let seen: Vec3 = DOOR
      for (let i = 0; i < 1000 && q.queues.has('N'); i++) {
        tickEventQueue(q, 0.1)
        seen = q.poses.get('N')?.position ?? seen
      }
      expect(q.queues.has('N')).toBe(false)
      seen.forEach((v, i) => expect(v).toBeCloseTo(seats.N[i], 0))
    })

    it('主角（review-start 的 reviewer）不受影響；排在後面的被動劇情丟掉', () => {
      const q = createEventQueue()
      enqueueEvents(q, [start, { kind: 'blocked', slug: 'p' }], {
        ...meetLoc,
        membersOf: () => ['R'],
        idleIds: () => ['R'],
      })
      expect(q.queues.get('R')).toHaveLength(2)
      ticks(q, 5)
      const first = structuredClone(q.queues.get('R')![0])
      recallToSeat(q, ['R'], meetLoc)
      expect(q.queues.get('R')).toEqual([first])
    })

    it('不在佇列或已在座位：沒有動畫就回 false', () => {
      const q = createEventQueue()
      expect(recallToSeat(q, ['E'], meetLoc)).toBe(false)
      expect(q.queues.size).toBe(0)
    })
  })
})
