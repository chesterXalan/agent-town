// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { OfficeAgent } from '../../../../shared/api'
import { agentLine, NPC_JOKES, officeGossip } from './speech'

const tool = (lastTool: string | null) => agentLine({ status: 'tool', lastTool, verdict: null })

describe('agentLine', () => {
  it.each([
    ['Bash: pnpm test', '跑一下測試…'],
    ['Bash: npx vitest run src/auth', '跑一下測試…'],
    ['Bash: go test ./...', '跑一下測試…'],
    ['Bash: pnpm build', 'build 中…'],
    ['Bash: git status', '看一下 git'],
    ['Bash: ls', '下個指令'],
    ['Read: /a/b/npc.ts', '看一下 npc.ts'],
    ['Edit: /a/speech.ts', '改 speech.ts'],
    ['Write: /a/x.md', '改 x.md'],
    ['Grep: bubble', '找找看…'],
    ['Agent: review task 3', '派人去做'],
    ['WebSearch: vitest', '查資料'],
    ['mcp__gitea__get_me: ', '問一下外部系統'],
    ['Unknown: x', '做事中…'],
  ])('%s → %s', (lastTool, line) => {
    expect(tool(lastTool)).toBe(line)
  })

  it('沒有 lastTool 也有台詞', () => {
    expect(tool(null)).toBe('做事中…')
  })

  it('長檔名截斷到 20 字', () => {
    const line = tool('Read: /a/a-very-long-file-name-for-testing.ts')!
    expect(line).toHaveLength(20)
    expect(line.endsWith('…')).toBe(true)
  })

  it('依 status／verdict', () => {
    expect(agentLine({ status: 'thinking', lastTool: 'Bash: ls', verdict: null })).toBeNull()
    expect(agentLine({ status: 'waiting', lastTool: null, verdict: null })).toBe('等老闆回覆')
    expect(agentLine({ status: 'replying', lastTool: null, verdict: null })).toBe('寫報告中')
    expect(agentLine({ status: 'done', lastTool: null, verdict: 'pass' })).toBe('LGTM')
    expect(agentLine({ status: 'done', lastTool: null, verdict: 'fail' })).toBe('這個不行，退回')
    expect(agentLine({ status: 'done', lastTool: null, verdict: null })).toBe('收工！')
  })
})

describe('NPC_JOKES', () => {
  it('不重複、不空', () => {
    expect(NPC_JOKES.length).toBeGreaterThanOrEqual(20)
    expect(new Set(NPC_JOKES).size).toBe(NPC_JOKES.length)
  })
})

describe('officeGossip', () => {
  const now = Date.parse('2026-10-27T10:00:00Z')
  const agent = (o: Partial<OfficeAgent>): OfficeAgent =>
    ({
      dept: 'east-south',
      job: 'engineer',
      status: 'tool',
      verdict: null,
      lastTool: null,
      lastTs: null,
      ...o,
    }) as OfficeAgent

  it('reviewer FAIL、plan blocked、測試跑超過 3 分鐘；去重', () => {
    const g = officeGossip({
      agents: [
        agent({ job: 'reviewer', status: 'done', verdict: 'fail' }),
        agent({ job: 'reviewer', status: 'done', verdict: 'fail' }),
        agent({ dept: 'west-south', job: 'reviewer', status: 'done', verdict: 'fail' }),
        agent({ dept: 'north-west', lastTool: 'Bash: pnpm test', lastTs: '2026-10-27T09:56:00Z' }),
      ],
      plans: [
        { slug: 'retail-foo', status: 'blocked' },
        { slug: 'ok', status: 'in_progress' },
      ],
      now,
    })
    expect(g).toEqual([
      '聽說 east-south 的 reviewer 又 FAIL 了',
      '聽說 隔壁 的 reviewer 又 FAIL 了',
      'retail-foo 卡住了',
      'north-west 測試跑好久',
    ])
  })

  it('測試剛開始、非測試指令、非 tool 狀態不算', () => {
    const g = officeGossip({
      agents: [
        agent({ lastTool: 'Bash: pnpm test', lastTs: '2026-10-27T09:58:00Z' }),
        agent({ lastTool: 'Bash: sleep 999', lastTs: '2026-10-27T09:00:00Z' }),
        agent({ status: 'thinking', lastTool: 'Bash: pnpm test', lastTs: '2026-10-27T09:00:00Z' }),
        agent({ job: 'reviewer', status: 'done', verdict: 'pass' }),
      ],
      plans: [],
      now,
    })
    expect(g).toEqual([])
  })
})
