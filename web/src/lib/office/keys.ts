/** WASD 對應的平移方向：forward 為鏡頭朝向（貼地），right 為鏡頭右手邊 */
const MOVE: Record<string, { forward: number; right: number }> = {
  KeyW: { forward: 1, right: 0 },
  KeyS: { forward: -1, right: 0 },
  KeyA: { forward: 0, right: -1 },
  KeyD: { forward: 0, right: 1 },
}

export function isMoveKey(code: string): boolean {
  return code in MOVE
}

/** 每秒平移量相對鏡頭距離的比例：拉越遠走越快 */
export const PAN_SPEED = 0.6
/** 掉幀時單次最多推進的秒數，避免一下跳很遠 */
const MAX_DT = 0.1

/** 按住的鍵 → 這一幀要平移多少（speed 為每秒單位）；斜向不加速 */
export function panStep(held: ReadonlySet<string>, speed: number, dt: number): { forward: number; right: number } {
  let f = 0
  let r = 0
  for (const code of held) {
    const m = MOVE[code]
    if (m) {
      f += m.forward
      r += m.right
    }
  }
  const len = Math.hypot(f, r)
  if (len === 0) return { forward: 0, right: 0 }
  const step = (speed * Math.min(dt, MAX_DT)) / len
  return { forward: f * step, right: r * step }
}

/** 焦點在輸入框（找人面板的搜尋等）時不攔按鍵 */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!el || typeof (el as HTMLElement).tagName !== 'string') return false
  const h = el as HTMLElement
  return h.isContentEditable || h.tagName === 'INPUT' || h.tagName === 'TEXTAREA' || h.tagName === 'SELECT'
}
