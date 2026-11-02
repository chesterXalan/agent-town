// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { rootVar, type RuleLike } from './tokens'

const s = (vars: Record<string, string>) => ({ getPropertyValue: (n: string) => vars[n] ?? '' })
const sheet = (...cssRules: RuleLike[]) => ({ cssRules })

describe('rootVar', () => {
  it('rootVar 讀 :root 宣告值', () => {
    const sheets = [
      sheet(
        { selectorText: ':root', style: s({ '--a': ' #112233 ' }) },
        { selectorText: '.dark', style: s({ '--a': '#000000' }) },
      ),
    ]
    expect(rootVar(sheets, '--a')).toBe('#112233')
  })

  it('rootVar 走進群組規則並展開 var()', () => {
    const sheets = [sheet({ cssRules: [{ selectorText: ':root', style: s({ '--a': '#abcdef', '--b': 'var(--a)' }) }] })]
    expect(rootVar(sheets, '--b')).toBe('#abcdef')
  })

  it('合併 selector 也算 :root', () => {
    expect(rootVar([sheet({ selectorText: ':root, :host', style: s({ '--a': '#111111' }) })], '--a')).toBe('#111111')
    expect(rootVar([sheet({ selectorText: ':root.dark', style: s({ '--a': '#111111' }) })], '--a')).toBeNull()
  })

  it('找不到回 null', () => {
    expect(rootVar([sheet({ selectorText: ':root', style: s({}) })], '--zz')).toBeNull()
    expect(rootVar([], '--a')).toBeNull()
  })
})
