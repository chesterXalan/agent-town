import type { OfficeAgent, SessionState, TownAgent, TownSession } from '../../../shared/api'
import type { OfficeDept } from '../../../shared/office'
import { DEPT_ORDER } from './office/layout'

export const STATE_CLASS: Record<SessionState, string> = {
  working: 'text-run',
  waiting: 'text-warn',
  idle: 'text-ok',
  unknown: 'text-muted-foreground',
}
const STATUS: Record<SessionState, OfficeAgent['status']> = {
  working: 'tool',
  waiting: 'waiting',
  idle: 'done',
  unknown: 'done',
}
const SEATS_PER_DISTRICT = 12
export interface District {
  id: string
  label: string
  cwd: string
  agents: TownAgent[]
  dept: OfficeDept
}
export interface Campus {
  districts: District[]
  agents: TownAgent[]
  labels: Partial<Record<OfficeDept, string>>
}
export const projectName = (cwd: string) => cwd.split('/').filter(Boolean).at(-1) ?? '/'

/** Keep projects separate; large projects get additional wings and campuses, never overlapping desks. */
export function buildCampuses(sessions: TownSession[]): Campus[] {
  const projects = new Map<string, TownSession[]>()
  for (const session of sessions) {
    const group = projects.get(session.cwd) ?? []
    group.push(session)
    projects.set(session.cwd, group)
  }
  const districts: District[] = []
  for (const [cwd, group] of [...projects].sort(([a], [b]) => a.localeCompare(b))) {
    group.sort((a, b) => a.id.localeCompare(b.id))
    for (let start = 0; start < group.length; start += SEATS_PER_DISTRICT) {
      const dept = DEPT_ORDER[districts.length % DEPT_ORDER.length]
      const label =
        projectName(cwd) + (group.length > SEATS_PER_DISTRICT ? ` · ${Math.floor(start / SEATS_PER_DISTRICT) + 1}` : '')
      districts.push({
        id: `${cwd}:${start}`,
        cwd,
        label,
        dept,
        agents: group.slice(start, start + SEATS_PER_DISTRICT).map((session): TownAgent => ({
          avatarIndex: [...session.id].reduce((n, c) => n + c.charCodeAt(0), 0),
          observedState: session.state,
          id: session.id,
          kind: 'session',
          slug: null,
          agentId: null,
          taskId: null,
          dept,
          job: 'engineer',
          rank: 'guest',
          effort: null,
          status: STATUS[session.state],
          verdict: null,
          model: null,
          agentType: null,
          lastTool: null,
          lastTs: null,
          projectDir: cwd,
          session,
        })),
      })
    }
  }
  const campuses: Campus[] = []
  for (let i = 0; i < districts.length; i += DEPT_ORDER.length) {
    const chunk = districts.slice(i, i + DEPT_ORDER.length)
    campuses.push({
      districts: chunk,
      agents: chunk.flatMap((d) => d.agents),
      labels: Object.fromEntries(chunk.map((d) => [d.dept, d.label])),
    })
  }
  return campuses.length ? campuses : [{ districts: [], agents: [], labels: {} }]
}

export const DEMO_SESSIONS: TownSession[] = [
  ['harbor', 'claude', 'working', 'demo.0'],
  ['harbor', 'codex', 'waiting', 'demo.1'],
  ['garden', 'codex', 'idle', 'demo.2'],
  ['garden', 'claude', 'working', 'demo.3'],
  ['observatory', 'claude', 'idle', 'demo.4'],
  ['observatory', 'codex', 'working', 'demo.5'],
  ['library', 'claude', 'unknown', 'demo.6'],
  ['library', 'codex', 'waiting', 'demo.7'],
  ['workshop', 'claude', 'working', 'demo.8'],
  ['workshop', 'codex', 'idle', 'demo.9'],
  ['orchard', 'claude', 'idle', 'demo.10'],
  ['orchard', 'codex', 'working', 'demo.11'],
  ['lighthouse', 'codex', 'waiting', 'demo.12'],
].map(([project, provider, state, title], i) => ({
  id: `demo:${i}`,
  pid: 1000 + i,
  provider: provider as TownSession['provider'],
  state: state as SessionState,
  title,
  cwd: `/demo/${project}`,
}))
