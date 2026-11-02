// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { causeEmote, EMOTE_GLYPH, emoteVisible, gaitLean, gaitSpeed, markMood, MOOD_SECS, moodAt } from './mood'

describe('mood', () => {
  it('markMood：pass／celebrate → good、fail／blocked → bad，記下時間', () => {
    expect(markMood('pass', 10)).toEqual({ mood: 'good', at: 10 })
    expect(markMood('celebrate', 0).mood).toBe('good')
    expect(markMood('fail', 0).mood).toBe('bad')
    expect(markMood('blocked', 0).mood).toBe('bad')
  })

  it('moodAt：MOOD_SECS 內維持、之後回 normal；沒有標記為 normal', () => {
    const mark = markMood('pass', 10)
    expect(moodAt(mark, 10 + MOOD_SECS - 0.1)).toBe('good')
    expect(moodAt(mark, 10 + MOOD_SECS)).toBe('normal')
    expect(moodAt(markMood('fail', 0), 5)).toBe('bad')
    expect(moodAt(undefined, 0)).toBe('normal')
  })

  it('gaitSpeed 與 gaitLean', () => {
    expect(gaitSpeed('good')).toBe(1.25)
    expect(gaitSpeed('normal')).toBe(1)
    expect(gaitSpeed('bad')).toBe(0.7)
    expect(gaitLean('bad', 'walk')).toBe(0.25)
    expect(gaitLean('good', 'walk')).toBe(0)
    expect(gaitLean('normal', 'walk')).toBe(0)
  })

  it('gaitLean 只在走路時前傾，slump／坐姿打字／站著不疊加', () => {
    for (const anim of ['slump', 'type-left', 'type-right', 'sit', 'idle', 'hold'] as const)
      expect(gaitLean('bad', anim)).toBe(0)
  })

  it('causeEmote', () => {
    expect(causeEmote('pass')).toBe('heart')
    expect(causeEmote('celebrate')).toBe('heart')
    expect(causeEmote('fail')).toBe('angry')
    expect(causeEmote('blocked')).toBe('angry')
  })

  it('emoteVisible：3 秒內顯示', () => {
    expect(emoteVisible(0, 2.9)).toBe(true)
    expect(emoteVisible(0, 3)).toBe(false)
  })

  it('EMOTE_GLYPH 五個鍵齊全', () => {
    expect(EMOTE_GLYPH).toEqual({ idea: '💡', coffee: '☕', angry: '💢', heart: '❤', sleep: '💤' })
  })
})
