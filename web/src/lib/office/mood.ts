import type { FigureAnim } from './anim'

/** 頭上短暫的情緒圖示 */
export type Emote = 'idea' | 'coffee' | 'angry' | 'heart' | 'sleep'

export const EMOTE_GLYPH: Record<Emote, string> = { idea: '💡', coffee: '☕', angry: '💢', heart: '❤', sleep: '💤' }

/** 情緒圖示顯示秒數 */
export const EMOTE_SECS = 3

export type Mood = 'good' | 'normal' | 'bad'

/** 心情維持秒數，之後回 normal */
export const MOOD_SECS = 120

export type MoodCause = 'pass' | 'fail' | 'blocked' | 'celebrate'

/** at：life clock 秒 */
export interface MoodMark {
  mood: Mood
  at: number
}

const isGood = (c: MoodCause) => c === 'pass' || c === 'celebrate'

export function markMood(cause: MoodCause, now: number): MoodMark {
  return { mood: isGood(cause) ? 'good' : 'bad', at: now }
}

export function moodAt(m: MoodMark | undefined, now: number): Mood {
  if (!m || now - m.at >= MOOD_SECS) return 'normal'
  return m.mood
}

const GAIT_SPEED: Record<Mood, number> = { good: 1.25, normal: 1, bad: 0.7 }

/** 步速倍率 */
export function gaitSpeed(m: Mood): number {
  return GAIT_SPEED[m]
}

/** 心情造成的前傾（弧度）：只在走路時（bad 前傾慢走），站、坐、slump 不疊加 */
export function gaitLean(m: Mood, anim: FigureAnim): number {
  return m === 'bad' && anim === 'walk' ? 0.25 : 0
}

export function causeEmote(c: MoodCause): Emote {
  return isGood(c) ? 'heart' : 'angry'
}

/** emote 出現時間 at，回傳 now 時是否仍顯示 */
export function emoteVisible(at: number, now: number): boolean {
  return now >= at && now - at < EMOTE_SECS
}
