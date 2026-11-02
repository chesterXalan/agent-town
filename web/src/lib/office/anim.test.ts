// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CLIP, seatedAnim, thinkTurn, TYPE_SWAP, waitingAnim } from './anim'

const samples = (from: number, to: number, step = 0.1) =>
  Array.from({ length: Math.round((to - from) / step) }, (_, i) => from + i * step)

describe('CLIP', () => {
  it('wave／nod／sit 對到模型 clip', () => {
    expect(CLIP.wave).toBe('interact-right')
    expect(CLIP.nod).toBe('emote-yes')
    expect(CLIP.sit).toBe('sit')
  })
})

describe('seatedAnim', () => {
  it.each(['tool', 'replying'] as const)('%s 每 TYPE_SWAP 秒交替左右手打字', (s) => {
    const a = seatedAnim(s, 0, 'a')
    const b = seatedAnim(s, TYPE_SWAP, 'a')
    expect(new Set([a, b])).toEqual(new Set(['type-left', 'type-right']))
  })

  it.each(['thinking', 'done'] as const)('%s 坐著', (s) => expect(seatedAnim(s, 3, 'a')).toBe('sit'))

  it('waiting 交給 waitingAnim', () => {
    for (const t of samples(0, 30)) expect(seatedAnim('waiting', t, 'w')).toBe(waitingAnim(t, 'w'))
  })
})

describe('waitingAnim', () => {
  it.each(['a', 'agent-1', 'lead:plan-x', 'zz'])('id %s：舉手佔比 5–15%%、每次不超過 1.1 秒', (id) => {
    const ts = samples(0, 30)
    const anims = ts.map((t) => waitingAnim(t, id))
    expect(new Set(anims)).toEqual(new Set(['idle', 'wave']))
    const ratio = anims.filter((a) => a === 'wave').length / anims.length
    expect(ratio).toBeGreaterThanOrEqual(0.05)
    expect(ratio).toBeLessThanOrEqual(0.15)
    let run = 0
    for (const a of anims) {
      run = a === 'wave' ? run + 1 : 0
      expect(run * 0.1).toBeLessThanOrEqual(1.1 + 1e-9)
    }
  })

  it('同 id 結果固定', () => {
    for (const t of samples(0, 30, 0.7)) expect(waitingAnim(t, 'x')).toBe(waitingAnim(t, 'x'))
  })
})

describe('thinkTurn', () => {
  it('偏角不超過 0.4 且會變化', () => {
    for (const id of ['a', 'b', 'think-1']) {
      const vals = samples(0, 60, 0.25).map((t) => thinkTurn(t, id))
      for (const v of vals) expect(Math.abs(v)).toBeLessThanOrEqual(0.4)
      expect(new Set(vals).size).toBeGreaterThan(1)
    }
  })
})
