import { useSyncExternalStore } from 'react'
import { loadZoomSpeed, ZOOM_SPEED_KEY, type ZoomSpeed } from './zoom'

let speed = loadZoomSpeed()
const listeners = new Set<() => void>()
export function setZoomSpeed(next: ZoomSpeed): void {
  speed = next
  try {
    localStorage.setItem(ZOOM_SPEED_KEY, String(next))
  } catch {
    // Keep the preference for this tab when storage is unavailable.
  }
  listeners.forEach((listener) => listener())
}
export function useZoomSpeed(): ZoomSpeed {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => speed,
  )
}
const updateStoredSpeed = (event: StorageEvent) => {
  if (event.key !== ZOOM_SPEED_KEY && event.key !== null) return
  speed = loadZoomSpeed()
  listeners.forEach((listener) => listener())
}
window.addEventListener('storage', updateStoredSpeed)
if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', updateStoredSpeed))
