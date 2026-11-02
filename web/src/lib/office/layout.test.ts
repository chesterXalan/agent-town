// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OfficeAgent } from '../../../../shared/api'
import { OFFICE_DEPTS, type OfficeDept } from '../../../../shared/office'
import {
  assignSeats,
  ATRIUM_SOFAS,
  COMMONS,
  CORNER_ROOMS,
  deptLabelPos,
  deptZone,
  DOOR,
  groupCenter,
  HALF,
  LOBBY,
  MANAGER_OFFICE,
  pantrySpot,
  PLAN_SCREEN_DZ,
  planScreenPosition,
  reviewSpot,
  RING_IN,
  seatFacing,
  seatPosition,
  TREE_R,
  zoneYaw,
  type CommonKey,
  type Seat,
  type SeatMap,
  type Vec3,
} from './layout'

function agent(id: string, o: Partial<OfficeAgent> = {}): OfficeAgent {
  return {
    id,
    kind: 'subagent',
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

const key = (v: number[]) => v.join(',')

describe('assignSeats', () => {
  it('加入、離開時其他人 index 不變，新人補最小空位', () => {
    const s1 = assignSeats(new Map(), [agent('A'), agent('B')])
    const s2 = assignSeats(s1, [agent('A'), agent('B'), agent('C')])
    expect(s2.get('A')!.index).toBe(s1.get('A')!.index)
    expect(s2.get('B')!.index).toBe(s1.get('B')!.index)
    const bIndex = s2.get('B')!.index
    const s3 = assignSeats(s2, [agent('A'), agent('C')])
    expect(s3.has('B')).toBe(false)
    expect(s3.get('A')!.index).toBe(s1.get('A')!.index)
    const s4 = assignSeats(s3, [agent('A'), agent('C'), agent('D')])
    expect(s4.get('D')!.index).toBe(bIndex)
    expect(s4.get('C')!.index).toBe(s2.get('C')!.index)
  })
  it('同一 plan 的 agent 在同一 group；manager 與散座分開', () => {
    const s = assignSeats(new Map(), [
      agent('p1', { slug: 'plan-a', kind: 'session', job: 'lead' }),
      agent('p2', { slug: 'plan-a' }),
      agent('m', { kind: 'session', job: 'manager' }),
      agent('d'),
    ])
    expect(s.get('p1')!.group).toBe('plan-a')
    expect(s.get('p2')!.group).toBe('plan-a')
    expect(s.get('p1')!.index).not.toBe(s.get('p2')!.index)
    expect(s.get('m')!.group).toBe('manager')
    expect(s.get('d')!.group).toBe('desks')
  })
})

describe('assignSeats 桌號', () => {
  const plan = (id: string, slug: string, dept: OfficeDept = 'north-west') => agent(id, { slug, dept })
  it('同部門兩份 plan 一定不同桌、中心不同；非 plan group 桌號 0', () => {
    const s = assignSeats(new Map(), [plan('a', 'plan-0'), plan('b', 'plan-1'), agent('d')])
    expect(s.get('a')!.table).not.toBe(s.get('b')!.table)
    expect(key(groupCenter('north-west', 'plan-0', s.get('a')!.table))).not.toBe(
      key(groupCenter('north-west', 'plan-1', s.get('b')!.table)),
    )
    expect(s.get('d')!.table).toBe(0)
  })
  it('別的 plan 加入／離開時桌號不變；成員全走才釋出', () => {
    const s1 = assignSeats(new Map(), [plan('a', 'p1'), plan('b', 'p2')])
    const s2 = assignSeats(s1, [plan('a', 'p1'), plan('b', 'p2'), plan('c', 'p3')])
    expect(s2.get('a')!.table).toBe(s1.get('a')!.table)
    expect(s2.get('b')!.table).toBe(s1.get('b')!.table)
    const s3 = assignSeats(s2, [plan('b', 'p2'), plan('c', 'p3')])
    expect(s3.get('b')!.table).toBe(s1.get('b')!.table)
    expect(s3.get('c')!.table).toBe(s2.get('c')!.table)
    const s4 = assignSeats(s3, [plan('b', 'p2'), plan('c', 'p3'), plan('e', 'p4')])
    expect(s4.get('e')!.table).toBe(s1.get('a')!.table)
  })
  it('同 plan 換人但仍有成員時保留桌號', () => {
    const s1 = assignSeats(new Map(), [plan('x', 'p0'), plan('a', 'p1'), plan('b', 'p1')])
    const s2 = assignSeats(s1, [plan('x', 'p0'), plan('b', 'p1'), plan('c', 'p1')])
    expect(s2.get('c')!.table).toBe(s1.get('a')!.table)
  })
  it('一個部門 8 份 plan 加散座與 manager，座位不重疊', () => {
    const agents: OfficeAgent[] = []
    for (let p = 0; p < 8; p++) for (let n = 0; n < 7; n++) agents.push(plan(`p${p}-${n}`, `plan-${p}`, 'east-south'))
    for (let n = 0; n < 13; n++) agents.push(agent(`d${n}`, { dept: 'east-south' }))
    for (let n = 0; n < 4; n++) agents.push(agent(`m${n}`, { dept: 'east-south', kind: 'session', job: 'manager' }))
    const s = assignSeats(new Map(), agents)
    expect(new Set([...s.values()].map((v) => key(seatPosition(v)))).size).toBe(agents.length)
    expect(new Set([...s.values()].filter((v) => v.group.startsWith('plan-')).map((v) => v.table)).size).toBe(8)
  })
})

const DEPTS: OfficeDept[] = [...OFFICE_DEPTS, 'west-south']
type Rect = { x0: number; z0: number; x1: number; z1: number }
const inRect = (p: Vec3, r: Rect) => p[0] >= r.x0 && p[0] <= r.x1 && p[2] >= r.z0 && p[2] <= r.z1
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2])
/** 世界座標 → 該部門區的 (a, d) */
function local(dept: OfficeDept, p: Vec3): { a: number; d: number } {
  const { base, n, u } = deptZone(dept)
  const dx = p[0] - base[0]
  const dz = p[2] - base[2]
  return { a: dx * u[0] + dz * u[1], d: dx * n[0] + dz * n[1] }
}
const forward = (theta: number): [number, number] => [-Math.sin(theta), -Math.cos(theta)]
const desk = (dept: OfficeDept, index: number): Seat => ({ dept, group: 'desks', table: 0, index })
const mgr = (dept: OfficeDept, index: number): Seat => ({ dept, group: 'manager', table: 0, index })
const planSeat = (dept: OfficeDept, table: number, index: number): Seat => ({
  dept,
  group: `plan-${table}`,
  table,
  index,
})

describe('seatPosition', () => {
  it('六部門 desks／plan／manager 座位都落在自己區內（d∈[0,11]、|a|≤6.5）', () => {
    for (const dept of DEPTS) {
      const seats: Seat[] = []
      for (let i = 0; i < 9; i++) seats.push(desk(dept, i))
      for (let t = 0; t < 4; t++) for (let i = 0; i < 6; i++) seats.push(planSeat(dept, t, i))
      for (let i = 0; i < 3; i++) seats.push(mgr(dept, i))
      for (const s of seats) {
        const { a, d } = local(dept, seatPosition(s))
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(11)
        expect(Math.abs(a)).toBeLessThanOrEqual(6.5)
      }
    }
  })
  it('單部門 20 散座＋8 份 plan×6 人＋3 manager：位置兩兩不同、全部 d ≤ 11', () => {
    const seats: Seat[] = []
    for (let i = 0; i < 20; i++) seats.push(desk('east-south', i))
    for (let t = 0; t < 8; t++) for (let i = 0; i < 6; i++) seats.push(planSeat('east-south', t, i))
    for (let i = 0; i < 3; i++) seats.push(mgr('east-south', i))
    const pos = seats.map(seatPosition)
    expect(new Set(pos.map(key)).size).toBe(seats.length)
    for (const p of pos) expect(local('east-south', p).d).toBeLessThanOrEqual(11)
  })
  it('30 個 agent 跨部門，位置兩兩不同', () => {
    const agents: OfficeAgent[] = []
    for (let i = 0; i < 30; i++) {
      const dept = DEPTS[i % DEPTS.length]
      const kind = i % 3
      agents.push(
        kind === 0
          ? agent(`a${i}`, { dept })
          : kind === 1
            ? agent(`a${i}`, { dept, slug: `plan-${i % 2}` })
            : agent(`a${i}`, { dept, kind: 'session', job: 'manager' }),
      )
    }
    const seats: SeatMap = assignSeats(new Map(), agents)
    const pos = [...seats.values()].map((s) => key(seatPosition(s)))
    expect(new Set(pos).size).toBe(30)
  })
})

describe('seatFacing／zoneYaw', () => {
  it('散座與 manager 面向窗：seatFacing 的前方向量 = n', () => {
    for (const dept of DEPTS) {
      const { n } = deptZone(dept)
      for (const s of [desk(dept, 0), desk(dept, 7), mgr(dept, 1)]) {
        const [fx, fz] = forward(seatFacing(s))
        expect(fx).toBeCloseTo(n[0])
        expect(fz).toBeCloseTo(n[1])
      }
    }
  })
  it('北翼散座 seatFacing = 0；zoneYaw：tenant 0、retail -π/2、other π/2', () => {
    expect(seatFacing(desk('north-west', 0))).toBeCloseTo(0)
    expect(zoneYaw('north-west')).toBeCloseTo(0)
    expect(zoneYaw('east-south')).toBeCloseTo(-Math.PI / 2)
    expect(zoneYaw('west-south')).toBeCloseTo(Math.PI / 2)
  })
  it('plan 成員面向桌心', () => {
    for (const dept of DEPTS) {
      const { n } = deptZone(dept)
      for (let i = 0; i < 7; i++) {
        const s = planSeat(dept, 1, i)
        const p = seatPosition(s)
        const c = groupCenter(dept, s.group, s.table)
        const [fx, fz] = forward(seatFacing(s))
        // 垂直桌緣：前方向量 = ±n，且指向桌心那側
        expect(Math.abs(fx * n[0] + fz * n[1])).toBeCloseTo(1)
        expect(fx * (c[0] - p[0]) + fz * (c[2] - p[2])).toBeGreaterThan(0)
      }
    }
  })
  it('reviewSpot 沿 u 偏 1：東翼 retail 座位只差 z', () => {
    const s = seatPosition(desk('east-south', 4))
    const r = reviewSpot(desk('east-south', 4))
    expect(r[0]).toBeCloseTo(s[0])
    expect(r[2] - s[2]).toBeCloseTo(1)
  })
})

describe('reviewSpot 範圍', () => {
  it('所有座位的 reviewSpot 都不在角落房間內，且 |a| ≤ 6.5', () => {
    const rooms = Object.values(CORNER_ROOMS)
    for (const dept of DEPTS) {
      const seats: Seat[] = []
      for (let i = 0; i < 9; i++) seats.push(desk(dept, i))
      for (let t = 0; t < 8; t++) for (let i = 0; i < 6; i++) seats.push(planSeat(dept, t, i))
      for (let i = 0; i < 3; i++) seats.push(mgr(dept, i))
      for (const s of seats) {
        const r = reviewSpot(s)
        expect(
          rooms.some((room) => inRect(r, room)),
          `${dept} ${s.group} ${s.index}`,
        ).toBe(false)
        expect(Math.abs(local(dept, r).a)).toBeLessThanOrEqual(6.5)
      }
    }
  })
  it('plan 座位的 reviewSpot 沿 d 往離桌心方向退 1（站在椅子後）', () => {
    const s = planSeat('east-south', 1, 2)
    const p = local('east-south', seatPosition(s))
    const r = local('east-south', reviewSpot(s))
    const c = local('east-south', groupCenter('east-south', s.group, s.table))
    expect(r.a).toBeCloseTo(p.a)
    expect(Math.abs(r.d - c.d)).toBeCloseTo(Math.abs(p.d - c.d) + 1)
  })
  it('planScreenPosition：與座位同 a、桌心 d 往座位那側 PLAN_SCREEN_DZ（等同舊的世界座標反推）', () => {
    const cases: Seat[] = [planSeat('east-south', 1, 2), planSeat('north-west', 0, 4), planSeat('west-north', 3, 7)]
    for (const s of cases) {
      const p = local(s.dept, seatPosition(s))
      const c = local(s.dept, groupCenter(s.dept, s.group, s.table))
      const got = local(s.dept, planScreenPosition(s))
      expect(got.a).toBeCloseTo(p.a)
      expect(got.d).toBeCloseTo(c.d + Math.sign(p.d - c.d) * PLAN_SCREEN_DZ)
      expect(planScreenPosition(s)[1]).toBe(0)
    }
  })
})

describe('COMMONS／DOOR／MANAGER_OFFICE', () => {
  it('COMMONS 各在指定房間／大廳／中庭；DOOR 在南牆中央；MANAGER_OFFICE 在 se', () => {
    const where: Record<CommonKey, Rect> = {
      serverRoom: CORNER_ROOMS.nw,
      monitorWall: CORNER_ROOMS.nw,
      meeting: CORNER_ROOMS.ne,
      library: CORNER_ROOMS.sw,
      archive: CORNER_ROOMS.sw,
      review: LOBBY,
      counter: LOBBY,
      mailbox: LOBBY,
      pantry: { x0: -RING_IN, z0: -RING_IN, x1: RING_IN, z1: RING_IN },
    }
    for (const k of Object.keys(where) as CommonKey[]) expect(inRect(COMMONS[k], where[k]), k).toBe(true)
    expect(Object.keys(COMMONS)).toHaveLength(9)
    expect(DOOR).toEqual([0, 0, HALF])
    expect(inRect(MANAGER_OFFICE, CORNER_ROOMS.se)).toBe(true)
  })
})

describe('pantrySpot', () => {
  it('pantrySpot：同 id 固定；離原點 ≥ TREE_R+0.5 且 ≤ RING_IN-1；離每組沙發 ≥ 1.2', () => {
    expect(pantrySpot('x')).toEqual(pantrySpot('x'))
    const origin: Vec3 = [0, 0, 0]
    for (let i = 0; i < 50; i++) {
      const p = pantrySpot(`agent-${i}`)
      expect(dist(p, origin)).toBeGreaterThanOrEqual(TREE_R + 0.5)
      expect(dist(p, origin)).toBeLessThanOrEqual(RING_IN - 1)
      for (const s of ATRIUM_SOFAS) expect(dist(p, s.position)).toBeGreaterThanOrEqual(1.2)
    }
  })
})

describe('groupCenter／deptLabelPos', () => {
  it('groupCenter：不同 plan 中心不同；非 plan group 回區中心', () => {
    const cs = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => key(groupCenter('north-west', 'plan-a', t)))
    expect(new Set(cs).size).toBe(8)
    const c = groupCenter('east-south', 'desks')
    expect(local('east-south', c).a).toBeCloseTo(0)
    expect(local('east-south', c).d).toBeCloseTo(5.5)
  })
  it('deptLabelPos 兩兩距離 ≥ 3，且離每個 COMMONS ≥ 3', () => {
    const labels = DEPTS.map(deptLabelPos)
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) expect(dist(labels[i], labels[j])).toBeGreaterThanOrEqual(3)
      for (const c of Object.values(COMMONS)) expect(dist(labels[i], c)).toBeGreaterThanOrEqual(3)
    }
  })
})
