import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TownSession, TownSnapshot } from '../shared/api'

const execute = promisify(execFile)
export const DEFAULT_HELPER = join(homedir(), 'Library/Application Support/AgentSessionBridge/bin/agent-session-bridge')

/** Consume the installed bridge's live process scan and established hook matching rules. */
export function parseSessions(output: string): TownSession[] {
  const sessions = new Map<string, TownSession>()
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    const fields = line.replace(/\r$/, '').split('\t')
    if (fields.length !== 6) throw new Error('Unsupported session bridge format')
    const [provider, rawPid, state, title, cwd] = fields
    const pid = Number(rawPid)
    if (
      (provider !== 'claude' && provider !== 'codex') ||
      !Number.isSafeInteger(pid) ||
      pid <= 0 ||
      !['working', 'waiting', 'idle', 'unknown'].includes(state) ||
      !cwd.startsWith('/')
    ) {
      throw new Error('Invalid session bridge metadata')
    }
    const id = `${provider}:${pid}`
    sessions.set(id, { id, provider, pid, state: state as TownSession['state'], title, cwd })
  }
  return [...sessions.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export async function readSessions(helper = DEFAULT_HELPER): Promise<TownSnapshot> {
  const updatedAt = new Date().toISOString()
  try {
    const { stdout } = await execute(helper, ['list'], { timeout: 5000, maxBuffer: 1024 * 1024, encoding: 'utf8' })
    return { sessions: parseSessions(stdout), source: 'ready', updatedAt }
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    return { sessions: [], source: missing ? 'unavailable' : 'error', updatedAt }
  }
}

/** Share one bounded process scan across all browser tabs, including concurrent requests. */
export function createSource(read: () => Promise<TownSnapshot> = readSessions) {
  let cached: TownSnapshot | null = null
  let checkedAt = 0
  let pending: Promise<TownSnapshot> | null = null
  return {
    async refresh(): Promise<TownSnapshot> {
      if (pending) return pending
      if (cached && Date.now() - checkedAt < 1000) return cached
      pending = read()
        .then((snapshot) => {
          cached = snapshot
          checkedAt = Date.now()
          return snapshot
        })
        .finally(() => {
          pending = null
        })
      return pending
    },
  }
}
