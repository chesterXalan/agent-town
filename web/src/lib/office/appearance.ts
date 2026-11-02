import type { OfficeAgent } from '../../../../shared/api'
import { screenLangOf, type OfficeJob, type OfficeRank, type OfficeStatus } from '../../../../shared/office'

export type OfficeProp = 'whiteboard' | 'folder' | 'clipboard' | 'extinguisher' | 'book'
export type StatusAnim = 'think' | 'type' | 'idle'

export interface Appearance {
  /** `/office/models/` 下的檔名 */
  model: string
  rankToken: string
  stars: number
  prop: OfficeProp | null
  screenToken: string | null
}

/** Kenney Mini Characters：每個 job 一個人物 */
const JOB_MODEL: Record<OfficeJob, string> = {
  manager: 'character-male-a.glb',
  lead: 'character-female-a.glb',
  engineer: 'character-male-b.glb',
  reviewer: 'character-female-b.glb',
  qa: 'character-male-c.glb',
  fixer: 'character-female-c.glb',
  researcher: 'character-male-d.glb',
  colleague: 'character-female-d.glb',
}

const RANK_TOKEN: Record<OfficeRank, string> = {
  senior: '--primary',
  mid: '--ok',
  junior: '--accent',
  guest: '--muted-foreground',
}

const EFFORT_STARS: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }

const JOB_PROP: Partial<Record<OfficeJob, OfficeProp>> = {
  lead: 'whiteboard',
  reviewer: 'folder',
  qa: 'clipboard',
  fixer: 'extinguisher',
  researcher: 'book',
}

/** 螢幕色依 implementer 語言（shared 的 screenLangOf） */
const SCREEN_TOKEN = { go: '--run', ts: '--warn' } as const

export function appearanceOf(a: OfficeAgent): Appearance {
  const lang = screenLangOf(a.agentType)
  return {
    model: a.avatarIndex === undefined ? JOB_MODEL[a.job] : CHARACTER_MODELS[a.avatarIndex % CHARACTER_MODELS.length],
    rankToken: RANK_TOKEN[a.rank],
    stars: (a.effort && EFFORT_STARS[a.effort]) || 0,
    prop: JOB_PROP[a.job] ?? null,
    screenToken: lang ? SCREEN_TOKEN[lang] : null,
  }
}

export function statusAnim(s: OfficeStatus): StatusAnim {
  switch (s) {
    case 'thinking':
      return 'think'
    case 'tool':
    case 'replying':
      return 'type'
    case 'waiting':
    case 'done':
      return 'idle'
  }
}

export const CHARACTER_MODELS = Object.values(JOB_MODEL)
