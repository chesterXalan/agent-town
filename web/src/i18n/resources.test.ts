// @vitest-environment node
import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'
import { resources, translationOptions } from './resources'
import { localizeSpeech } from './speech'
import { SPEECH_KEYS } from './speech-keys'
import { NPC_JOKES } from '../lib/office/speech'
import { DEMO_SESSIONS } from '../lib/town'

const placeholders = (value: string) => [...value.matchAll(/{{([^}]+)}}/g)].map((m) => m[1]).sort()
describe('bundled translations', () => {
  it.each(['zh-TW', 'ja'] as const)('%s has all English keys and matching placeholders', (language) => {
    const english = resources.en.translation
    const translated = resources[language].translation
    expect(Object.keys(translated).sort()).toEqual(Object.keys(english).sort())
    for (const key of Object.keys(english) as (keyof typeof english)[]) {
      expect(translated[key].trim(), key).not.toBe('')
      expect(placeholders(translated[key]), key).toEqual(placeholders(english[key]))
    }
  })
  it.each(['en', 'zh-TW', 'ja'] as const)('resolves demo titles, counts, and life speech in %s', async (language) => {
    const instance = createInstance()
    await instance.init({ ...translationOptions, lng: language })
    for (const session of DEMO_SESSIONS) expect(instance.exists(session.title), session.title).toBe(true)
    for (const line of NPC_JOKES) {
      expect(SPEECH_KEYS[line], line).toBeDefined()
      expect(instance.exists(SPEECH_KEYS[line]), line).toBe(true)
    }
    expect(instance.t('campus.label', { current: 2, total: 3 })).toContain('2 / 3')
    expect(instance.t('roster.working', { count: 4 })).toContain('4')
    expect(localizeSpeech('看一下 report.md', instance.t.bind(instance))).toContain('report.md')
    expect(localizeSpeech('改 file.ts', instance.t.bind(instance))).toContain('file.ts')
  })
  it('translates an existing speech line without changing the simulation phrase', async () => {
    const instance = createInstance()
    await instance.init({ ...translationOptions, lng: 'en' })
    const line = '收工！'
    expect(localizeSpeech(line, instance.t.bind(instance))).toBe('Time for a break!')
    await instance.changeLanguage('ja')
    expect(localizeSpeech(line, instance.t.bind(instance))).toBe('ひと休み！')
    expect(localizeSpeech('LGTM', instance.t.bind(instance))).toBe('LGTM')
  })
})
