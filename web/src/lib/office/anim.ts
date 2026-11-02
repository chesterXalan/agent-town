import type { OfficeStatus } from '../../../../shared/office'

export type FigureAnim =
  | 'idle'
  | 'walk'
  | 'wave'
  | 'nod'
  | 'cheer'
  | 'slump'
  | 'sit'
  | 'type-left'
  | 'type-right'
  | 'crouch'
  | 'pick-up'
  | 'hold'

/** clip 名；wave＝interact-right（舉手一次）、nod＝emote-yes（只給聊天聆聽用）、cheer＝jump、slump＝emote-no、hold＝holding-right */
export const CLIP: Record<FigureAnim, string> = {
  idle: 'idle',
  walk: 'walk',
  wave: 'interact-right',
  nod: 'emote-yes',
  cheer: 'jump',
  slump: 'emote-no',
  sit: 'sit',
  'type-left': 'interact-left',
  'type-right': 'interact-right',
  crouch: 'crouch',
  'pick-up': 'pick-up',
  hold: 'holding-right',
}

/** 打字左右手交替的間隔（秒） */
export const TYPE_SWAP = 0.6
/** waiting 舉手一次的長度（秒） */
const WAVE_SECS = 1
/** thinking 轉頭的最大偏角（弧度） */
const TURN_MAX = 0.4

/** FNV-1a 32-bit */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 整數 → [0, 1)（mulberry32 一步） */
function unit(n: number): number {
  let x = (n + 0x6d2b79f5) | 0
  x = Math.imul(x ^ (x >>> 15), x | 1)
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}

/** 座位上的動作：tool／replying 每 0.6 秒交替 type-left／type-right；thinking、done → sit；waiting → waitingAnim */
export function seatedAnim(status: OfficeStatus, t: number, id: string): FigureAnim {
  switch (status) {
    case 'tool':
    case 'replying':
      return Math.floor(t / TYPE_SWAP) % 2 === 0 ? 'type-left' : 'type-right'
    case 'thinking':
    case 'done':
      return 'sit'
    case 'waiting':
      return waitingAnim(t, id)
  }
}

/** waiting：站著 idle，每 8–15 秒（依 id 決定週期）舉手 wave 1 秒 */
export function waitingAnim(t: number, id: string): FigureAnim {
  const h = hash(id)
  const period = 8 + (h % 8)
  const offset = unit(h) * period
  const phase = (((t + offset) % period) + period) % period
  return phase < WAVE_SECS ? 'wave' : 'idle'
}

/** thinking 時坐著轉頭：回傳相對座位朝向的偏角，|值| ≤ 0.4，每 4–7 秒換一次 */
export function thinkTurn(t: number, id: string): number {
  const h = hash(id)
  const span = 4 + ((h >>> 3) % 4)
  const slot = Math.floor((t + unit(h ^ 0x9e3779b9) * span) / span)
  return (unit(h ^ Math.imul(slot, 0x85ebca6b)) * 2 - 1) * TURN_MAX
}
