// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/** 已收斂到 design system 的範圍；每完成一個 task 往這裡加。'*' = 全站 */
const SCOPES: string[] = ['*']

const RULES: { name: string; re: RegExp }[] = [
  { name: '圓角（radius 為 0）', re: /\brounded(?:-(?:xs|sm|md|lg|xl|2xl|3xl|full)\b|(?![-\w]))/ },
  { name: '單邊／任意圓角', re: /\brounded-(?:[tblrse]|tl|tr|bl|br|ss|se|es|ee)(?:-[\w\[]|\b)|\brounded-\[/ },
  { name: '模糊陰影', re: /(?<![\w-])shadow-(?:xs|sm|md|lg|xl|2xl)\b/ },
  { name: '寫死字級', re: /\btext-(?:xs|sm|base|lg|[2-9]?xl)\b|\btext-\[/ },
  {
    name: '半格間距',
    re: /(?<![\w-])-?(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-\d+\.5\b/,
  },
  { name: '舊字型名', re: /\bfont-(?:pixel|pixel-num|sans)\b/ },
  { name: '半透明狀態底（改用 -soft）', re: /\bbg-(?:ok|warn|block|run|info|destructive)\/\d+/ },
  { name: '請用 @/lib/utils 的 cn', re: /from ['"]cn['"]/ },
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

function inScope(rel: string): boolean {
  return SCOPES.some(
    (s) => s === '*' || rel === s || (s.endsWith('/*') ? dirname(rel) === s.slice(0, -2) : rel.startsWith(`${s}/`)),
  )
}

const files = walk(SRC)
  .map((p) => relative(SRC, p).split('\\').join('/'))
  .filter((rel) => /\.(tsx?|css)$/.test(rel) && !/\.test\.tsx?$/.test(rel) && inScope(rel))

describe('design system style lint', () => {
  it('掃描範圍內至少有一個檔', () => expect(files.length).toBeGreaterThan(0))
  it('沒有違反 design system 的 class', () => {
    const hits: string[] = []
    for (const rel of files) {
      readFileSync(join(SRC, rel), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const r of RULES) if (r.re.test(line)) hits.push(`${rel}:${i + 1} ${r.name}`)
        })
    }
    expect(hits).toEqual([])
  })
})
