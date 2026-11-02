// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { frameloopFor } from './frameloop'

describe('frameloopFor', () => {
  it('hidden → never（即使在動畫中）', () => expect(frameloopFor({ hidden: true, animating: true })).toBe('never'))
  it('animating → always', () => expect(frameloopFor({ hidden: false, animating: true })).toBe('always'))
  it('其他 → demand', () => expect(frameloopFor({ hidden: false, animating: false })).toBe('demand'))
})
