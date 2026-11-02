// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { TownSession } from '../../../shared/api'
import { buildCampuses, DEMO_SESSIONS } from './town'
import { assignSeats, seatPosition, zonePoint } from './office/layout'
const session = (pid: number, cwd = '/work/shared'): TownSession => ({
  id: `codex:${pid}`,
  pid,
  cwd,
  title: 'Example',
  provider: 'codex',
  state: 'working',
})
describe('project districts', () => {
  it('groups same-directory Claude and Codex sessions without merging residents', () => {
    const campus = buildCampuses([session(1), { ...session(2), provider: 'claude' }, session(3, '/else/shared')])[0]
    expect(campus.districts).toHaveLength(2)
    expect(campus.agents).toHaveLength(3)
    expect(new Set(campus.districts.map((d) => d.cwd)).size).toBe(2)
  })
  it('adds campuses after six districts without dropping residents', () => {
    const campuses = buildCampuses(DEMO_SESSIONS)
    expect(campuses).toHaveLength(2)
    expect(campuses.flatMap((c) => c.agents)).toHaveLength(DEMO_SESSIONS.length)
  })
  it('splits crowded projects before desks overlap or leave the zone', () => {
    const campuses = buildCampuses(Array.from({ length: 100 }, (_, i) => session(i + 1)))
    expect(campuses).toHaveLength(2)
    expect(campuses.flatMap((c) => c.agents)).toHaveLength(100)
    for (const campus of campuses) {
      const seats = assignSeats(new Map(), campus.agents)
      expect(new Set([...seats.values()].map((s) => seatPosition(s).join(','))).size).toBe(campus.agents.length)
      for (const district of campus.districts) {
        expect(district.agents.length).toBeLessThanOrEqual(12)
        const a = zonePoint(district.dept, -6.5, 0),
          b = zonePoint(district.dept, 6.5, 11)
        for (const agent of district.agents) {
          const position = seatPosition(seats.get(agent.id)!)
          for (const axis of [0, 2]) {
            expect(position[axis]).toBeGreaterThanOrEqual(Math.min(a[axis], b[axis]))
            expect(position[axis]).toBeLessThanOrEqual(Math.max(a[axis], b[axis]))
          }
        }
      }
    }
  })
  it('retains unknown as an observed state and never calls it working', () => {
    const agent = buildCampuses([{ ...session(1), state: 'unknown' }])[0].agents[0]
    expect(agent.observedState).toBe('unknown')
    expect(agent.status).not.toBe('tool')
  })
  it('does not mutate input ordering and produces deterministic districts', () => {
    const input = [session(20), session(3)]
    expect(buildCampuses(input)).toEqual(buildCampuses([...input].reverse()))
    expect(input[0].pid).toBe(20)
  })
  it('retains a visitable empty campus', () =>
    expect(buildCampuses([])).toEqual([{ districts: [], agents: [], labels: {} }]))
})
