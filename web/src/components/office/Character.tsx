import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimationClip, type Group, type KeyframeTrack } from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { OfficeAgent } from '../../../../shared/api'
import type { OfficeStatus } from '../../../../shared/office'
import { CLIP, seatedAnim, thinkTurn, waitingAnim, type FigureAnim } from '@/lib/office/anim'
import { appearanceOf, CHARACTER_MODELS, statusAnim, type OfficeProp } from '@/lib/office/appearance'
import type { Vec3 } from '@/lib/office/layout'
import type { CarryProp } from '@/lib/office/life'
import { gaitLean, type Emote, type Mood } from '@/lib/office/mood'
import { agentLine } from '@/lib/office/speech'
import { readToken } from '@/lib/office/tokens'
import { EmoteIcon } from './EmoteIcon'
import { withShadows } from './Model'
import { SpeechBubble, useBubble } from './SpeechBubble'

export type { FigureAnim }

const MODEL_DIR = '/office/models/'
const FIGURE_SCALE = 1.4
const PLATE = 0.7
export const HEAD_Y = 1.4
/** 台詞泡泡在頭上標籤之上 */
export const BUBBLE_Y = HEAD_Y + 0.6
/**
 * 坐姿時模型抬高多少，讓 sit clip 的臀貼上 chairDesk.glb 座墊頂（Desk.tsx CHAIR_OFFSET，椅子原尺寸不下沉）：
 * 座墊頂 0.33（底座 0.19 + 座墊 0.14）× DESK_SCALE 1.2 = 0.396；
 * sit 臀高 (腿根 0.176 − root 下移 0.15) × FIGURE_SCALE 1.4 = 0.037 → 0.396 − 0.037 ≈ 0.36
 */
const SEAT_LIFT = 0.36
/**
 * 在座位上但沒坐下（waiting、cheer／slump 等座位事件）時往桌子方向前移多少，免得腿穿過椅子：
 * 座墊中心在人物原點後方 0.04、前緣再往前約 0.11 → 前移 0.2 讓腳站到座墊前方；桌子前緣距人約 0.57、會議桌桌緣約 0.5，碰不到
 */
const STAND_FORWARD = 0.2
/** 用 sit 當全身底的動作（坐姿要抬到座墊上） */
const SITTING: ReadonlySet<FigureAnim> = new Set(['sit', 'type-left', 'type-right'])
/**
 * 坐著打字：合成 clip，root／腿／torso／head 只取 sit，手臂（rig 骨名 arm-left／arm-right）取 interact-*。
 * 合成成單一 clip 而非兩個 action 疊加：同骨兩 action 會被 mixer 平均，且 demand 下只需 play + update(0) 一次。
 */
const SEATED_TYPE: Partial<Record<FigureAnim, string>> = {
  'type-left': 'interact-left',
  'type-right': 'interact-right',
}
const seatedTypeClip = (anim: FigureAnim) => `seated-${anim}`
const isArmTrack = (t: KeyframeTrack) => t.name.startsWith('arm-')

function seatedTypeClips(animations: AnimationClip[]): AnimationClip[] {
  const sit = animations.find((c) => c.name === CLIP.sit)
  if (!sit) return []
  return Object.entries(SEATED_TYPE).flatMap(([anim, arms]) => {
    const src = animations.find((c) => c.name === arms)
    if (!src) return []
    const tracks = [...sit.tracks.filter((t) => !isArmTrack(t)), ...src.tracks.filter(isArmTrack)]
    return [new AnimationClip(seatedTypeClip(anim as FigureAnim), -1, tracks)]
  })
}

/** 打字時前傾（弧度） */
const TYPE_LEAN = 0.15
/** 垂頭時前傾（弧度） */
const SLUMP_LEAN = 0.4

/** 手持道具：位置在右手前方（人物本地座標，面向 +z） */
const HAND: Vec3 = [0.35, 0.45, 0.15]
interface PropShape {
  token: string
  box?: Vec3
  cylinder?: [number, number]
}
const PROP_SHAPE: Record<OfficeProp, PropShape> = {
  whiteboard: { token: '--card', box: [0.35, 0.25, 0.02] },
  folder: { token: '--accent', box: [0.18, 0.24, 0.03] },
  clipboard: { token: '--secondary', box: [0.16, 0.22, 0.02] },
  book: { token: '--info', box: [0.14, 0.2, 0.05] },
  extinguisher: { token: '--block', cylinder: [0.06, 0.25] },
}

/** 生活行程手持物：clipboard 沿用 PROP_SHAPE.clipboard */
const CARRY_SHAPE: Record<CarryProp, PropShape> = {
  cup: { token: '--card', cylinder: [0.05, 0.1] },
  plate: { token: '--surface-2', cylinder: [0.13, 0.02] },
  phone: { token: '--foreground', box: [0.07, 0.14, 0.02] },
  bag: { token: '--office-library', box: [0.22, 0.2, 0.08] },
  clipboard: PROP_SHAPE.clipboard,
}

for (const m of CHARACTER_MODELS) useGLTF.preload(MODEL_DIR + m)

export interface FigureProps {
  model: string
  position: Vec3
  anim: FigureAnim
  /** 已解析的顏色（readToken 的結果），畫在腳下方塊；未給不畫 */
  tint?: string
  /** 繞 y 軸的朝向（弧度）；預設 0 */
  facing?: number
  /** 模型（不含腳下色塊）抬高多少；坐椅子時用 */
  lift?: number
  onSelect?: () => void
}

/** 通用人物：同一模型多人共用時以 SkeletonUtils.clone 複製，不重新載入 */
export function Figure({ model, position, anim, tint, facing = 0, lift = 0, onSelect }: FigureProps) {
  const { scene, animations } = useGLTF(MODEL_DIR + model)
  const object = useMemo(() => {
    // 人物只投影不接影
    return withShadows(cloneSkinned(scene), true, false)
  }, [scene])
  const root = useRef<Group>(null)
  const clips = useMemo(() => [...animations, ...seatedTypeClips(animations)], [animations])
  const { actions, mixer } = useAnimations(clips, root)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const action = (SEATED_TYPE[anim] ? actions[seatedTypeClip(anim)] : actions[CLIP[anim]]) ?? actions[CLIP.idle]
    // frameloop 'demand' 下淡入淡出會停在半途：直接切 clip，推進 mixer 一次套上新姿勢，再要求重畫
    action?.reset().play()
    mixer.update(0)
    invalidate()
    return () => {
      action?.stop()
    }
  }, [actions, anim, mixer, invalidate])

  const onClick = onSelect
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect()
      }
    : undefined

  return (
    <group position={position} rotation-y={facing} onClick={onClick}>
      <group ref={root} position-y={lift} scale={FIGURE_SCALE}>
        <primitive object={object} />
      </group>
      {tint !== undefined && (
        <mesh position={[0, 0.01, 0]} receiveShadow>
          <boxGeometry args={[PLATE, 0.02, PLATE]} />
          <meshStandardMaterial color={tint} />
        </mesh>
      )}
    </group>
  )
}

/** 手持道具（job 道具或生活行程手持物），用簡單幾何體畫，顏色讀 CSS token */
function HeldProp({ shape, color }: { shape: PropShape; color: string }) {
  return (
    <mesh position={HAND}>
      {shape.cylinder ? (
        <cylinderGeometry args={[shape.cylinder[0], shape.cylinder[0], shape.cylinder[1], 12]} />
      ) : (
        <boxGeometry args={shape.box} />
      )}
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

/** 腳下 rank 色塊（同 Figure 的 tint 方塊），點擊同選取人物 */
function RankPlate({ color, forward, onSelect }: { color: string; forward: number; onSelect: () => void }) {
  return (
    <mesh
      position={[0, 0.01, forward]}
      receiveShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      <boxGeometry args={[PLATE, 0.02, PLATE]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

/** 走路時面向移動方向（模型面向本地 +z）；不走時用 facing */
function useHeading(position: Vec3, walking: boolean, facing: number): number {
  const last = useRef<Vec3>(position)
  const heading = useRef(facing)
  const dx = position[0] - last.current[0]
  const dz = position[2] - last.current[2]
  last.current = position
  if (!walking) heading.current = facing
  else if (dx !== 0 || dz !== 0) heading.current = Math.atan2(dx, dz)
  return heading.current
}

/** 沒有事件動畫時的動作與 thinking 轉頭偏角：waiting 一律站著 waitingAnim；坐著依 seatedAnim；其他站著 idle */
function restPose(status: OfficeStatus, t: number, id: string, seated: boolean): { anim: FigureAnim; turn: number } {
  if (status === 'waiting') return { anim: waitingAnim(t, id), turn: 0 }
  if (!seated) return { anim: 'idle', turn: 0 }
  return { anim: seatedAnim(status, t, id), turn: status === 'thinking' ? thinkTurn(t, id) : 0 }
}

/** 依 useFrame 的 clock.elapsedTime 推進 restPose；只在動作或偏角實際改變時 setState */
function useRestPose(
  status: OfficeStatus,
  id: string,
  seated: boolean,
  active: boolean,
): { anim: FigureAnim; turn: number } {
  const [t, setT] = useState(0)
  const pose = restPose(status, t, id, seated)
  useFrame(({ clock }) => {
    if (!active) return
    const now = clock.elapsedTime
    const next = restPose(status, now, id, seated)
    if (next.anim !== pose.anim || next.turn !== pose.turn) setT(now)
  })
  return pose
}

export interface CharacterProps {
  agent: OfficeAgent
  position: Vec3
  /** 繞 y 軸的朝向（弧度）；預設面向 -z 的辦公桌 */
  facing?: number
  /** 互動事件或生活行程的動畫（resolvePose）；走路時朝向跟著移動方向 */
  action?: FigureAnim | null
  /** 頭上顯示 !（例：所屬 plan blocked 的 lead） */
  alert?: boolean
  /** 人在自己座位上（坐姿、打字、轉頭；沒坐下時站到椅子前）；pantry 閒晃、走動與在別處的事件傳 false。預設 true */
  seated?: boolean
  /** 頭上短暫的情緒圖示，與星數／…／! 並排 */
  emote?: Emote | null
  /** 生活行程手持物；有值時取代 job 道具 */
  carry?: CarryProp | null
  /** 心情；bad 時走路多前傾 gaitLean（只在 walk 套用） */
  mood?: Mood
  /** 生活行程坐在沙發／長椅時的抬高（resolvePose 的 lift）；座位上的坐姿另用 SEAT_LIFT */
  seatLift?: number
  /** 生活行程的台詞（飲水機聊天）；有值時直接冒泡，優先於狀況台詞 */
  lifeLine?: string | null
  onSelect: () => void
}

/** agent 角色：依 job 選模型、rank 決定腳下色、頭上顯示 effort 星數、thinking 的 … 與 waiting 的 !；狀況一變冒台詞泡泡 */
export function Character({
  agent,
  position,
  facing = Math.PI,
  action = null,
  alert = false,
  seated = true,
  emote = null,
  carry = null,
  mood = 'normal',
  seatLift = 0,
  lifeLine = null,
  onSelect,
}: CharacterProps) {
  const look = appearanceOf(agent)
  const tint = useMemo(() => readToken(look.rankToken), [look.rankToken])
  const held = carry ? CARRY_SHAPE[carry] : look.prop ? PROP_SHAPE[look.prop] : null
  const propColor = useMemo(() => (held ? readToken(held.token) : null), [held])
  const pose = statusAnim(agent.status)
  const rest = useRestPose(agent.status, agent.id, seated, !action)
  const anim: FigureAnim = action ?? rest.anim
  const waiting = agent.status === 'waiting'
  const thinking = pose === 'think'
  const lean =
    (action === 'slump' ? SLUMP_LEAN : !action && seated && pose === 'type' ? TYPE_LEAN : 0) + gaitLean(mood, anim)
  const heading = useHeading(position, action === 'walk', action ? facing : facing + rest.turn)
  const sitting = !action && seated && SITTING.has(rest.anim)
  const lift = sitting ? SEAT_LIFT : seatLift
  const forward = seated && !sitting ? STAND_FORWARD : 0
  const statusLine = useBubble(agent.observedState === 'unknown' ? '尚未取得狀態' : agentLine(agent))
  const line = lifeLine ?? statusLine

  return (
    <group position={position}>
      <group rotation-y={heading}>
        {/* 模型面向本地 +z；繞本地 x 正轉即往前傾；坐著時以臀（lift 高度）為軸 */}
        <group position={[0, lift, forward]} rotation-x={lean}>
          <group position-y={-lift}>
            <Figure model={look.model} position={[0, 0, 0]} anim={anim} lift={lift} onSelect={onSelect} />
            {held && propColor && (
              <group position-y={lift}>
                <HeldProp shape={held} color={propColor} />
              </group>
            )}
          </group>
        </group>
        {/* rank 色塊在前傾群組外，人物前傾時不跟著歪 */}
        <RankPlate color={tint} forward={forward} onSelect={onSelect} />
      </group>
      {(look.stars > 0 || waiting || thinking || alert || emote) && (
        <Html position={[0, HEAD_Y, 0]} center>
          <span className="flex items-center gap-1 whitespace-nowrap">
            {look.stars > 0 && (
              <span
                className="border-2 border-border bg-card px-1 text-label text-foreground"
                aria-label={`effort ${agent.effort}`}
              >
                {'★'.repeat(look.stars)}
              </span>
            )}
            {thinking && (
              <span className="border-2 border-border bg-card px-1 text-label text-foreground" aria-label="thinking">
                …
              </span>
            )}
            {waiting && (
              <span className="border-2 border-border bg-warn px-1 text-label text-warn-fg" aria-label="waiting">
                !
              </span>
            )}
            {alert && (
              <span className="border-2 border-border bg-block px-1 text-label text-block-fg" aria-label="blocked">
                !
              </span>
            )}
            {emote && <EmoteIcon emote={emote} />}
          </span>
        </Html>
      )}
      {line && <SpeechBubble text={line} position={[0, BUBBLE_Y, 0]} />}
    </group>
  )
}
