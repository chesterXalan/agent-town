import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Vec3 } from '@/lib/office/layout'
import { runPoses, startRun, tickRun, type NpcPose, type NpcProp, type NpcScene, type SceneRun } from '@/lib/office/npc'
import { readToken } from '@/lib/office/tokens'
import { BUBBLE_Y, Figure, HEAD_Y } from './Character'
import { SpeechBubble } from './SpeechBubble'

/** 搬的箱子：雙手前方（人物本地座標，面向 +z） */
const BOX_AT: Vec3 = [0, 0.55, 0.3]
const BOX_SIZE: Vec3 = [0.4, 0.3, 0.35]
/** 推車在身前 0.6 */
const CART_Z = 0.6
const CART_BODY: Vec3 = [0.6, 0.3, 0.8]
const WHEEL_R = 0.08
const WHEEL_W = 0.05
const CART_BODY_Y = WHEEL_R * 2 + CART_BODY[1] / 2
const WHEELS: Vec3[] = [-1, 1].flatMap((sx) =>
  [-1, 1].map((sz): Vec3 => [sx * (CART_BODY[0] / 2), WHEEL_R, CART_Z + sz * (CART_BODY[2] / 2 - WHEEL_R)]),
)

/** 紙飛機：扁的三角錐，尖端朝 +z */
const PLANE_R = 0.14
const PLANE_L = 0.4
const PLANE_FLAT = 0.2
/** 澆水壺：右手（人物面向 +z 時是 -x）旁；蹲下時跟著放低 */
const CAN_AT: Vec3 = [-0.3, 0.5, 0.15]
const CAN_CROUCH_Y = 0.3
const CAN_R = 0.08
const CAN_H = 0.18
const SPOUT: { pos: Vec3; size: Vec3 } = { pos: [0, 0.04, CAN_R + 0.07], size: [0.03, 0.03, 0.14] }
/** 掃地機器人：扁圓盤＋頂上感應器 */
const ROBOT_R = 0.25
const ROBOT_H = 0.08
const SENSOR_R = 0.06
/**
 * 辦公椅：座墊頂 CHAIR_SEAT_TOP 與座位辦公椅（Desk.tsx 的 chairDesk × 1.2 ≈ 0.396）同高，
 * 坐下時人物抬 SIT_LIFT（同 Character 的 SEAT_LIFT）讓臀貼座墊；椅背在人物後方（local -z）。
 * 坐著時座墊中心在臀下（人物原點後方 0.04），推著走時在身前 CART_Z、椅背靠人
 */
const CHAIR_SEAT_TOP = 0.4
const CHAIR_SEAT: Vec3 = [0.45, 0.06, 0.45]
const CHAIR_BACK: { pos: Vec3; size: Vec3 } = { pos: [0, CHAIR_SEAT_TOP + 0.25, -0.2], size: [0.45, 0.45, 0.05] }
const CHAIR_POST_H = CHAIR_SEAT_TOP - CHAIR_SEAT[1] - 0.04
const CHAIR_BASE: [number, number] = [0.25, 0.04]
const CHAIR_SIT_Z = -0.04
const SIT_LIFT = 0.36

interface PropColors {
  box: string
  cart: string
  wheel: string
  paper: string
  can: string
  robot: string
  dark: string
}
/** runPoses 的結果補上已決定的朝向 */
type FacedPose = Omit<NpcPose, 'facing'> & { facing: number }

function NpcPropMesh({ prop, anim, colors }: { prop: NpcProp; anim: NpcPose['anim']; colors: PropColors }) {
  if (prop === 'plane') {
    return (
      // cone 軸向 y，轉到 +z 當機頭，再壓扁
      <mesh scale={[1, PLANE_FLAT, 1]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[PLANE_R, PLANE_L, 3]} />
        <meshStandardMaterial color={colors.paper} />
      </mesh>
    )
  }
  if (prop === 'can') {
    const y = anim === 'crouch' ? CAN_CROUCH_Y : CAN_AT[1]
    return (
      <group position={[CAN_AT[0], y, CAN_AT[2]]}>
        <mesh castShadow>
          <cylinderGeometry args={[CAN_R, CAN_R, CAN_H, 12]} />
          <meshStandardMaterial color={colors.can} />
        </mesh>
        <mesh position={SPOUT.pos}>
          <boxGeometry args={SPOUT.size} />
          <meshStandardMaterial color={colors.can} />
        </mesh>
      </group>
    )
  }
  if (prop === 'robot') {
    return (
      <>
        <mesh position={[0, ROBOT_H / 2, 0]} castShadow>
          <cylinderGeometry args={[ROBOT_R, ROBOT_R, ROBOT_H, 24]} />
          <meshStandardMaterial color={colors.robot} />
        </mesh>
        <mesh position={[0, ROBOT_H + 0.01, ROBOT_R / 2]}>
          <cylinderGeometry args={[SENSOR_R, SENSOR_R, 0.02, 12]} />
          <meshStandardMaterial color={colors.dark} />
        </mesh>
      </>
    )
  }
  if (prop === 'chair') {
    return (
      <group position-z={anim === 'sit' ? CHAIR_SIT_Z : CART_Z}>
        <mesh position={[0, CHAIR_SEAT_TOP - CHAIR_SEAT[1] / 2, 0]} castShadow>
          <boxGeometry args={CHAIR_SEAT} />
          <meshStandardMaterial color={colors.dark} />
        </mesh>
        <mesh position={CHAIR_BACK.pos} castShadow>
          <boxGeometry args={CHAIR_BACK.size} />
          <meshStandardMaterial color={colors.dark} />
        </mesh>
        <mesh position={[0, CHAIR_BASE[1] + CHAIR_POST_H / 2, 0]}>
          <cylinderGeometry args={[0.03, 0.03, CHAIR_POST_H, 8]} />
          <meshStandardMaterial color={colors.wheel} />
        </mesh>
        <mesh position={[0, CHAIR_BASE[1] / 2, 0]}>
          <cylinderGeometry args={[CHAIR_BASE[0], CHAIR_BASE[0], CHAIR_BASE[1], 12]} />
          <meshStandardMaterial color={colors.wheel} />
        </mesh>
      </group>
    )
  }
  if (prop === 'box') {
    return (
      <mesh position={BOX_AT} castShadow>
        <boxGeometry args={BOX_SIZE} />
        <meshStandardMaterial color={colors.box} />
      </mesh>
    )
  }
  return (
    <>
      <mesh position={[0, CART_BODY_Y, CART_Z]} castShadow>
        <boxGeometry args={CART_BODY} />
        <meshStandardMaterial color={colors.cart} />
      </mesh>
      {WHEELS.map((w, k) => (
        // cylinder 軸向 y，轉到 x 軸當輪子
        <mesh key={k} position={w} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[WHEEL_R, WHEEL_R, WHEEL_W, 12]} />
          <meshStandardMaterial color={colors.wheel} />
        </mesh>
      ))}
    </>
  )
}

/** 純氛圍 NPC：只演 scene 腳本（聊天台詞也在腳本裡），不讀資料、不可點、腳下無色塊；model null 只畫道具；只能放在 Canvas 內 */
export function NpcScenes({ scene, onDone }: { scene: NpcScene | null; onDone(): void }) {
  const colors = useMemo<PropColors>(
    () => ({
      box: readToken('--accent'),
      cart: readToken('--muted-foreground'),
      wheel: readToken('--border'),
      paper: readToken('--office-whiteboard'),
      can: readToken('--office-atrium'),
      robot: readToken('--office-appliance'),
      dark: readToken('--office-server'),
    }),
    [],
  )
  const run = useRef<SceneRun | null>(null)
  const done = useRef(false)
  /** 走路朝向：上一幀位置與最後朝向（只在 useFrame／effect 讀寫，不改 pose.position） */
  const heading = useRef(new Map<string, { last: Vec3; facing: number }>())
  const [poses, setPoses] = useState<FacedPose[]>([])
  const doneCb = useRef(onDone)
  doneCb.current = onDone

  /** 決定每人朝向：stay 用腳本朝向，walk 用與上一幀的位移方向，沒動就沿用 */
  const face = (ps: NpcPose[]): FacedPose[] =>
    ps.map((p) => {
      const h = heading.current.get(p.id)
      let facing = p.facing ?? h?.facing ?? 0
      if (p.facing === null && h) {
        const dx = p.position[0] - h.last[0]
        const dz = p.position[2] - h.last[2]
        if (dx !== 0 || dz !== 0) facing = Math.atan2(dx, dz)
      }
      heading.current.set(p.id, { last: p.position, facing })
      return { ...p, facing }
    })

  useEffect(() => {
    heading.current.clear()
    done.current = false
    if (!scene) {
      run.current = null
      setPoses([])
      return
    }
    run.current = startRun(scene)
    setPoses(face(runPoses(run.current)))
  }, [scene])

  useFrame((_, dt) => {
    const r = run.current
    if (!r || done.current) return
    const alive = tickRun(r, dt)
    setPoses(face(runPoses(r)))
    if (!alive) {
      done.current = true
      doneCb.current()
    }
  })

  if (!scene || poses.length === 0) return null
  return (
    <>
      {poses.map((p) => {
        const { facing } = p
        const [x, y, z] = p.position
        return (
          <group key={p.id}>
            {p.model && (
              <Figure
                model={p.model}
                position={p.position}
                anim={p.anim}
                facing={facing}
                lift={p.anim === 'sit' && p.prop === 'chair' ? SIT_LIFT : 0}
              />
            )}
            {p.prop && (
              <group position={p.position} rotation-y={facing}>
                <NpcPropMesh prop={p.prop} anim={p.anim} colors={colors} />
              </group>
            )}
            {p.bubble && p.line && <SpeechBubble text={p.line} position={[x, y + BUBBLE_Y, z]} />}
            {p.bubble && !p.line && (
              <Html position={[x, y + HEAD_Y, z]} center>
                <span className="border-2 border-border bg-card px-1 text-label text-foreground" aria-label="chatting">
                  …
                </span>
              </Html>
            )}
          </group>
        )
      })}
    </>
  )
}
