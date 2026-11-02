// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hitsWall, slide, walkDelta, type Rect2 } from './walk'

describe('walkDelta', () => {
  it('方位角 0：前進是 -z、右移是 +x', () => {
    const [fx, fz] = walkDelta(0, 1, 0)
    expect(fx).toBeCloseTo(0)
    expect(fz).toBeCloseTo(-1)
    const [rx, rz] = walkDelta(0, 0, 1)
    expect(rx).toBeCloseTo(1)
    expect(rz).toBeCloseTo(0)
  })
  it('方位角 π/2：前進是 -x', () => {
    const [fx, fz] = walkDelta(Math.PI / 2, 1, 0)
    expect(fx).toBeCloseTo(-1)
    expect(fz).toBeCloseTo(0)
  })
})

const WALL: Rect2 = { x0: 1, z0: -5, x1: 1.2, z1: 5 }

describe('hitsWall / slide', () => {
  it('身體半徑算進碰撞', () => {
    expect(hitsWall(0.8, 0, [WALL], 0.3)).toBe(true)
    expect(hitsWall(0.6, 0, [WALL], 0.3)).toBe(false)
  })
  it('撞牆那一軸不動，另一軸照走', () => {
    expect(slide([0.6, 0], [0.5, 0.5], [WALL], 24, 0.3)).toEqual([0.6, 0.5])
  })
  it('沒有牆就照走', () => expect(slide([0, 0], [0.5, -0.5], [], 24, 0.3)).toEqual([0.5, -0.5]))
  it('不能走出地板', () => expect(slide([23, 0], [5, 0], [], 24, 0.3)).toEqual([23.7, 0]))
  it('門縫走得過：兩段牆中間留空', () => {
    const walls: Rect2[] = [
      { x0: -5, z0: 0, x1: -1, z1: 0.2 },
      { x0: 1, z0: 0, x1: 5, z1: 0.2 },
    ]
    expect(slide([0, -1], [0, 2], walls, 24, 0.3)).toEqual([0, 1])
  })
})
