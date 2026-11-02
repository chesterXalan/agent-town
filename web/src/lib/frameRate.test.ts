// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { FRAME_RATES, FRAME_RATE_KEY, loadFrameRate, saveFrameRate } from './frameRate'

describe('frame rate preference', () => {
  it.each(FRAME_RATES)('restores supported rate %s', (fps) => {
    expect(loadFrameRate({ getItem: () => String(fps) })).toBe(fps)
  })
  it.each([null, '', '0', '60', '-1', 'Infinity', 'NaN', 'bad'])(
    'defaults to 15 FPS for invalid or missing value %s',
    (value) => {
      expect(loadFrameRate({ getItem: () => value })).toBe(15)
    },
  )
  it('persists a rate and works with blocked storage', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
    }
    saveFrameRate(10, storage)
    expect(values.get(FRAME_RATE_KEY)).toBe('10')
    expect(loadFrameRate(storage)).toBe(10)
    expect(
      loadFrameRate({
        getItem: () => {
          throw new Error('Blocked')
        },
      }),
    ).toBe(15)
    expect(() =>
      saveFrameRate(15, {
        setItem: () => {
          throw new Error('Blocked')
        },
      }),
    ).not.toThrow()
  })
})
