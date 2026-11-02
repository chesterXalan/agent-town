export const ZOOM_SPEEDS = [1, 2, 3, 4] as const
export type ZoomSpeed = (typeof ZOOM_SPEEDS)[number]
export const DEFAULT_ZOOM_SPEED: ZoomSpeed = 2
export const ZOOM_SPEED_KEY = 'agent-town-zoom-speed'

export function loadZoomSpeed(): ZoomSpeed {
  try {
    const value = Number(localStorage.getItem(ZOOM_SPEED_KEY))
    return ZOOM_SPEEDS.includes(value as ZoomSpeed) ? (value as ZoomSpeed) : DEFAULT_ZOOM_SPEED
  } catch {
    return DEFAULT_ZOOM_SPEED
  }
}
