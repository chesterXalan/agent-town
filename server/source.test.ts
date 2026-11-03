// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createSource, parseSessions, readSessions } from './source'
import type { TownSnapshot } from '../shared/api'

const line = (provider = 'codex', pid = 42, state = 'working', cwd = '/work/project') =>
  `${provider}\t${pid}\t${state}\tA friendly title\t${cwd}\t-`
describe('Shared read-only session bridge', () => {
  it('keeps same-directory sessions separate across providers and processes', () => {
    const sessions = parseSessions([line(), line('codex', 43), line('claude', 44)].join('\n'))
    expect(sessions).toHaveLength(3)
    expect(new Set(sessions.map((s) => s.id)).size).toBe(3)
    expect(new Set(sessions.map((s) => s.cwd)).size).toBe(1)
  })
  it.each(['working', 'waiting', 'idle', 'unknown'])('preserves the observed %s state', (state) => {
    expect(parseSessions(line('claude', 1, state))[0].state).toBe(state)
  })
  it('does not assume that terminal locations imply agent identity', () => {
    expect(parseSessions(line().replace(/-$/, 'cmux:workspace/surface'))[0].id).toBe('codex:42')
  })
  it('accepts an empty scan and deduplicates exact process identities', () => {
    expect(parseSessions('')).toEqual([])
    expect(parseSessions(`${line()}\n${line()}`)).toHaveLength(1)
  })
  it.each([
    'bad',
    line('other'),
    line('codex', -1),
    line('codex', 42, 'made-up'),
    line('codex', 42, 'idle', 'relative'),
  ])('rejects malformed bridge metadata', (row) => {
    expect(() => parseSessions(row)).toThrow()
  })
  it('reports a missing helper without leaking filesystem errors', async () => {
    const result = await readSessions('/nonexistent-agent-town-helper')
    expect(result.source).toBe('unavailable')
    expect(result.sessions).toEqual([])
    expect(Object.keys(result).sort()).toEqual(['sessions', 'source', 'updatedAt'])
  })
  it('coalesces concurrent scans and expires the cache', async () => {
    vi.useFakeTimers()
    try {
      const snapshot: TownSnapshot = { sessions: [], source: 'ready', updatedAt: '2026-01-01T00:00:00Z' }
      const read = vi.fn(async () => snapshot)
      const source = createSource(read)
      await Promise.all([source.refresh(), source.refresh(), source.refresh()])
      await source.refresh()
      expect(read).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1001)
      await source.refresh()
      expect(read).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
  it('clears stale residents when the bridge becomes unavailable', async () => {
    vi.useFakeTimers()
    try {
      const read = vi
        .fn()
        .mockResolvedValueOnce({ sessions: parseSessions(line()), source: 'ready', updatedAt: '' })
        .mockResolvedValueOnce({ sessions: [], source: 'error', updatedAt: '' })
      const source = createSource(read)
      expect((await source.refresh()).sessions).toHaveLength(1)
      vi.advanceTimersByTime(1001)
      expect(await source.refresh()).toMatchObject({ sessions: [], source: 'error' })
    } finally {
      vi.useRealTimers()
    }
  })
})
