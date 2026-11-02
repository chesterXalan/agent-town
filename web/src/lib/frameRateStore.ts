import { useSyncExternalStore } from 'react'
import { FRAME_RATE_KEY, loadFrameRate, saveFrameRate, type FrameRate } from './frameRate'

let fps = loadFrameRate()
const listeners = new Set<() => void>()
export function setFrameRate(next: FrameRate): void {
  fps = next
  saveFrameRate(next)
  listeners.forEach((listener) => listener())
}
export function useFrameRate(): FrameRate {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => fps,
  )
}
const updateStoredRate = (event: StorageEvent) => {
  if (event.key !== FRAME_RATE_KEY) return
  fps = loadFrameRate()
  listeners.forEach((listener) => listener())
}
window.addEventListener('storage', updateStoredRate)
if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', updateStoredRate))
