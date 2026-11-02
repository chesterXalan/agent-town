import type { OfficeAgent, SessionState, TownAgent, TownSession } from '../../../shared/api'
import type { OfficeDept } from '../../../shared/office'
import { DEPT_ORDER } from './office/layout'

export const STATE_LABEL: Record<SessionState, string> = {
  working: '工作中',
  waiting: '等你回覆',
  idle: '休息中',
  unknown: '未知・未取得 hooks',
}
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
  ['harbor', 'claude', 'working', '整理碼頭的任務'],
  ['harbor', 'codex', 'waiting', '等你決定下一步'],
  ['garden', 'codex', 'idle', '花園的午後'],
  ['garden', 'claude', 'working', '照顧新的點子'],
  ['observatory', 'claude', 'idle', '觀星休息時間'],
  ['observatory', 'codex', 'working', '尋找遠方的訊號'],
  ['library', 'claude', 'unknown', '尚未連接 hooks'],
  ['library', 'codex', 'waiting', '有一件事想問你'],
  ['workshop', 'claude', 'working', '打造新的工具'],
  ['workshop', 'codex', 'idle', '喝杯咖啡'],
  ['orchard', 'claude', 'idle', '果園散步中'],
  ['orchard', 'codex', 'working', '照顧小樹苗'],
  ['lighthouse', 'codex', 'waiting', '燈塔等你回來'],
].map(([project, provider, state, title], i) => ({
  id: `demo:${i}`,
  pid: 1000 + i,
  provider: provider as TownSession['provider'],
  state: state as SessionState,
  title,
  cwd: `/demo/${project}`,
}))
