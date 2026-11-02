// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { townDistance, OFFICE_CAMERA, fitDistance } from './camera'

describe('fitDistance', () => {
  const base = { width: 100, depth: 40, fovDeg: 45, polar: Math.PI / 4, margin: 1 }
  it('窄畫面由寬度決定，越窄越遠', () => {
    const narrow = fitDistance({ ...base, aspect: 1 })
    const wide = fitDistance({ ...base, aspect: 2 })
    expect(narrow).toBeCloseTo(50 / Math.tan(Math.PI / 8))
    expect(narrow).toBeGreaterThan(wide)
  })
  it('超寬畫面改由深度決定', () => {
    const d = fitDistance({ ...base, aspect: 10 })
    expect(d).toBeCloseTo((20 * Math.cos(Math.PI / 4)) / Math.tan(Math.PI / 8))
  })
  it('aspect 為 0 不會除以零', () => {
    expect(Number.isFinite(fitDistance({ ...base, aspect: 0 }))).toBe(true)
  })
})

describe('townDistance', () => {
  it.each([0.7, 1, 1.5, 2.5])('fits all corners at aspect %s', (aspect) => {
    const distance = townDistance(aspect)
    const length = Math.hypot(...OFFICE_CAMERA.position)
    const [dx, dy, dz] = OFFICE_CAMERA.position.map((v) => v / length)
    const h = Math.hypot(dx, dz)
    const tanV = Math.tan((OFFICE_CAMERA.fov * Math.PI) / 360)
    for (const x of [-24, 24])
      for (const y of [0, 4])
        for (const z of [-24, 24]) {
          const depth = distance - (x * dx + y * dy + z * dz)
          expect(Math.abs((x * dz - z * dx) / h) / (depth * tanV * aspect)).toBeLessThan(1)
          expect(Math.abs((-x * dx * dy) / h + y * h - (z * dz * dy) / h) / (depth * tanV)).toBeLessThan(1)
        }
  })
})
