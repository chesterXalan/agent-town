import { useEffect, useMemo } from 'react'
import { BoxGeometry, MeshStandardMaterial } from 'three'
import { DEPT_ORDER, type Vec3 } from '@/lib/office/layout'
import { COPIER, WATER_COOLER, whiteboard } from '@/lib/office/lifeSpots'
import type { NpcSpot } from '@/lib/office/npc'
import { readToken } from '@/lib/office/tokens'

type Mat = 'appliance' | 'dark' | 'water' | 'board' | 'frame'
/** 一個方塊（設施的 local 座標，正面 +z）：中心、尺寸 */
interface Part {
  pos: Vec3
  size: Vec3
  mat: Mat
}

// 飲水機：機身 0.4 見方、高 0.95，上面一桶水
const COOLER: Part[] = [
  { pos: [0, 0.475, 0], size: [0.4, 0.95, 0.4], mat: 'appliance' },
  { pos: [0, 0.75, 0.205], size: [0.16, 0.08, 0.02], mat: 'dark' },
  { pos: [0, 1.17, 0], size: [0.28, 0.44, 0.28], mat: 'water' },
]
// 影印機：機身 0.9×0.6、高 0.95，上蓋深色，正面出紙匣
const COPIER_PARTS: Part[] = [
  { pos: [0, 0.475, 0], size: [0.9, 0.95, 0.6], mat: 'appliance' },
  { pos: [0, 0.98, 0], size: [0.9, 0.06, 0.6], mat: 'dark' },
  { pos: [0.15, 0.7, 0.35], size: [0.45, 0.04, 0.1], mat: 'dark' },
]
// 白板：板面 1.6×1，下緣 0.9；兩支腳
const BOARD: Part[] = [
  { pos: [0, 1.4, 0], size: [1.6, 1, 0.04], mat: 'board' },
  { pos: [0, 1.4, -0.01], size: [1.68, 1.08, 0.03], mat: 'frame' },
  ...[-0.75, 0.75].map((x): Part => ({ pos: [x, 0.45, -0.01], size: [0.05, 0.9, 0.05], mat: 'frame' })),
]

const ITEMS: { spot: NpcSpot; parts: Part[] }[] = [
  { spot: WATER_COOLER, parts: COOLER },
  { spot: COPIER, parts: COPIER_PARTS },
  ...DEPT_ORDER.map((d) => ({ spot: whiteboard(d), parts: BOARD })),
]

/** 生活設施：飲水機、影印機、各部門白板（box geometry ＋ token 色）；不可點擊 */
export function LifeFurniture() {
  const unit = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const mats = useMemo<Record<Mat, MeshStandardMaterial>>(
    () => ({
      appliance: new MeshStandardMaterial({ color: readToken('--office-appliance'), roughness: 0.6 }),
      dark: new MeshStandardMaterial({ color: readToken('--office-server'), roughness: 0.6 }),
      water: new MeshStandardMaterial({
        color: readToken('--office-glass'),
        transparent: true,
        opacity: 0.7,
        roughness: 0.1,
      }),
      board: new MeshStandardMaterial({ color: readToken('--office-whiteboard'), roughness: 0.4 }),
      frame: new MeshStandardMaterial({ color: readToken('--office-trim'), roughness: 0.8 }),
    }),
    [],
  )
  useEffect(
    () => () => {
      unit.dispose()
      for (const m of Object.values(mats)) m.dispose()
    },
    [unit, mats],
  )

  return (
    <group>
      {ITEMS.map(({ spot, parts }, i) => (
        <group key={i} position={spot.at} rotation-y={spot.facing}>
          {parts.map((p, j) => (
            <mesh
              key={j}
              geometry={unit}
              material={mats[p.mat]}
              position={p.pos}
              scale={p.size}
              castShadow
              receiveShadow
            />
          ))}
        </group>
      ))}
    </group>
  )
}
