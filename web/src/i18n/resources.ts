import en from './en.json'
import ja from './ja.json'
import zhTW from './zh-TW.json'

export const resources = { en: { translation: en }, 'zh-TW': { translation: zhTW }, ja: { translation: ja } }
export const translationOptions = {
  resources,
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh-TW', 'ja'],
  keySeparator: false as const,
  interpolation: { escapeValue: false },
  initAsync: false,
}
