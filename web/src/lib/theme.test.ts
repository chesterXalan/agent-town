// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadThemePref, nextThemePref, resolveTheme, saveThemePref, THEME_KEY } from './theme'

const mem = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}
const throwing = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceeded')
  },
}

describe('resolveTheme', () => {
  it.each([
    ['system', true, 'dark'],
    ['system', false, 'light'],
    ['light', true, 'light'],
    ['light', false, 'light'],
    ['dark', true, 'dark'],
    ['dark', false, 'dark'],
  ] as const)('%s + systemDark=%s → %s', (pref, sys, out) => {
    expect(resolveTheme(pref, sys)).toBe(out)
  })
})

describe('loadThemePref', () => {
  it('沒存過回 system', () => expect(loadThemePref(mem())).toBe('system'))
  it('讀回合法值', () => expect(loadThemePref(mem({ [THEME_KEY]: 'dark' }))).toBe('dark'))
  it('非法值回 system', () => expect(loadThemePref(mem({ [THEME_KEY]: 'blue' }))).toBe('system'))
  it('storage throw 回 system', () => expect(loadThemePref(throwing)).toBe('system'))
})

describe('saveThemePref', () => {
  it('寫入 key', () => {
    const s = mem()
    saveThemePref('light', s)
    expect(s.m.get(THEME_KEY)).toBe('light')
  })
  it('storage throw 不炸', () => expect(() => saveThemePref('dark', throwing)).not.toThrow())
})

describe('全域 localStorage 存取本身 throw（site data 被封鎖）', () => {
  let orig: PropertyDescriptor | undefined
  beforeEach(() => {
    orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
  })
  afterEach(() => {
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  })
  it('loadThemePref() 回 system', () => expect(loadThemePref()).toBe('system'))
  it('saveThemePref() 不炸', () => expect(() => saveThemePref('dark')).not.toThrow())
})

describe('nextThemePref', () => {
  it('循環 system → light → dark → system', () => {
    expect(nextThemePref('system')).toBe('light')
    expect(nextThemePref('light')).toBe('dark')
    expect(nextThemePref('dark')).toBe('system')
  })
})
