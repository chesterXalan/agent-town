// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNpcScheduler, MAX_SCENES, nextGapMs, SCENE_GAP_MAX_MS, SCENE_GAP_MIN_MS } from './npcSchedule'
import type { NpcScene, Rng } from './npc'

const half: Rng = () => 0.5
const GAP = 40_000 // nextGapMs(half)

/** mulberry32：可重現的亂數 */
function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function setup(opts: { rng?: Rng; reduce?: boolean } = {}) {
  const onScenes = vi.fn<(s: readonly NpcScene[]) => void>()
  const s = createNpcScheduler({ rng: opts.rng ?? half, onScenes, reduce: opts.reduce })
  const current = (): readonly NpcScene[] => onScenes.mock.calls.at(-1)?.[0] ?? []
  const started = () => new Set(onScenes.mock.calls.flatMap((c) => c[0].map((x) => x.id))).size
  return { onScenes, s, current, started }
}

function overlaps(a: NpcScene, b: NpcScene): boolean {
  return a.kind === b.kind || a.uses.some((u) => b.uses.includes(u))
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('nextGapMs', () => {
  it('maps rng onto [20s, 60s]', () => {
    expect(SCENE_GAP_MIN_MS).toBe(20_000)
    expect(SCENE_GAP_MAX_MS).toBe(60_000)
    expect(nextGapMs(() => 0)).toBe(SCENE_GAP_MIN_MS)
    expect(nextGapMs(half)).toBe(GAP)
    expect(nextGapMs(() => 1)).toBe(SCENE_GAP_MAX_MS)
  })
})

describe('createNpcScheduler', () => {
  it('starts at least one scene within 60 seconds', () => {
    const { s, current } = setup({ rng: seeded(1) })
    vi.advanceTimersByTime(60_000)
    expect(current().length).toBeGreaterThan(0)
    const scene = current()[0]
    expect(scene.actors.length).toBeGreaterThan(0)
    s.dispose()
  })

  it('waits one gap before the first scene', () => {
    const { onScenes, s, current } = setup()
    vi.advanceTimersByTime(GAP - 1)
    expect(onScenes).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(current()).toHaveLength(1)
    s.dispose()
  })

  it('runs a second scene one gap later, then stops at MAX_SCENES', () => {
    expect(MAX_SCENES).toBe(2)
    const { s, current, started } = setup()
    vi.advanceTimersByTime(GAP)
    vi.advanceTimersByTime(GAP)
    expect(current()).toHaveLength(2)
    vi.advanceTimersByTime(600_000)
    expect(current()).toHaveLength(2)
    expect(started()).toBe(2)
    s.dispose()
  })

  it('second scene has a different kind, disjoint uses and a distinct id', () => {
    const { s, current } = setup()
    vi.advanceTimersByTime(GAP * 2)
    const [a, b] = current()
    expect(b.kind).not.toBe(a.kind)
    expect(a.uses.filter((u) => b.uses.includes(u))).toEqual([])
    expect(b.id).not.toBe(a.id)
    s.dispose()
  })

  it('never runs overlapping scenes (many seeds, with sceneDone churn)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { s, onScenes } = setup({ rng: seeded(seed) })
      for (let i = 0; i < 20; i++) {
        vi.advanceTimersByTime(30_000)
        const cur = onScenes.mock.calls.at(-1)?.[0] ?? []
        if (cur.length > 0 && i % 3 === 0) s.sceneDone(cur[0].id)
      }
      for (const [scenes] of onScenes.mock.calls) {
        expect(scenes.length).toBeLessThanOrEqual(MAX_SCENES)
        if (scenes.length === 2) expect(overlaps(scenes[0], scenes[1])).toBe(false)
      }
      const ids = onScenes.mock.calls.flatMap((c) => c[0].map((x) => x.id))
      const byId = new Map<number, string>()
      for (const sc of onScenes.mock.calls.flatMap((c) => c[0])) {
        if (byId.has(sc.id)) expect(byId.get(sc.id)).toBe(sc.kind)
        byId.set(sc.id, sc.kind)
      }
      expect(ids.length).toBeGreaterThan(0)
      s.dispose()
    }
  })

  it('fills the slot only after a sceneDone; a full gap later', () => {
    const { s, current, started } = setup()
    vi.advanceTimersByTime(GAP * 2)
    const first = current()[0]
    s.sceneDone(first.id)
    expect(current()).toHaveLength(1)
    expect(current().some((x) => x.id === first.id)).toBe(false)
    vi.advanceTimersByTime(GAP - 1)
    expect(started()).toBe(2)
    vi.advanceTimersByTime(1)
    expect(started()).toBe(3)
    expect(current()).toHaveLength(2)
    s.dispose()
  })

  it('sceneDone with an unknown id is ignored', () => {
    const { onScenes, s } = setup()
    vi.advanceTimersByTime(GAP)
    const n = onScenes.mock.calls.length
    s.sceneDone(999)
    expect(onScenes.mock.calls.length).toBe(n)
    s.dispose()
  })

  it('reduce: never emits a non-empty list over 10 minutes', () => {
    const { onScenes, s } = setup({ rng: seeded(7), reduce: true })
    vi.advanceTimersByTime(600_000)
    s.setBusy(true)
    s.setBusy(false)
    s.setHidden(true)
    s.setHidden(false)
    vi.advanceTimersByTime(600_000)
    expect(onScenes.mock.calls.every((c) => c[0].length === 0)).toBe(true)
    s.dispose()
  })

  it('hidden starts nothing new; unhide waits a full gap again', () => {
    const { s, current, started } = setup()
    vi.advanceTimersByTime(GAP)
    s.setHidden(true)
    vi.advanceTimersByTime(600_000)
    expect(started()).toBe(1)
    s.setHidden(false)
    vi.advanceTimersByTime(GAP - 1)
    expect(started()).toBe(1)
    vi.advanceTimersByTime(1)
    expect(current()).toHaveLength(2)
    s.dispose()
  })

  it('hidden: sceneDone still clears but does not reschedule', () => {
    const { s, current, started } = setup()
    vi.advanceTimersByTime(GAP)
    s.setHidden(true)
    s.sceneDone(current()[0].id)
    expect(current()).toHaveLength(0)
    vi.advanceTimersByTime(600_000)
    expect(started()).toBe(1)
    s.dispose()
  })

  it('busy at due time defers until busy ends, once', () => {
    const { onScenes, s, current, started } = setup()
    s.setBusy(true)
    vi.advanceTimersByTime(GAP)
    vi.advanceTimersByTime(600_000)
    expect(onScenes).not.toHaveBeenCalled()
    s.setBusy(false)
    s.setBusy(true)
    s.setBusy(false)
    expect(current()).toHaveLength(1)
    expect(started()).toBe(1)
    s.dispose()
  })

  it('hidden clears pending: unhide then busy ends waits a full new gap', () => {
    const { onScenes, s, current } = setup()
    s.setBusy(true)
    vi.advanceTimersByTime(GAP)
    s.setHidden(true)
    s.setHidden(false)
    s.setBusy(false)
    expect(onScenes).not.toHaveBeenCalled()
    vi.advanceTimersByTime(GAP - 1)
    expect(onScenes).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(current()).toHaveLength(1)
    s.dispose()
  })

  it('dispose stops all callbacks', () => {
    const { onScenes, s } = setup()
    vi.advanceTimersByTime(GAP)
    const n = onScenes.mock.calls.length
    const id = onScenes.mock.calls[0][0][0].id
    s.dispose()
    vi.advanceTimersByTime(600_000)
    s.sceneDone(id)
    expect(onScenes.mock.calls.length).toBe(n)
  })
})
