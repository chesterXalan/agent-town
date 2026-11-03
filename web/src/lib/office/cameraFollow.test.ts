// @vitest-environment node
import { Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createCameraFollow } from './cameraFollow'
import type { Vec3 } from './layout'

function controlsAt(current: Vec3, destination: Vec3 = current) {
  const actual = new Vector3(...current)
  const end = new Vector3(...destination)
  return {
    actual,
    end,
    getTarget: (out: Vector3, receiveEndValue = true) => out.copy(receiveEndValue ? end : actual),
    moveTo: vi.fn((x: number, y: number, z: number, transition = false) => {
      end.set(x, y, z)
      if (!transition) actual.copy(end)
      return Promise.resolve()
    }),
  }
}

describe('selected resident camera', () => {
  it('eases into the initial selection rather than snapping to the resident', () => {
    const controls = controlsAt([0, 0, 0], [10, 0, 0])
    const follow = createCameraFollow()
    follow.step(controls, [10, 0, 0], 1 / 30)
    expect(controls.actual.x).toBeGreaterThan(0)
    expect(controls.actual.x).toBeLessThan(5)
    for (let i = 0; i < 60; i++) follow.step(controls, [10, 0, 0], 1 / 30)
    expect(controls.actual.x).toBeCloseTo(10, 3)
    expect(controls.moveTo.mock.calls.every((call) => call[3] === false)).toBe(true)
  })

  it.each([15, 30, 60])('keeps up with a walking resident at %s FPS', (fps) => {
    const controls = controlsAt([0, 0, 0])
    const follow = createCameraFollow()
    follow.step(controls, [0, 0, 0], 1 / fps)
    for (let i = 1; i <= fps * 5; i++) follow.step(controls, [(i / fps) * 2, 0, 0], 1 / fps)
    expect(controls.actual.x).toBeGreaterThan(9.7)
    expect(controls.actual.x).toBeLessThanOrEqual(10)
    for (let i = 0; i < fps; i++) follow.step(controls, [10, 0, 0], 1 / fps)
    expect(controls.actual.x).toBeCloseTo(10, 3)
    controls.moveTo.mockClear()
    follow.step(controls, [10, 0, 0], 1 / fps)
    expect(controls.moveTo).not.toHaveBeenCalled()
  })

  it('retains a manual pan offset as the resident moves', () => {
    const controls = controlsAt([0, 0, 0])
    const follow = createCameraFollow()
    follow.step(controls, [0, 0, 0], 1 / 30)
    controls.end.set(4, 2, -3)
    for (let i = 0; i < 60; i++) follow.step(controls, [6, 0, 2], 1 / 30)
    expect(controls.actual.toArray()).toEqual([10, 2, -1])
  })

  it('drops the previous movement and pan offset when selecting someone else', () => {
    const controls = controlsAt([4, 0, 0])
    const follow = createCameraFollow()
    follow.step(controls, [0, 0, 0], 1 / 30)
    follow.step(controls, [2, 0, 0], 1 / 30)
    follow.reset()
    controls.end.set(-10, 0, 5)
    for (let i = 0; i < 60; i++) follow.step(controls, [-10, 0, 5], 1 / 30)
    expect(controls.actual.toArray()).toEqual([-10, 0, 5])
  })

  it('supports immediate positioning without an animation frame delta', () => {
    const controls = controlsAt([0, 0, 0], [10, 0, 0])
    const follow = createCameraFollow()
    follow.step(controls, [10, 0, 0], 0, true)
    expect(controls.actual.toArray()).toEqual([10, 0, 0])
  })

  it('does not advance a paused camera and bounds the first frame after a gap', () => {
    const controls = controlsAt([0, 0, 0], [10, 0, 0])
    const follow = createCameraFollow()
    follow.step(controls, [10, 0, 0], 0)
    expect(controls.moveTo).not.toHaveBeenCalled()
    follow.step(controls, [10, 0, 0], 30)
    expect(controls.actual.x).toBeGreaterThan(0)
    expect(controls.actual.x).toBeLessThan(9)
  })
})
