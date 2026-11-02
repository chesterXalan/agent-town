import { useSyncExternalStore } from 'react'
import { ENVIRONMENT_KEY, loadEnvironment, saveEnvironment, type EnvironmentPreferences } from './environment'

let preferences = loadEnvironment()
const listeners = new Set<() => void>()
export function setEnvironment(next: Partial<EnvironmentPreferences>): void {
  preferences = { ...preferences, ...next }
  saveEnvironment(preferences)
  listeners.forEach((listener) => listener())
}
export function useEnvironment(): EnvironmentPreferences {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => preferences,
  )
}
const update = (event: StorageEvent) => {
  if (event.key !== ENVIRONMENT_KEY) return
  preferences = loadEnvironment()
  listeners.forEach((listener) => listener())
}
window.addEventListener('storage', update)
if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('storage', update))
