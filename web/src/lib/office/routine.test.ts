// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { routineBias, routineSlot } from './routine'

describe('routineSlot', () => {
  it('依 phase 與 hour 對照五個時段', () => {
    expect(routineSlot('dawn', 6)).toBe('morning')
    expect(routineSlot('day', 9)).toBe('work')
    expect(routineSlot('day', 11.99)).toBe('work')
    expect(routineSlot('day', 12)).toBe('lunch')
    expect(routineSlot('day', 13.99)).toBe('lunch')
    expect(routineSlot('day', 14)).toBe('work')
    expect(routineSlot('dusk', 18)).toBe('evening')
    expect(routineSlot('night', 23)).toBe('night')
  })
})

describe('routineBias', () => {
  it('night 的 roamScale 0.3，其他 1', () => {
    expect(routineBias('night').roamScale).toBe(0.3)
    for (const s of ['morning', 'work', 'lunch', 'evening'] as const) expect(routineBias(s).roamScale).toBe(1)
  })
  it('morning 偏 arrive、lunch 偏 lunch、evening 偏 stretch', () => {
    expect(routineBias('morning').weights.arrive).toBeGreaterThan(1)
    expect(routineBias('lunch').weights.lunch).toBeGreaterThan(1)
    expect(routineBias('evening').weights.stretch).toBeGreaterThan(1)
  })
})
