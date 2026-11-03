import { useSyncExternalStore } from 'react'
import { GRAPHICS_QUALITY_KEY, loadGraphicsQuality, type GraphicsQuality } from './graphicsQuality'

let quality = loadGraphicsQuality()
const listeners = new Set<() => void>()
export function setGraphicsQuality(next: GraphicsQuality): void {
  quality = next
  try {
    localStorage.setItem(GRAPHICS_QUALITY_KEY, next)
  } catch {
    // Keep the preference for this tab when storage is unavailable.
  }
  listeners.forEach((listener) => listener())
}
export function useGraphicsQuality(): GraphicsQuality {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => quality,
  )
}
const updateStoredQuality = (event: StorageEvent) => {
  if (event.key !== GRAPHICS_QUALITY_KEY && event.key !== null) return
  quality = loadGraphicsQuality()
  listeners.forEach((listener) => listener())
}
window.addEventListener('storage', updateStoredQuality)
if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', updateStoredQuality))
