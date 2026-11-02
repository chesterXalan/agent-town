import type { Vec3 } from '@/lib/office/layout'

/**
 * 鏡頭要多遠才能把整片地板放進畫面：寬度看水平視角，深度以俯角投影後看垂直視角，取較遠者。
 * polar 是相機與正上方的夾角（弧度），margin 是四周留白比例。
 */
export function fitDistance(s: {
  width: number
  depth: number
  fovDeg: number
  aspect: number
  polar: number
  margin?: number
}): number {
  const m = s.margin ?? 1.08
  const tanV = Math.tan((s.fovDeg * Math.PI) / 360)
  const byWidth = ((s.width / 2) * m) / (tanV * Math.max(s.aspect, 0.01))
  const byDepth = ((s.depth / 2) * Math.cos(s.polar) * m) / tanV
  return Math.max(byWidth, byDepth)
}

export const OFFICE_CAMERA = { position: [34, 40, 46] as Vec3, fov: 45 }

/** Fit all floor corners in perspective, including their distance from the camera. */
export function townDistance(aspect: number): number {
  const length = Math.hypot(...OFFICE_CAMERA.position)
  const [dx, dy, dz] = OFFICE_CAMERA.position.map((v) => v / length)
  const horizontal = Math.hypot(dx, dz)
  const right = [dz / horizontal, 0, -dx / horizontal]
  const up = [(-dx * dy) / horizontal, horizontal, (-dz * dy) / horizontal]
  const tanV = Math.tan((OFFICE_CAMERA.fov * Math.PI) / 360)
  let distance = 0
  for (const x of [-24, 24])
    for (const y of [0, 4])
      for (const z of [-24, 24]) {
        const depth = x * dx + y * dy + z * dz
        const px = x * right[0] + z * right[2]
        const py = x * up[0] + y * up[1] + z * up[2]
        distance = Math.max(
          distance,
          depth + (1.08 * Math.abs(px)) / (tanV * Math.max(0.1, aspect)),
          depth + (1.08 * Math.abs(py)) / tanV,
        )
      }
  return distance
}
