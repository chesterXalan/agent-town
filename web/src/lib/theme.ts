export type ThemePref = 'system' | 'light' | 'dark'

export const THEME_KEY = 'agent-town-theme'
const PREFS: readonly ThemePref[] = ['system', 'light', 'dark']

export function resolveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

/** 讀全域 localStorage 本身就可能 throw（site data 被封鎖），必須在 try 內呼叫 */
function ls(): Storage | undefined {
  return (globalThis as { localStorage?: Storage }).localStorage
}

/** private mode 或被封鎖時 localStorage 存取會 throw，一律退回 system */
export function loadThemePref(storage?: Pick<Storage, 'getItem'>): ThemePref {
  try {
    const v = (storage ?? ls())?.getItem(THEME_KEY) ?? null
    return PREFS.includes(v as ThemePref) ? (v as ThemePref) : 'system'
  } catch {
    return 'system'
  }
}

export function saveThemePref(pref: ThemePref, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? ls())?.setItem(THEME_KEY, pref)
  } catch {
    // 存不了就只在本次 session 生效
  }
}

export function nextThemePref(pref: ThemePref): ThemePref {
  return PREFS[(PREFS.indexOf(pref) + 1) % PREFS.length]
}
