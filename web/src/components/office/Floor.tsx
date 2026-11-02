import { Html } from '@react-three/drei'
import { useEffect, useMemo, type RefObject } from 'react'
import type { CanvasTexture } from 'three'
import type { OfficeDept } from '../../../../shared/office'
import {
  CORNER_ROOMS,
  DEPT_ORDER,
  FLOOR_D,
  FLOOR_W,
  LOBBY,
  RING_IN,
  WING_IN,
  ZONE_D,
  ZONE_W,
  zonePoint,
} from '@/lib/office/layout'
import { readToken } from '@/lib/office/tokens'
import { carpetTexture, tileTexture, woodTexture } from './floorTextures'

type Rect = { x0: number; z0: number; x1: number; z1: number }
type Kind = 'wood' | 'carpet' | 'tile'
interface Region {
  key: string
  rect: Rect
  kind: Kind
  color: string
  alt?: string
}

/** 中庭圓形地毯半徑（沙發在半徑 6，地毯包住沙發） */
const ATRIUM_RUG_R = 7.5
/** 分區地板墊在底板上方，避免 z-fighting */
const ZONE_Y = 0.002
const RUG_Y = 0.004

/** 環形走廊切成四條不重疊的帶：南北兩條含轉角，東西兩條夾在中間 */
const CORRIDOR_STRIPS: Rect[] = [
  { x0: -WING_IN, z0: -WING_IN, x1: WING_IN, z1: -RING_IN },
  { x0: -WING_IN, z0: RING_IN, x1: WING_IN, z1: WING_IN },
  { x0: -WING_IN, z0: -RING_IN, x1: -RING_IN, z1: RING_IN },
  { x0: RING_IN, z0: -RING_IN, x1: WING_IN, z1: RING_IN },
]

function zoneRect(dept: OfficeDept): Rect {
  const [ax, , az] = zonePoint(dept, -ZONE_W / 2, 0)
  const [bx, , bz] = zonePoint(dept, ZONE_W / 2, ZONE_D)
  return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) }
}

function regions(): Region[] {
  const t = readToken
  return [
    ...CORRIDOR_STRIPS.map((rect, i) => ({
      key: `corridor-${i}`,
      rect,
      kind: 'wood' as const,
      color: t('--office-corridor'),
    })),
    ...DEPT_ORDER.map((dept) => ({
      key: `dept-${dept}`,
      rect: zoneRect(dept),
      kind: 'carpet' as const,
      color: t(`--office-carpet-${dept}`),
    })),
    { key: 'lobby', rect: LOBBY, kind: 'tile', color: t('--office-lobby'), alt: t('--office-lobby-alt') },
    { key: 'room-nw', rect: CORNER_ROOMS.nw, kind: 'tile', color: t('--office-server') },
    { key: 'room-ne', rect: CORNER_ROOMS.ne, kind: 'carpet', color: t('--office-meeting') },
    { key: 'room-sw', rect: CORNER_ROOMS.sw, kind: 'wood', color: t('--office-library') },
    { key: 'room-se', rect: CORNER_ROOMS.se, kind: 'wood', color: t('--office-manager') },
  ]
}

/** 貼圖重複次數：木地板每 4 單位一張，地毯與磁磚每 2 單位一張 */
function texture(r: Region): CanvasTexture {
  const w = r.rect.x1 - r.rect.x0
  const d = r.rect.z1 - r.rect.z0
  if (r.kind === 'wood') return woodTexture(r.color, w / 4, d / 4)
  if (r.kind === 'carpet') return carpetTexture(r.color, w / 2, d / 2)
  return tileTexture(r.color, r.alt ?? r.color, w / 2, d / 2)
}

/** 地板：底板、環形走廊木地板、六部門地毯、大廳磁磚、四角房間、中庭圓毯；部門名標籤；顏色在執行期讀 CSS token */
export function Floor({
  labels,
  htmlPortal,
}: {
  labels: Partial<Record<OfficeDept, string>>
  htmlPortal: RefObject<HTMLElement>
}) {
  const tex = useMemo(() => {
    const base = tileTexture(readToken('--office-floor'), readToken('--office-floor'), FLOOR_W / 2, FLOOR_D / 2)
    const rug = carpetTexture(readToken('--office-atrium'), ATRIUM_RUG_R, ATRIUM_RUG_R)
    const zones = regions().map((r) => ({ key: r.key, rect: r.rect, map: texture(r) }))
    return { base, rug, zones }
  }, [])
  // 卸載時釋放 GPU 資源
  useEffect(
    () => () => {
      tex.base.dispose()
      tex.rug.dispose()
      for (const z of tex.zones) z.map.dispose()
    },
    [tex],
  )

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[FLOOR_W, FLOOR_D]} />
        <meshStandardMaterial map={tex.base} roughness={0.9} />
      </mesh>
      {tex.zones.map(({ key, rect, map }) => (
        <mesh
          key={key}
          rotation-x={-Math.PI / 2}
          position={[(rect.x0 + rect.x1) / 2, ZONE_Y, (rect.z0 + rect.z1) / 2]}
          receiveShadow
        >
          <planeGeometry args={[rect.x1 - rect.x0, rect.z1 - rect.z0]} />
          <meshStandardMaterial map={map} roughness={0.9} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, RUG_Y, 0]} receiveShadow>
        <circleGeometry args={[ATRIUM_RUG_R, 48]} />
        <meshStandardMaterial map={tex.rug} roughness={0.9} />
      </mesh>
      {DEPT_ORDER.filter((dept) => labels[dept]).map((dept) => (
        <Html portal={htmlPortal} key={dept} position={zonePoint(dept, 0, 8)} center>
          <span
            title={labels[dept]}
            className="inline-block max-w-28 truncate whitespace-nowrap border-2 border-border bg-card px-2 text-label text-foreground"
          >
            {labels[dept]}
          </span>
        </Html>
      ))}
    </group>
  )
}
