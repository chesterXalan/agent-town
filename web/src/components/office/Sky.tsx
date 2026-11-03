import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Fog, type AmbientLight, type DirectionalLight, type Mesh } from 'three'
import { GRAPHICS_PROFILES } from '@/lib/graphicsQuality'
import { useGraphicsQuality } from '@/lib/graphicsQualityStore'
import type { Vec3 } from '@/lib/office/layout'
import { FLASH_MS, nextFlashAt, type Phase, type SkyState, type Weather } from '@/lib/office/sky'
import { readToken } from '@/lib/office/tokens'

/** 主光投影範圍：對街建地外緣 |x|,|z| ≤ 48 的四角離原點 48√2 ≈ 68，斜向太陽時也涵蓋，外圈雲影才落得到地面 */
const SHADOW_EXTENT = 68
/** 陰影相機深度：正交相機 near 可為負，涵蓋光源後方的外圈雲（|p| ≤ ~117）與遠側建地角落（約 60+68） */
const SHADOW_NEAR = -60
const SHADOW_FAR = 140
/** 主光離原點的距離（方向取自 sunDir／moonDir） */
const LIGHT_DIST = 60
/** 室外地面：一大片墊在室內地板（y=-0.01）下方 */
const OUTDOOR_SIZE = 800
const OUTDOOR_Y = -0.05
/** 遠景霧：起訖點跟著相機離原點的距離走，外環大樓（|p| ≤ 84）大致清楚，外圍空地與地面邊緣融進天色 */
const FOG_NEAR = 80
const FOG_FAR = 180

/** 各時段光強；夜間 hemisphere＋ambient 合計 0.6，仍看得清人物與看板 */
const HEMI: Record<Phase, number> = { dawn: 0.7, day: 0.9, dusk: 0.65, night: 0.35 }
const AMBIENT: Record<Phase, number> = { dawn: 0.3, day: 0.3, dusk: 0.3, night: 0.25 }
const DIRECT: Record<Phase, number> = { dawn: 1.2, day: 2, dusk: 1.2, night: 0.4 }

const SKY_TOKEN: Record<Phase, string> = {
  dawn: '--office-sky-dawn',
  day: '--office-sky-day',
  dusk: '--office-sky-dusk',
  night: '--office-sky-night',
}
const HEMI_TOKEN: Record<Phase, string> = {
  dawn: '--office-sky-dawn',
  day: '--office-sky',
  dusk: '--office-sky-dusk',
  night: '--office-sky-night',
}
const LIGHT_TOKEN: Record<Phase, string> = {
  dawn: '--office-sun-dawn',
  day: '--office-sun',
  dusk: '--office-sun-dusk',
  night: '--office-moon',
}

/** 天色混入陰天灰的比例、主光衰減 */
const OVERCAST: Record<Weather, number> = { clear: 0, cloudy: 0.5, rain: 0.5, storm: 0.6, snow: 0.3 }
const DIM: Record<Weather, number> = { clear: 1, cloudy: 0.6, rain: 0.55, storm: 0.5, snow: 0.75 }

/** 夜燈：各區上方（無陰影），總數 8 */
const LAMPS: Vec3[] = [
  [-16, 4, -16],
  [16, 4, -16],
  [-16, 4, 16],
  [16, 4, 16],
  [0, 4, -18],
  [0, 4, 18],
  [-18, 4, 0],
  [18, 4, 0],
]
const LAMP_INTENSITY = 30
const LAMP_DIST = 18

/** 閃光時 ambient 額外加的強度（有上限，避免光敏不適） */
const FLASH_BOOST = 1.2

/** 太陽／月亮本體：放在相機沿世界方向 dir 的遠處，像在無限遠——相機平移不動、轉頭時留在天上原處；俯瞰時多半在畫面外 */
const BODY_DIST = 90
const BODY_R = 2.6

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function mix(tokens: Record<Phase, string>, s: SkyState): Color {
  return new Color(readToken(tokens[s.from])).lerp(new Color(readToken(tokens[s.to])), s.t)
}

function CelestialBody({ dir, color }: { dir: Vec3; color: string }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ camera }) => {
    const m = ref.current
    if (!m) return
    m.position.set(
      camera.position.x + dir[0] * BODY_DIST,
      camera.position.y + dir[1] * BODY_DIST,
      camera.position.z + dir[2] * BODY_DIST,
    )
  })
  return (
    // 要做深度測試：第一人稱時牆與屋頂會擋住日月
    <mesh ref={ref}>
      <sphereGeometry args={[BODY_R, 24, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} fog={false} />
    </mesh>
  )
}

/** 晝夜與天氣的天色、光源、日月、室外地面、夜燈與雷雨閃光 */
export function Sky({ sky, weather }: { sky: SkyState; weather: Weather }) {
  const { shadowMapSize } = GRAPHICS_PROFILES[useGraphicsQuality()]
  const sunlight = useRef<DirectionalLight>(null)
  const get = useThree((s) => s.get)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    const shadow = sunlight.current?.shadow
    if (!shadow) return
    // Three.js keeps an existing shadow target when mapSize changes; release it before resizing.
    shadow.map?.dispose()
    shadow.map = null
    shadow.mapSize.set(Math.max(1, shadowMapSize), Math.max(1, shadowMapSize))
    shadow.needsUpdate = true
    invalidate()
    // Refresh a paused scene once without advancing the simulation clock.
    const frame = requestAnimationFrame(() => {
      const state = get()
      if (!document.hidden && state.frameloop === 'never') state.advance(state.clock.elapsedTime, true)
    })
    return () => cancelAnimationFrame(frame)
  }, [shadowMapSize, get, invalidate])
  const w = (r: Record<Phase, number>) => lerp(r[sky.from], r[sky.to], sky.t)

  const colors = useMemo(() => {
    const overcast = new Color(readToken('--office-overcast'))
    return {
      background: mix(SKY_TOKEN, sky).lerp(overcast, OVERCAST[weather]),
      hemi: mix(HEMI_TOKEN, sky),
      ground: readToken('--office-ground'),
      light: mix(LIGHT_TOKEN, sky),
      sun: readToken('--office-sun'),
      moon: readToken('--office-moon'),
      lamp: readToken('--office-lamp'),
      outdoor: readToken(weather === 'snow' ? '--office-snow' : '--office-outdoor'),
    }
  }, [sky, weather])

  useEffect(() => {
    const prev = scene.background
    scene.background = colors.background
    invalidate()
    return () => {
      scene.background = prev
    }
  }, [scene, colors, invalidate])

  // 霧只建一次（加／移除 fog 會讓所有材質重編譯 shader），之後只改顏色與距離
  const fog = useMemo(() => new Fog(0, FOG_NEAR, FOG_FAR), [])
  useEffect(() => {
    scene.fog = fog
    return () => {
      scene.fog = null
    }
  }, [scene, fog])
  useEffect(() => {
    fog.color.copy(colors.background)
    invalidate()
  }, [fog, colors, invalidate])
  useFrame(({ camera }) => {
    const d = camera.position.length()
    fog.near = d + FOG_NEAR
    fog.far = d + FOG_FAR
  })

  // 雷雨閃光：用 frame 時鐘排程，不用 setTimeout
  const ambient = useRef<AmbientLight>(null)
  const flash = useRef({ next: 0, until: 0 })
  const ambientBase = w(AMBIENT)
  useFrame(({ clock }) => {
    const a = ambient.current
    if (!a) return
    if (weather !== 'storm') {
      a.intensity = ambientBase
      return
    }
    const now = clock.elapsedTime * 1000
    const f = flash.current
    if (f.next === 0) f.next = nextFlashAt(now, Math.random)
    if (now >= f.next) {
      f.until = now + FLASH_MS
      f.next = nextFlashAt(now, Math.random)
    }
    a.intensity = ambientBase + (now < f.until ? FLASH_BOOST : 0)
  })

  const dir = sky.sunUp ? sky.sunDir : sky.moonDir
  const position: Vec3 = [dir[0] * LIGHT_DIST, Math.max(dir[1], 0.15) * LIGHT_DIST, dir[2] * LIGHT_DIST]

  return (
    <>
      <hemisphereLight color={colors.hemi} groundColor={colors.ground} intensity={w(HEMI)} />
      <ambientLight ref={ambient} intensity={ambientBase} />
      {/* 只有主光投影 */}
      <directionalLight
        ref={sunlight}
        color={colors.light}
        intensity={w(DIRECT) * DIM[weather]}
        position={position}
        castShadow={shadowMapSize > 0}
        shadow-bias={-0.0005}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={SHADOW_NEAR}
        shadow-camera-far={SHADOW_FAR}
      />
      {LAMPS.map((p, i) => (
        <pointLight
          key={i}
          position={p}
          color={colors.lamp}
          intensity={LAMP_INTENSITY * sky.night}
          distance={LAMP_DIST}
          decay={2}
        />
      ))}
      {sky.sunUp ? (
        <CelestialBody dir={sky.sunDir} color={colors.sun} />
      ) : (
        <CelestialBody dir={sky.moonDir} color={colors.moon} />
      )}
      <mesh rotation-x={-Math.PI / 2} position={[0, OUTDOOR_Y, 0]} receiveShadow>
        <planeGeometry args={[OUTDOOR_SIZE, OUTDOOR_SIZE]} />
        <meshStandardMaterial color={colors.outdoor} roughness={1} />
      </mesh>
    </>
  )
}
