// @vitest-environment node
/// <reference types="node" />
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { OfficeAgent } from '../../../../shared/api'
import type { OfficeJob, OfficeRank, OfficeStatus } from '../../../../shared/office'
import { appearanceOf, statusAnim } from './appearance'

const MODELS = join(__dirname, '../../../public/office/models')
const JOBS: OfficeJob[] = ['manager', 'lead', 'engineer', 'reviewer', 'qa', 'fixer', 'researcher', 'colleague']

function agent(o: Partial<OfficeAgent> = {}): OfficeAgent {
  return {
    id: 'a',
    kind: 'subagent',
    slug: null,
    agentId: null,
    taskId: null,
    dept: 'north-west',
    job: 'engineer',
    rank: 'mid',
    effort: null,
    status: 'tool',
    verdict: null,
    model: null,
    agentType: null,
    lastTool: null,
    lastTs: null,
    projectDir: 'p',
    ...o,
  }
}

describe('appearanceOf', () => {
  it('每個 job 都有不同的人物模型，且檔案存在', () => {
    const models = JOBS.map((job) => appearanceOf(agent({ job })).model)
    expect(new Set(models).size).toBe(JOBS.length)
    for (const m of models) expect(existsSync(join(MODELS, m)), m).toBe(true)
  })

  it.each<[OfficeRank, string]>([
    ['senior', '--primary'],
    ['mid', '--ok'],
    ['junior', '--accent'],
    ['guest', '--muted-foreground'],
  ])('rank %s → %s', (rank, token) => expect(appearanceOf(agent({ rank })).rankToken).toBe(token))

  it.each<[string | null, number]>([
    ['low', 1],
    ['medium', 2],
    ['high', 3],
    ['xhigh', 4],
    ['max', 5],
    [null, 0],
  ])('effort %s → %i 星', (effort, stars) => expect(appearanceOf(agent({ effort })).stars).toBe(stars))

  it.each<[OfficeJob, string | null]>([
    ['lead', 'whiteboard'],
    ['reviewer', 'folder'],
    ['qa', 'clipboard'],
    ['fixer', 'extinguisher'],
    ['researcher', 'book'],
    ['manager', null],
    ['engineer', null],
    ['colleague', null],
  ])('job %s → prop %s', (job, prop) => expect(appearanceOf(agent({ job })).prop).toBe(prop))

  it.each<[string | null, string | null]>([
    ['sdd:go-implementer', '--run'],
    ['sdd:ts-implementer', '--warn'],
    ['go-implementer', '--run'],
    ['sdd:reviewer', null],
    [null, null],
  ])('agentType %s → screen %s', (agentType, token) =>
    expect(appearanceOf(agent({ agentType })).screenToken).toBe(token),
  )
})

describe('statusAnim', () => {
  it.each<[OfficeStatus, string]>([
    ['thinking', 'think'],
    ['tool', 'type'],
    ['replying', 'type'],
    ['waiting', 'idle'],
    ['done', 'idle'],
  ])('%s → %s', (s, anim) => expect(statusAnim(s)).toBe(anim))
})
