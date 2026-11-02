// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OfficeAgent } from '../../../../shared/api'
import { assignSeats, pantrySpot, seatPosition, type Vec3 } from './layout'
import type { LifePose } from './lifeRun'
import { makeLocator } from './locator'

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
    status: 'done',
    verdict: null,
    model: null,
    agentType: null,
    lastTool: null,
    lastTs: null,
    projectDir: 'p',
    ...o,
  }
}

function build(agents: OfficeAgent[], o: { life?: Record<string, Vec3>; busy?: string[]; reduce?: boolean } = {}) {
  const seats = assignSeats(new Map(), agents)
  const life = o.life ?? {}
  const pose = (p: Vec3): LifePose => ({
    position: p,
    anim: 'walk',
    facing: null,
    carry: null,
    emote: null,
    line: null,
  })
  const loc = makeLocator(seats, {
    agents: { current: agents },
    life: { current: { poseOf: (id) => (life[id] ? pose(life[id]) : null) } },
    events: { current: { busyOf: (id) => (o.busy ?? []).includes(id) } },
    reduce: o.reduce ?? false,
  })
  return { seats, loc }
}

describe('makeLocator', () => {
  it('currentOf：做完的 session 沒有生活行程 → pantry（home），不是座位', () => {
    const { loc } = build([agent({ id: 'A' })])
    expect(loc.currentOf('A')).toEqual(pantrySpot('A'))
  })

  it('currentOf：生活位置 > home；subagent 的 home 是座位；未知 id 回 null', () => {
    const { seats, loc } = build([agent({ id: 'A' }), agent({ id: 'S', kind: 'subagent' })], { life: { A: [9, 0, 9] } })
    expect(loc.currentOf('A')).toEqual([9, 0, 9])
    expect(loc.currentOf('S')).toEqual(seatPosition(seats.get('S')!))
    expect(loc.currentOf('X')).toBeNull()
  })

  it('idleIds：排除工作中與事件中，全體最多 6 個；reduced-motion 回 []', () => {
    const agents = [
      agent({ id: 'W', status: 'tool' }),
      agent({ id: 'B' }),
      ...Array.from({ length: 8 }, (_, i) => agent({ id: `i${i}` })),
    ]
    const { loc } = build(agents, { busy: ['B'] })
    expect(loc.idleIds()).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5'])
    expect(build(agents, { reduce: true }).loc.idleIds()).toEqual([])
  })

  it('idleIds(among)：先限定在給的 id 內再取最多 6 個（其他 plan 的 idle 不佔名額）', () => {
    const others = Array.from({ length: 7 }, (_, i) => agent({ id: `o${i}`, slug: 'west-south' }))
    const mine = [
      agent({ id: 'm0', slug: 'p', kind: 'subagent' }),
      agent({ id: 'm1', slug: 'p', kind: 'subagent', status: 'replying' }),
      agent({ id: 'm2', slug: 'p', kind: 'subagent', status: 'thinking' }),
    ]
    const { loc } = build([...others, ...mine])
    expect(loc.idleIds(loc.membersOf('p'))).toEqual(['m0', 'm2'])
    const many = Array.from({ length: 8 }, (_, i) => agent({ id: `p${i}`, slug: 'p' }))
    const big = build([...others, ...many]).loc
    expect(big.idleIds(big.membersOf('p'))).toHaveLength(6)
  })
})
