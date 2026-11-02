// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createFrameClock } from './frameClock'
import { FRAME_RATES } from './frameRate'

describe('scene drawing budget', () => {
  it.each(FRAME_RATES.flatMap((fps) => [60, 120, 144].map((hz) => ({ fps, hz }))))(
    'draws at $fps FPS on a $hz Hz display without changing simulation speed',
    ({ fps, hz }) => {
      const step = createFrameClock(fps)
      const drawn: { time: number; delta: number }[] = []
      for (let i = 0; i < hz * 10; i++) {
        const time = (i * 1000) / hz
        const delta = step(time)
        if (delta !== null) drawn.push({ time, delta })
      }
      expect(drawn.length).toBe(fps * 10)
      expect(drawn.reduce((sum, frame) => sum + frame.delta, 0)).toBeCloseTo(drawn.at(-1)!.time / 1000, 6)
    },
  )
  it('caps a stalled frame and resumes without trying to catch up every missed frame', () => {
    const step = createFrameClock(30)
    expect(step(100)).toBe(0)
    expect(step(5000)).toBe(0.25)
    expect(step(5001)).toBeNull()
    expect(step(5034)).toBeCloseTo(0.034)
  })
})
