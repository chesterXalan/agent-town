export const FRAME_RATES = [10, 15, 20, 30] as const
export type FrameRate = (typeof FRAME_RATES)[number]
export const DEFAULT_FRAME_RATE: FrameRate = 15
export const FRAME_RATE_KEY = 'agent-town-frame-rate'

export function loadFrameRate(storage?: Pick<Storage, 'getItem'>): FrameRate {
  try {
    const value = Number((storage ?? globalThis.localStorage)?.getItem(FRAME_RATE_KEY))
    return FRAME_RATES.includes(value as FrameRate) ? (value as FrameRate) : DEFAULT_FRAME_RATE
  } catch {
    return DEFAULT_FRAME_RATE
  }
}

export function saveFrameRate(fps: FrameRate, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? globalThis.localStorage)?.setItem(FRAME_RATE_KEY, String(fps))
  } catch {
    // Keep the selected rate for this tab when storage is unavailable.
  }
}
