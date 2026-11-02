import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { useSyncExternalStore } from 'react'
import {
  LANGUAGE_KEY,
  loadLanguagePreference,
  resolveLanguage,
  saveLanguagePreference,
  type LanguagePreference,
} from './language'
import { translationOptions } from './resources'

let preference = loadLanguagePreference()
const listeners = new Set<() => void>()
const systemLanguages = () => (navigator.languages?.length ? navigator.languages : [navigator.language])
i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language
})
void i18n.use(initReactI18next).init({ ...translationOptions, lng: resolveLanguage(preference, systemLanguages()) })

export function setLanguagePreference(next: LanguagePreference): void {
  preference = next
  saveLanguagePreference(next)
  void i18n.changeLanguage(resolveLanguage(next, systemLanguages()))
  listeners.forEach((listener) => listener())
}

export function useLanguagePreference(): LanguagePreference {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => preference,
  )
}

const updateSystemLanguage = () => {
  if (preference === 'system') void i18n.changeLanguage(resolveLanguage(preference, systemLanguages()))
}
const updateStoredLanguage = (event: StorageEvent) => {
  if (event.key !== LANGUAGE_KEY) return
  preference = loadLanguagePreference()
  void i18n.changeLanguage(resolveLanguage(preference, systemLanguages()))
  listeners.forEach((listener) => listener())
}
window.addEventListener('languagechange', updateSystemLanguage)
window.addEventListener('storage', updateStoredLanguage)
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.removeEventListener('languagechange', updateSystemLanguage)
    window.removeEventListener('storage', updateStoredLanguage)
  })
