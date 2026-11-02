import { useSyncExternalStore } from 'react'
import { loadThemePref, resolveTheme, saveThemePref, type ThemePref } from './theme'

const media = window.matchMedia('(prefers-color-scheme: dark)')
let pref: ThemePref = loadThemePref()
const listeners = new Set<() => void>()

function apply() {
  document.documentElement.classList.toggle('dark', resolveTheme(pref, media.matches) === 'dark')
}

/** main.tsx 在 render 前呼叫一次：套用偏好並跟隨系統切換 */
export function initTheme(): void {
  apply()
  media.addEventListener('change', apply)
}

export function setThemePref(next: ThemePref): void {
  pref = next
  saveThemePref(next)
  apply()
  listeners.forEach((l) => l())
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => pref,
  )
}
