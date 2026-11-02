import type { OfficeAgent } from '../../../../shared/api'
import type { OfficeDept } from '../../../../shared/office'

// 頭上泡泡台詞：員工講真實狀況（status／lastTool／verdict），NPC 講梗或現場八卦。純函式。

/** 泡泡顯示多久 */
export const BUBBLE_MS = 4000
/** 台詞上限字數（含 …） */
const MAX_LEN = 20
/** 測試跑超過這段時間算「跑好久」 */
const SLOW_TEST_MS = 3 * 60_000

const TEST_CMD = /\b(vitest|jest|pytest|go test|(pnpm|npm|yarn) (run )?test|retail-gotest)\b/
const BUILD_CMD = /\b(build|tsc|typecheck)\b/

function clip(s: string): string {
  return s.length > MAX_LEN ? `${s.slice(0, MAX_LEN - 1)}…` : s
}

const baseName = (p: string) => p.split('/').filter(Boolean).pop() ?? p

/** lastTool 是 `${name}: ${summary}` */
function toolLine(lastTool: string | null): string {
  if (!lastTool) return '做事中…'
  const i = lastTool.indexOf(': ')
  const name = i < 0 ? lastTool : lastTool.slice(0, i)
  const arg = i < 0 ? '' : lastTool.slice(i + 2).trim()
  if (name === 'Bash') {
    if (TEST_CMD.test(arg)) return '跑一下測試…'
    if (BUILD_CMD.test(arg)) return 'build 中…'
    if (/^git\b/.test(arg)) return '看一下 git'
    return '下個指令'
  }
  if (name === 'Read') return arg ? `看一下 ${baseName(arg)}` : '看一下檔案'
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name)) return arg ? `改 ${baseName(arg)}` : '改檔案'
  if (name === 'Grep' || name === 'Glob') return '找找看…'
  if (name === 'Agent' || name === 'Task') return '派人去做'
  if (name === 'WebFetch' || name === 'WebSearch') return '查資料'
  if (name === 'TodoWrite') return '排一下待辦'
  if (name === 'Skill') return '翻一下手冊'
  if (name.startsWith('mcp__')) return '問一下外部系統'
  return '做事中…'
}

/** 員工台詞；null = 不講話（thinking 保留頭上的 …） */
export function agentLine(a: Pick<OfficeAgent, 'status' | 'lastTool' | 'verdict'>): string | null {
  switch (a.status) {
    case 'thinking':
      return null
    case 'waiting':
      return '等老闆回覆'
    case 'replying':
      return '寫報告中'
    case 'done':
      return a.verdict === 'pass' ? 'LGTM' : a.verdict === 'fail' ? '這個不行，退回' : '收工！'
    case 'tool':
      return clip(toolLine(a.lastTool))
  }
}

/** NPC 聊天的 Claude Code 梗 */
export const NPC_JOKES: readonly string[] = [
  'context 只剩 5% 了…',
  '先 /compact 一下',
  'rm -rf 又被 guard 擋了',
  'hook 又噴錯',
  'opus 額度快見底',
  '--no-verify 被抓包',
  '這個 hook 誰寫的？',
  '又要我按 approve',
  'subagent 說全部 PASS',
  '測試綠了，但我不信',
  'plan 第 17 個 task 炸了',
  'CLAUDE.md 又變長了',
  '它說「應該可以了」',
  'reviewer 回 NEEDS-FIX',
  'worktree 開太多了',
  '又在跑 pnpm install',
  'Esc 按太快，白做了',
  "You're absolutely right!",
  'token 燒好快',
  '先 brainstorm 再說',
]

const DEPT_NAME = (d: OfficeDept) => (d === 'west-south' ? '隔壁' : d)

/** 現場八卦：reviewer FAIL、plan 卡住、測試跑太久；去重 */
export function officeGossip(s: {
  agents: Pick<OfficeAgent, 'dept' | 'job' | 'status' | 'verdict' | 'lastTool' | 'lastTs'>[]
  plans: { slug: string; status: string }[]
  now: number
}): string[] {
  const out = new Set<string>()
  for (const a of s.agents) {
    if (a.job === 'reviewer' && a.verdict === 'fail') out.add(`聽說 ${DEPT_NAME(a.dept)} 的 reviewer 又 FAIL 了`)
  }
  for (const p of s.plans) {
    if (p.status === 'blocked') out.add(`${p.slug} 卡住了`)
  }
  for (const a of s.agents) {
    if (a.status !== 'tool' || !a.lastTool?.startsWith('Bash: ') || !TEST_CMD.test(a.lastTool) || !a.lastTs) continue
    if (s.now - Date.parse(a.lastTs) > SLOW_TEST_MS) out.add(`${DEPT_NAME(a.dept)} 測試跑好久`)
  }
  return [...out]
}
