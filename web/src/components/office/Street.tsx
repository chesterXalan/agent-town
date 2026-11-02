import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BoxGeometry, Color, ExtrudeGeometry, MeshStandardMaterial, Object3D, Shape, type InstancedMesh } from 'three'
import type { Vec3 } from '@/lib/office/layout'
import type { SkyState } from '@/lib/office/sky'
import {
  buildingLots,
  cornerTowers,
  lightPhase,
  OUTER_LOTS,
  OUTER_STREET,
  outerTreeSpots,
  ROAD_TOP,
  seeded,
  SIDEWALK_TOP,
  STREET,
  TRAFFIC_LIGHTS,
  treeSpots,
  type Lot,
  type StreetRing,
} from '@/lib/office/street'
import { readToken } from '@/lib/office/tokens'
import { Model, preloadModels } from './Model'

preloadModels(['tree_oak.glb'])

/** 一個方塊：中心、尺寸、繞 y 旋轉 */
interface Block {
  pos: Vec3
  size: Vec3
  rotY?: number
}

/** 室外地面高；路面頂（ROAD_TOP）在其上方一點，人行道（SIDEWALK_TOP）高出路面當路緣 */
const GROUND_Y = -0.05
const MARK_H = 0.01

/** 方環帶 [a, b]：南北兩段含轉角，東西兩段夾在中間，四段不重疊 */
function ringBand([a, b]: readonly [number, number], top: number): Block[] {
  const h = top - GROUND_Y
  const y = GROUND_Y + h / 2
  const mid = (a + b) / 2
  return [
    { pos: [0, y, -mid], size: [2 * b, h, b - a] },
    { pos: [0, y, mid], size: [2 * b, h, b - a] },
    { pos: [mid, y, 0], size: [b - a, h, 2 * a] },
    { pos: [-mid, y, 0], size: [b - a, h, 2 * a] },
  ]
}

const DASH_LEN = 2
const DASH_STEP = 4
/** 斑馬線：南側 x=0，沿街寬 3，條紋 0.5 間隔 1 跨過整條馬路 */
const ZEBRA_W = 3
const ZEBRA_BAR = 0.5
const ZEBRA_PITCH = 1

/** 中線虛線畫到沿街 ±reach；zebra 時南側 x=0 加斑馬線並讓開虛線 */
function roadMarks(ring: StreetRing, reach: number, zebra: boolean): Block[] {
  const y = ROAD_TOP + MARK_H / 2
  const mid = (ring.road[0] + ring.road[1]) / 2
  const marks: Block[] = []
  for (let a = -reach; a <= reach; a += DASH_STEP) {
    marks.push({ pos: [a, y, -mid], size: [DASH_LEN, MARK_H, 0.15] })
    if (!zebra || Math.abs(a) > ZEBRA_W) marks.push({ pos: [a, y, mid], size: [DASH_LEN, MARK_H, 0.15] })
    marks.push({ pos: [mid, y, a], size: [0.15, MARK_H, DASH_LEN] })
    marks.push({ pos: [-mid, y, a], size: [0.15, MARK_H, DASH_LEN] })
  }
  if (!zebra) return marks
  const [r0, r1] = ring.road
  for (let z = r0 + ZEBRA_PITCH / 2; z < r1; z += ZEBRA_PITCH) {
    marks.push({ pos: [0, y, z], size: [ZEBRA_W, MARK_H, ZEBRA_BAR] })
  }
  return marks
}

/** 建物局部座標 (x, y, z) 轉世界座標（group 以 rotation.y = facing 旋轉） */
function toWorld(lot: Lot, [x, y, z]: Vec3): Vec3 {
  const c = Math.cos(lot.facing)
  const s = Math.sin(lot.facing)
  return [lot.center[0] + x * c + z * s, lot.center[1] + y, lot.center[2] - x * s + z * c]
}

/** 窗格：正面（局部 +z，朝馬路）每層一排、每 2.2 寬一格 */
const WIN: Vec3 = [0.9, 1.1, 0.06]
const STOREY = 2.6
const WIN_Y0 = 1.6
const WIN_PITCH = 2.2

function lotWindows(lot: Lot): Block[] {
  const [w, h, d] = lot.size
  const cols = Math.max(1, Math.floor(w / WIN_PITCH))
  const out: Block[] = []
  for (let y = WIN_Y0; y + WIN[1] / 2 < h - 0.3; y += STOREY) {
    for (let i = 0; i < cols; i++) {
      out.push({
        pos: toWorld(lot, [-w / 2 + ((i + 0.5) * w) / cols, y, d / 2 + WIN[2] / 2]),
        size: WIN,
        rotY: lot.facing,
      })
    }
  }
  return out
}

const LOTS = buildingLots(seeded(20261029))
/** 外環大樓不投影：在主光陰影範圍外，省 shadow pass */
const OUTER = [...buildingLots(seeded(20261102), OUTER_LOTS), ...cornerTowers(seeded(1102))]
const ROAD = [...ringBand(STREET.road, ROAD_TOP), ...ringBand(OUTER_STREET.road, ROAD_TOP)]
const SIDEWALKS = [STREET, OUTER_STREET].flatMap((ring) => [
  ...ringBand(ring.sidewalkIn, SIDEWALK_TOP),
  ...ringBand(ring.sidewalkOut, SIDEWALK_TOP),
])
const MARKS = [...roadMarks(STREET, 28, true), ...roadMarks(OUTER_STREET, 52, false)]
const WINDOWS = [...LOTS, ...OUTER].flatMap(lotWindows)
const TREES = [...treeSpots(), ...outerTreeSpots()]

/** 斜屋頂高 = 深度 × 比例；屋簷外挑 */
const GABLE_RATIO = 0.35
const EAVE = 0.4
const FLAT_ROOF_H = 0.3
const TREE_SCALE = 2.5

/** 紅綠燈：桿高、燈箱、三燈（紅上綠下），燈箱正面朝局部 +z（面向原點） */
const POLE_H = 3.2
const POLE_R = 0.08
const BOX: Vec3 = [0.4, 1.2, 0.3]
const BOX_Y = POLE_H + BOX[1] / 2 - 0.2
const BULB_R = 0.13
const BULB_GAP = 0.35
const BULB_DIM = 0.25
const BULB_GLOW = 1.5
type LightPhase = ReturnType<typeof lightPhase>
const BULBS: LightPhase[] = ['red', 'yellow', 'green']

/** 同一 geometry／material 的方塊合成一個 InstancedMesh */
function Blocks({
  blocks,
  geometry,
  material,
  castShadow = false,
  receiveShadow = true,
}: {
  blocks: Block[]
  geometry: BoxGeometry
  material: MeshStandardMaterial
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const o = new Object3D()
    blocks.forEach((b, i) => {
      o.position.set(...b.pos)
      o.rotation.set(0, b.rotY ?? 0, 0)
      o.scale.set(...b.size)
      o.updateMatrix()
      m.setMatrixAt(i, o.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [blocks])
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, blocks.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    />
  )
}

function Building({
  lot,
  unit,
  prism,
  wall,
  roof,
  cast = true,
}: {
  lot: Lot
  unit: BoxGeometry
  prism: ExtrudeGeometry
  wall: MeshStandardMaterial
  roof: MeshStandardMaterial
  cast?: boolean
}) {
  const [w, h, d] = lot.size
  return (
    <group position={lot.center} rotation-y={lot.facing}>
      <mesh geometry={unit} material={wall} position={[0, h / 2, 0]} scale={lot.size} castShadow={cast} receiveShadow />
      {lot.roof === 'gable' ? (
        <mesh
          geometry={prism}
          material={roof}
          position={[0, h, 0]}
          scale={[w + EAVE, d * GABLE_RATIO, d + EAVE]}
          castShadow={cast}
          receiveShadow
        />
      ) : (
        <mesh
          geometry={unit}
          material={roof}
          position={[0, h + FLAT_ROOF_H / 2, 0]}
          scale={[w + EAVE / 2, FLAT_ROOF_H, d + EAVE / 2]}
          castShadow={cast}
          receiveShadow
        />
      )}
    </group>
  )
}

/** 四角紅綠燈：燈號用 frame 時鐘算 lightPhase，只在換燈時改材質並 invalidate */
function TrafficLights({ unit, pole }: { unit: BoxGeometry; pole: MeshStandardMaterial }) {
  const invalidate = useThree((s) => s.invalidate)
  const bulbs = useMemo(() => {
    const token: Record<LightPhase, string> = {
      red: '--office-light-red',
      yellow: '--office-light-yellow',
      green: '--office-light-green',
    }
    return Object.fromEntries(
      BULBS.map((p) => {
        const base = new Color(readToken(token[p]))
        return [
          p,
          {
            base,
            mat: new MeshStandardMaterial({
              color: base.clone().multiplyScalar(BULB_DIM),
              emissive: base,
              emissiveIntensity: 0,
              roughness: 0.4,
            }),
          },
        ]
      }),
    ) as Record<LightPhase, { base: Color; mat: MeshStandardMaterial }>
  }, [])
  useEffect(
    () => () => {
      for (const b of Object.values(bulbs)) b.mat.dispose()
    },
    [bulbs],
  )
  const shown = useRef<LightPhase | null>(null)
  useFrame(({ clock }) => {
    const now = lightPhase(clock.elapsedTime)
    if (now === shown.current) return
    shown.current = now
    for (const p of BULBS) {
      const { base, mat } = bulbs[p]
      const on = p === now
      mat.color.copy(base).multiplyScalar(on ? 1 : BULB_DIM)
      mat.emissiveIntensity = on ? BULB_GLOW : 0
    }
    invalidate()
  })
  return (
    <>
      {TRAFFIC_LIGHTS.map(({ at, facing }, i) => (
        <group key={i} position={at} rotation-y={facing}>
          <mesh material={pole} position={[0, POLE_H / 2, 0]} castShadow>
            <cylinderGeometry args={[POLE_R, POLE_R, POLE_H, 8]} />
          </mesh>
          <mesh geometry={unit} material={pole} position={[0, BOX_Y, 0]} scale={BOX} castShadow />
          {BULBS.map((p, k) => (
            <mesh key={p} material={bulbs[p].mat} position={[0, BOX_Y + (1 - k) * BULB_GAP, BOX[2] / 2]}>
              <sphereGeometry args={[BULB_R, 12, 8]} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

/** 辦公室外圍街景：內外兩圈馬路、人行道、標線、對街建物（外環較高、四角高塔）、路樹與內環紅綠燈；顏色在執行期讀 CSS token */
export function Street({ sky }: { sky: SkyState }) {
  const unit = useMemo(() => new BoxGeometry(1, 1, 1), [])
  // 單位三角柱：沿 x 長 1、底寬（z）1、高 1，底面在 y=0
  const prism = useMemo(() => {
    const s = new Shape()
    s.moveTo(-0.5, 0)
    s.lineTo(0.5, 0)
    s.lineTo(0, 1)
    s.closePath()
    return new ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5).rotateY(Math.PI / 2)
  }, [])
  const mats = useMemo(() => {
    const std = (token: string) => new MeshStandardMaterial({ color: readToken(token), roughness: 0.9 })
    return {
      road: std('--office-road'),
      line: std('--office-road-line'),
      sidewalk: std('--office-sidewalk'),
      roof: std('--office-roof'),
      houses: [std('--office-house-1'), std('--office-house-2'), std('--office-house-3'), std('--office-house-4')],
      window: new MeshStandardMaterial({
        color: readToken('--office-glass'),
        emissive: readToken('--office-lamp'),
        emissiveIntensity: 0,
        roughness: 0.2,
      }),
    }
  }, [])
  useEffect(
    () => () => {
      unit.dispose()
      prism.dispose()
      for (const m of [mats.road, mats.line, mats.sidewalk, mats.roof, mats.window, ...mats.houses]) m.dispose()
    },
    [unit, prism, mats],
  )
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    mats.window.emissiveIntensity = sky.night
    invalidate()
  }, [mats, sky.night, invalidate])

  return (
    <group>
      <Blocks blocks={ROAD} geometry={unit} material={mats.road} />
      <Blocks blocks={SIDEWALKS} geometry={unit} material={mats.sidewalk} />
      <Blocks blocks={MARKS} geometry={unit} material={mats.line} />
      {LOTS.map((lot, i) => (
        <Building key={i} lot={lot} unit={unit} prism={prism} wall={mats.houses[lot.color]} roof={mats.roof} />
      ))}
      {OUTER.map((lot, i) => (
        <Building
          key={`o${i}`}
          lot={lot}
          unit={unit}
          prism={prism}
          wall={mats.houses[lot.color]}
          roof={mats.roof}
          cast={false}
        />
      ))}
      <Blocks blocks={WINDOWS} geometry={unit} material={mats.window} receiveShadow={false} />
      <TrafficLights unit={unit} pole={mats.road} />
      {/* 樹模型載入中不擋住其餘街景 */}
      <Suspense fallback={null}>
        {TREES.map((p, i) => (
          <Model key={i} file="tree_oak.glb" position={p} scale={TREE_SCALE} />
        ))}
      </Suspense>
    </group>
  )
}
