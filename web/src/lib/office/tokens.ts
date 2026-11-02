/** 類 CSSOM 的最小形狀，方便測試 */
export interface RuleLike {
  selectorText?: string
  style?: { getPropertyValue(n: string): string }
  cssRules?: ArrayLike<RuleLike>
}

const isRoot = (sel: string | undefined) => sel?.split(',').some((x) => x.trim() === ':root') ?? false

function* rootRules(rules: ArrayLike<RuleLike>): Generator<RuleLike> {
  for (const r of Array.from(rules)) {
    if (isRoot(r.selectorText)) yield r
    else if (r.cssRules) yield* rootRules(r.cssRules)
  }
}

function rawRoot(sheets: ArrayLike<{ cssRules: ArrayLike<RuleLike> }>, name: string): string | null {
  for (const sh of Array.from(sheets)) {
    let rules: ArrayLike<RuleLike>
    try {
      rules = sh.cssRules
    } catch {
      continue // 跨域樣式表讀 cssRules 會丟 SecurityError
    }
    for (const r of rootRules(rules)) {
      const v = r.style?.getPropertyValue(name).trim()
      if (v) return v
    }
  }
  return null
}

/** 在 sheets 裡找 `:root` 規則的 name 宣告值：selectorText 逗號分開任一段是 `:root` 即算；遞迴進群組規則；var(--x) 展開最多 8 層；找不到回 null */
export function rootVar(sheets: ArrayLike<{ cssRules: ArrayLike<RuleLike> }>, name: string): string | null {
  let v = rawRoot(sheets, name)
  for (let i = 0; v?.startsWith('var(--') && i < 8; i++) v = rawRoot(sheets, v.slice(4, -1).trim())
  return v
}

/** 讀 index.css 的 CSS token（例 '--office-floor'）給 3D 材質用：取 `:root`（亮色）宣告值，不隨 UI 主題變；讀不到退回 computed。程式碼不寫色碼 */
export function readToken(name: string): string {
  return (
    rootVar(document.styleSheets as unknown as ArrayLike<{ cssRules: ArrayLike<RuleLike> }>, name) ??
    getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  )
}
