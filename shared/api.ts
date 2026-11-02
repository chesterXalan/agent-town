import type { OfficeDept, OfficeJob, OfficeRank, OfficeStatus } from './office'

export interface OfficeAgent {
  avatarIndex?: number
  observedState?: SessionState
  id: string // plan agent：`${slug}/${agentId}`；其他：`${projectDir}/${sessionId}`
  kind: 'session' | 'subagent'
  slug: string | null // 屬於 plan 才有
  agentId: string | null
  taskId: string | null
  dept: OfficeDept
  job: OfficeJob
  rank: OfficeRank
  effort: string | null // low|medium|high|xhigh|max
  status: OfficeStatus
  verdict: 'pass' | 'fail' | null // 只有 job === 'reviewer' 且 status === 'done' 時可能非 null
  model: string | null
  agentType: string | null
  lastTool: string | null
  lastTs: string | null
  projectDir: string
}

export type Provider = 'claude' | 'codex'
export type SessionState = 'working' | 'waiting' | 'idle' | 'unknown'
export interface TownSession {
  id: string
  provider: Provider
  pid: number
  state: SessionState
  title: string
  cwd: string
}
export interface TownSnapshot {
  sessions: TownSession[]
  source: 'ready' | 'unavailable' | 'error'
  updatedAt: string
}
export interface TownAgent extends OfficeAgent {
  session: TownSession
}
