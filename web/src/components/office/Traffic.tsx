import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, type Group } from 'three'
import { CHARACTER_MODELS } from '@/lib/office/appearance'
import type { Vec3 } from '@/lib/office/layout'
import type { SkyState } from '@/lib/office/sky'
import {
  loopLength,
  loopPose,
  OUTER_STREET,
  OUTER_WALK_IN_LINE,
  OUTER_WALK_OUT_LINE,
  ROAD_TOP,
  seeded,
  SIDEWALK_TOP,
  squareLoop,
  STREET,
  WALK_IN_LINE,
  WALK_OUT_LINE,
} from '@/lib/office/street'
import { readToken } from '@/lib/office/tokens'
import { Figure } from './Character'

const CAR_SPEED = 6
const CARS_PER_LANE = 3
/** 外環較長（約 1.7 倍），車多一點維持密度 */
const OUTER_CARS_PER_LANE = 5
const WALK_SPEED = 1.3
const WALKERS_PER_SIDE = 4

/** 車身局部座標：車頭朝 +z（與 loopPose 的 heading 一致） */
const WHEEL_R = 0.32
const WHEEL_W = 0.25
const BODY: { pos: Vec3; size: Vec3 } = { pos: [0, WHEEL_R + 0.35, 0], size: [1.6, 0.7, 3.4] }
const CABIN: { pos: Vec3; size: Vec3 } = { pos: [0, WHEEL_R + 0.95, -0.2], size: [1.4, 0.5, 1.8] }
const WHEELS: Vec3[] = [
  [0.75, WHEEL_R, 1.1],
  [-0.75, WHEEL_R, 1.1],
  [0.75, WHEEL_R, -1.1],
  [-0.75, WHEEL_R, -1.1],
]
const HEADLIGHT_SIZE: Vec3 = [0.3, 0.15, 0.06]
const HEADLIGHTS: Vec3[] = [
  [0.5, WHEEL_R + 0.45, 1.72],
  [-0.5, WHEEL_R + 0.45, 1.72],
]
const CAR_TOKENS = ['--office-car-1', '--office-car-2', '--office-car-3', '--office-car-4']

/** 沿環移動的一員：所在環、起點（沿環距離）、速度、離地高 */
interface Mover {
  loop: Vec3[]
  length: number
  start: number
  speed: number
  y: number
}

function lane(loop: Vec3[], count: number, speed: number, y: number): Mover[] {
  const length = loopLength(loop)
  return Array.from({ length: count }, (_, k) => ({ loop, length, start: (k * length) / count, speed, y }))
}

// 內車道順時針、外車道逆時針；內外人行道方向相反
const CARS: Mover[] = [
  ...lane(squareLoop(STREET.laneIn), CARS_PER_LANE, CAR_SPEED, ROAD_TOP),
  ...lane(squareLoop(STREET.laneOut, true), CARS_PER_LANE, CAR_SPEED, ROAD_TOP),
  ...lane(squareLoop(OUTER_STREET.laneIn), OUTER_CARS_PER_LANE, CAR_SPEED, ROAD_TOP),
  ...lane(squareLoop(OUTER_STREET.laneOut, true), OUTER_CARS_PER_LANE, CAR_SPEED, ROAD_TOP),
]
const WALKERS: Mover[] = [
  ...lane(squareLoop(WALK_IN_LINE), WALKERS_PER_SIDE, WALK_SPEED, SIDEWALK_TOP),
  ...lane(squareLoop(WALK_OUT_LINE, true), WALKERS_PER_SIDE, WALK_SPEED, SIDEWALK_TOP),
  ...lane(squareLoop(OUTER_WALK_IN_LINE), WALKERS_PER_SIDE, WALK_SPEED, SIDEWALK_TOP),
  ...lane(squareLoop(OUTER_WALK_OUT_LINE, true), WALKERS_PER_SIDE, WALK_SPEED, SIDEWALK_TOP),
]
const WALKER_MODELS: string[] = (() => {
  const rng = seeded(7)
  return WALKERS.map(
    () => CHARACTER_MODELS[Math.min(CHARACTER_MODELS.length - 1, Math.floor(rng() * CHARACTER_MODELS.length))],
  )
})()

/** 時間 t 秒時的位置與朝向 */
function poseAt(m: Mover, t: number): { position: Vec3; heading: number } {
  const { position, heading } = loopPose(m.loop, m.start + m.speed * t)
  return { position: [position[0], m.y, position[2]], heading }
}

/** 依 clock 更新一組 group 的位置與朝向；moving=false 時停在 t=0 */
function useMovers(movers: Mover[], moving: boolean) {
  const refs = useRef<(Group | null)[]>([])
  useFrame(({ clock }) => {
    if (!moving) return
    const t = clock.elapsedTime
    movers.forEach((m, i) => {
      const g = refs.current[i]
      if (!g) return
      const { position, heading } = poseAt(m, t)
      g.position.set(...position)
      g.rotation.y = heading
    })
  })
  return refs
}

const START_CARS = CARS.map((m) => poseAt(m, 0))
const START_WALKERS = WALKERS.map((m) => poseAt(m, 0))

/** 街上車流（內外車道各 3 台）與人行道路人（內外各 4 位）；顏色在執行期讀 CSS token */
export function Traffic({ sky, moving }: { sky: SkyState; moving: boolean }) {
  const geo = useMemo(
    () => ({
      box: new BoxGeometry(1, 1, 1),
      wheel: new CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 12).rotateZ(Math.PI / 2),
    }),
    [],
  )
  const mats = useMemo(() => {
    const lamp = readToken('--office-lamp')
    return {
      bodies: CAR_TOKENS.map((t) => new MeshStandardMaterial({ color: readToken(t), roughness: 0.5 })),
      cabin: new MeshStandardMaterial({ color: readToken('--office-glass'), roughness: 0.2 }),
      wheel: new MeshStandardMaterial({ color: readToken('--office-road'), roughness: 0.9 }),
      headlight: new MeshStandardMaterial({ color: lamp, emissive: lamp, emissiveIntensity: 0, roughness: 0.3 }),
    }
  }, [])
  useEffect(
    () => () => {
      geo.box.dispose()
      geo.wheel.dispose()
      for (const m of [...mats.bodies, mats.cabin, mats.wheel, mats.headlight]) m.dispose()
    },
    [geo, mats],
  )
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    mats.headlight.emissiveIntensity = sky.night
    invalidate()
  }, [mats, sky.night, invalidate])
  const cars = useMovers(CARS, moving)
  const walkers = useMovers(WALKERS, moving)

  return (
    <group>
      {START_CARS.map(({ position, heading }, i) => (
        <group
          key={i}
          ref={(g) => {
            cars.current[i] = g
          }}
          position={position}
          rotation-y={heading}
        >
          <mesh
            geometry={geo.box}
            material={mats.bodies[i % mats.bodies.length]}
            position={BODY.pos}
            scale={BODY.size}
            castShadow
          />
          <mesh geometry={geo.box} material={mats.cabin} position={CABIN.pos} scale={CABIN.size} castShadow />
          {WHEELS.map((p, k) => (
            <mesh key={k} geometry={geo.wheel} material={mats.wheel} position={p} castShadow />
          ))}
          {HEADLIGHTS.map((p, k) => (
            <mesh key={k} geometry={geo.box} material={mats.headlight} position={p} scale={HEADLIGHT_SIZE} />
          ))}
        </group>
      ))}
      {/* 人物模型載入中不擋住車流與其餘場景 */}
      <Suspense fallback={null}>
        {START_WALKERS.map(({ position, heading }, i) => (
          <group
            key={i}
            ref={(g) => {
              walkers.current[i] = g
            }}
            position={position}
            rotation-y={heading}
          >
            <Figure model={WALKER_MODELS[i]} position={[0, 0, 0]} anim={moving ? 'walk' : 'idle'} />
          </group>
        ))}
      </Suspense>
    </group>
  )
}
