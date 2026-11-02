// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LANGUAGE_KEY, loadLanguagePreference, resolveLanguage, saveLanguagePreference } from './language'

describe('language preference', () => {
  it.each([
    ['zh-TW', 'zh-TW'],
    ['zh-Hant-HK', 'zh-TW'],
    ['zh-CN', 'zh-TW'],
    ['ja-JP', 'ja'],
    ['en-GB', 'en'],
    ['fr-FR', 'en'],
    ['', 'en'],
  ] as const)('resolves system locale %s to %s', (system, expected) => {
    expect(resolveLanguage('system', [system])).toBe(expected)
  })
  it('falls back to English for an unsupported primary system language', () => {
    expect(resolveLanguage('system', ['fr-FR', 'ja-JP'])).toBe('en')
    expect(resolveLanguage('system', [])).toBe('en')
  })
  it('honors an explicit preference over the system language', () => {
    expect(resolveLanguage('ja', ['en-US'])).toBe('ja')
    expect(resolveLanguage('en', ['zh-TW'])).toBe('en')
  })
  it('defaults to the system for unset, invalid, or inaccessible storage', () => {
    expect(loadLanguagePreference({ getItem: () => null })).toBe('system')
    expect(loadLanguagePreference({ getItem: () => 'unsupported' })).toBe('system')
    expect(
      loadLanguagePreference({
        getItem: () => {
          throw new Error('Blocked')
        },
      }),
    ).toBe('system')
  })
  it('persists and restores explicit and system preferences', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    saveLanguagePreference('ja', storage)
    expect(values.get(LANGUAGE_KEY)).toBe('ja')
    expect(loadLanguagePreference(storage)).toBe('ja')
    saveLanguagePreference('system', storage)
    expect(loadLanguagePreference(storage)).toBe('system')
  })
  it('remains usable when browser storage cannot be written', () => {
    expect(() =>
      saveLanguagePreference('en', {
        setItem: () => {
          throw new Error('Blocked')
        },
      }),
    ).not.toThrow()
  })
})
