// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isMoveKey, isTypingTarget, panStep } from './keys'

describe('panStep', () => {
  it('沒按鍵不動', () => expect(panStep(new Set(), 50, 0.016)).toEqual({ forward: 0, right: 0 }))
  it('W 往前，速度乘時間', () => expect(panStep(new Set(['KeyW']), 30, 0.05).forward).toBeCloseTo(1.5))
  it('A 往左、D 往右', () => {
    expect(panStep(new Set(['KeyA']), 10, 0.05).right).toBeLessThan(0)
    expect(panStep(new Set(['KeyD']), 10, 0.05).right).toBeGreaterThan(0)
  })
  it('W+S 抵銷', () => expect(panStep(new Set(['KeyW', 'KeyS']), 10, 0.05)).toEqual({ forward: 0, right: 0 }))
  it('斜向總長與單向相同', () => {
    const one = panStep(new Set(['KeyW']), 10, 0.05)
    const diag = panStep(new Set(['KeyW', 'KeyD']), 10, 0.05)
    expect(Math.hypot(diag.forward, diag.right)).toBeCloseTo(one.forward)
  })
  it('dt 上限 0.1 秒', () => expect(panStep(new Set(['KeyW']), 10, 5).forward).toBeCloseTo(1))
  it('非移動鍵忽略', () => expect(panStep(new Set(['KeyQ']), 10, 0.05)).toEqual({ forward: 0, right: 0 }))
})

describe('isMoveKey / isTypingTarget', () => {
  it('只認 WASD', () => {
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD'].every(isMoveKey)).toBe(true)
    expect(isMoveKey('ArrowUp')).toBe(false)
  })
  it('輸入框是打字目標，其他不是', () => {
    expect(isTypingTarget({ tagName: 'INPUT', isContentEditable: false } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true)
    expect(isTypingTarget({ tagName: 'CANVAS', isContentEditable: false } as unknown as EventTarget)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
