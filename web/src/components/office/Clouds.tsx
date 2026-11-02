import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, IcosahedronGeometry, MeshStandardMaterial, Vector3, type Group } from 'three'
import { cloudAt, cloudLayout, cloudX, newSightLines, opacityFor, prepareSightLines } from '@/lib/office/clouds'
import type { Weather } from '@/lib/office/sky'
import { seeded } from '@/lib/office/street'
import { readToken } from '@/lib/office/tokens'

/** 固定 seed：每次載入雲的配置相同 */
const CLOUD_SEED = 42
/** 雨／雷雨時雲色混入陰天灰的比例 */
const OVERCAST_MIX: Partial<Record<Weather, number>> = { rain: 0.5, storm: 0.5 }

/** 雲不接受點擊 */
const noRaycast = () => null
/** 淡入淡出速率（每秒），以 frame delta 指數逼近目標不透明度 */
const FADE_RATE = 6
/** 與目標差距小於此值就直接對齊，讓 opacity 真的回到 1（恢復不透明、寫深度） */
const FADE_SNAP = 0.005
/** 每幀共用暫存，不配置 */
const viewDir = new Vector3()
const sightEnd = new Vector3()
const lines = newSightLines()

/** CameraControls（makeDefault）的相機到 target 距離；取不到回 undefined */
const controlsDistance = (c: unknown): number | undefined => {
  const d = (c as { distance?: unknown } | null)?.distance
  return typeof d === 'number' ? d : undefined
}

function CloudLayer({ weather, moving }: { weather: Weather; moving: boolean }) {
  const clouds = useMemo(() => cloudLayout(weather, seeded(CLOUD_SEED)), [weather])
  const geo = useMemo(() => new IcosahedronGeometry(1, 0), [])
  const params = useMemo(() => {
    const color = new Color(readToken('--office-cloud'))
    const mix = OVERCAST_MIX[weather]
    if (mix) color.lerp(new Color(readToken('--office-overcast')), mix)
    return { color, flatShading: true, roughness: 1, transparent: true }
  }, [weather])
  // 每朵雲各自一份材質，才能各自淡出；不動 visible，shadow pass 照樣畫雲影
  const mats = useMemo(() => clouds.map(() => new MeshStandardMaterial(params)), [clouds, params])
  useEffect(() => () => geo.dispose(), [geo])
  useEffect(
    () => () => {
      for (const m of mats) m.dispose()
    },
    [mats],
  )
  const refs = useRef<(Group | null)[]>([])
  /** 已對齊過的材質組；所有雲的 group 與材質都在且已直接設到目標後才標記，之前每幀都直接設，免得遮擋的雲先完整畫出再淡掉 */
  const primed = useRef<MeshStandardMaterial[] | null>(null)
  // 靜止（reduced-motion／demand）時也每次渲染做遮擋判斷，但直接設到目標值，不靠多幀逼近
  useFrame(({ clock, camera, controls }, delta) => {
    const t = clock.elapsedTime
    // 相機實際視線（含 focal offset）：沿視線方向走 controls 距離（取不到用相機到原點距離）；第一人稱距離 < 1 只做近相機判斷
    const viewDist = controlsDistance(controls) ?? camera.position.length()
    camera.getWorldDirection(viewDir)
    sightEnd.copy(camera.position).addScaledVector(viewDir, viewDist)
    prepareSightLines(lines, camera.position, sightEnd, viewDist)
    const snap = !moving || primed.current !== mats
    const k = snap ? 1 : 1 - Math.exp(-FADE_RATE * delta)
    let ready = true
    clouds.forEach((c, i) => {
      const g = refs.current[i]
      const m = mats[i]
      if (!g || !m) {
        ready = false
        return
      }
      if (moving) g.position.x = cloudX(c, t)
      const goal = opacityFor(g.position, lines)
      m.opacity = Math.abs(goal - m.opacity) < FADE_SNAP ? goal : m.opacity + (goal - m.opacity) * k
      // transparent 恆為 true（避免翻轉觸發 shader 重編譯），只依 opacity 切深度寫入
      m.depthWrite = m.opacity >= 1
    })
    if (snap && ready) primed.current = mats
  })

  return (
    <group>
      {clouds.map((c, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g
          }}
          position={cloudAt(c, 0)}
          scale={c.scale}
        >
          {c.puffs.map((p, k) => (
            <mesh
              key={k}
              geometry={geo}
              material={mats[i]}
              position={p.offset}
              scale={p.r}
              castShadow
              raycast={noRaycast}
            />
          ))}
        </group>
      ))}
    </group>
  )
}

/** 外圈天空的白雲：飄移、投影到地面；天氣變了整層重建 */
export function Clouds({ weather, moving }: { weather: Weather; moving: boolean }) {
  return <CloudLayer key={weather} weather={weather} moving={moving} />
}
