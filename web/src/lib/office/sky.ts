import type { Vec3 } from './layout'

export type Phase = 'dawn' | 'day' | 'dusk' | 'night'
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'storm'

export const PHASE_LABEL: Record<Phase, string> = { dawn: '清晨', day: '白天', dusk: '黃昏', night: '晚上' }
export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '晴',
  cloudy: '多雲',
  rain: '下雨',
  snow: '下雪',
  storm: '雷雨',
}

export interface SkyState {
  /** 漸變：t=0 全 from、t=1 全 to */
  from: Phase
  to: Phase
  t: number
  /** 單位向量（從原點指向太陽）；6–19 點 up */
  sunDir: Vec3
  sunUp: boolean
  moonDir: Vec3
  moonUp: boolean
  /** 0..1，室內燈強度 */
  night: number
}

/** 本地 0–24（含小數） */
export function localHour(ms: number): number {
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

/** 時段邊界：前後各 30 分鐘漸變 */
const BOUNDS: [number, Phase, Phase][] = [
  [6, 'night', 'dawn'],
  [8, 'dawn', 'day'],
  [17, 'day', 'dusk'],
  [19, 'dusk', 'night'],
]
const HALF = 0.5

function phaseOf(h: number): Phase {
  if (h >= 6 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 19) return 'dusk'
  return 'night'
}

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
}

export function skyAt(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24
  const edge = BOUNDS.find(([b]) => Math.abs(h - b) < HALF)
  const [from, to, t] = edge ? [edge[1], edge[2], h - (edge[0] - HALF)] : [phaseOf(h), phaseOf(h), 0]
  const w = (p: Phase) => (from === p ? 1 - t : 0) + (to === p ? t : 0)
  const night = w('night') + 0.4 * (w('dawn') + w('dusk'))
  // 6 點在東 +x、19 點在西 −x；z 微偏北讓影子不退化
  const a = (Math.PI * (h - 6)) / 13
  const sunDir = normalize([Math.cos(a), Math.sin(a), -0.3])
  const sunUp = h >= 6 && h < 19
  return { from, to, t, sunDir, sunUp, moonDir: [-sunDir[0], -sunDir[1], -sunDir[2]], moonUp: !sunUp, night }
}

const PHASE_CENTER: Record<Phase, number> = { dawn: 7, day: 12.5, dusk: 18, night: 0 }

/** 手動指定時段：取該時段中心時刻 */
export function phaseSky(p: Phase): SkyState {
  return skyAt(PHASE_CENTER[p])
}

export const WEATHER_SLOT_MS = 30 * 60_000

/** mulberry32 一步：整數 → [0,1) */
function hash01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** 以 30 分鐘區段為種子：重新整理、多分頁一致；晴約六成 */
export function weatherAt(ms: number): Weather {
  const u = hash01(Math.floor(ms / WEATHER_SLOT_MS))
  if (u < 0.6) return 'clear'
  if (u < 0.75) return 'cloudy'
  if (u < 0.88) return 'rain'
  if (u < 0.96) return 'snow'
  return 'storm'
}

export const FLASH_MIN_GAP_MS = 8000
export const FLASH_MS = 300

/** 下一次閃光時刻：間隔 8–20 秒 */
export function nextFlashAt(lastMs: number, rng: () => number): number {
  return lastMs + FLASH_MIN_GAP_MS + rng() * 12_000
}

export const isPrecipitating = (w: Weather): boolean => w === 'rain' || w === 'snow' || w === 'storm'
