export const LANGUAGES = ['en', 'zh-TW', 'ja'] as const
export type Language = (typeof LANGUAGES)[number]
export type LanguagePreference = 'system' | Language
export const LANGUAGE_KEY = 'agent-town-language'

export function resolveLanguage(preference: LanguagePreference, systemLanguages: readonly string[]): Language {
  if (preference !== 'system') return preference
  const primary = (systemLanguages[0] ?? '').toLowerCase().split(/[-_]/)[0]
  if (primary === 'zh') return 'zh-TW'
  if (primary === 'ja') return 'ja'
  return 'en'
}

export function loadLanguagePreference(storage?: Pick<Storage, 'getItem'>): LanguagePreference {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(LANGUAGE_KEY)
    return value === 'system' || LANGUAGES.includes(value as Language) ? (value as LanguagePreference) : 'system'
  } catch {
    return 'system'
  }
}

export function saveLanguagePreference(preference: LanguagePreference, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? globalThis.localStorage)?.setItem(LANGUAGE_KEY, preference)
  } catch {
    // Keep the in-memory preference when browser storage is unavailable.
  }
}
