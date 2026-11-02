// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createFrameClock } from './frameClock'

describe('scene drawing budget', () => {
  it.each([60, 120, 144])('limits a %s Hz display to 30 updates per second', (hz) => {
    const step = createFrameClock()
    const drawn: number[] = []
    for (let i = 0; i < hz * 10; i++) {
      const delta = step((i * 1000) / hz)
      if (delta !== null) drawn.push(delta)
    }
    expect(drawn.length).toBe(300)
    expect(drawn.reduce((a, b) => a + b, 0)).toBeGreaterThan(9.9)
    expect(drawn.reduce((a, b) => a + b, 0)).toBeLessThan(10)
  })
  it('caps a stalled frame and resumes without trying to catch up every missed frame', () => {
    const step = createFrameClock()
    expect(step(100)).toBe(0)
    expect(step(5000)).toBe(0.1)
    expect(step(5001)).toBeNull()
    expect(step(5034)).toBeCloseTo(0.034)
  })
})
