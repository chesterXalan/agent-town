import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { AdditiveBlending, DoubleSide } from 'three'
import type { Vec3 } from '@/lib/office/layout'
import { readToken } from '@/lib/office/tokens'
import { withShadows } from './Model'

const DESK = '/office/models/desk.glb'
const SCREEN = '/office/models/computerScreen.glb'
const CHAIR = '/office/models/chairDesk.glb'
const DESK_SCALE = 1.2
/** 散座的桌子在座位往人面對方向多遠（世界單位） */
export const DESK_OUT = 0.8
/**
 * 椅子在「座位框架」（原點＝人物腳下、local -z＝人面對方向、已乘 DESK_SCALE）裡的位移；原尺寸、不下沉。
 * chairDesk.glb 原點在角落、正面 +z：座墊中心 (0.1675, *, -0.183)、座墊頂 y≈0.33（底座 0.19 + 座墊 0.14）。
 * 坐姿臀在人物原點後方 0.029×1.4(FIGURE_SCALE) ≈ 0.04；椅子轉 π 面向桌子，座墊中心落在臀下：
 * x = 0.1675、z = 0.04/1.2 - 0.183 ≈ -0.15。人物坐下時由 Character 的 SEAT_LIFT 抬到座墊頂。
 */
const CHAIR_OFFSET: Vec3 = [0.1675, 0, -0.15]
// desk.glb 原點在角落（x 0..0.72、z -0.38..0.18、高 0.38）；computerScreen.glb 寬 0.39、高 0.29、正面在 z=0
const DESK_OFFSET: Vec3 = [-0.36, 0, 0.1]
const SCREEN_OFFSET: Vec3 = [-0.195, 0.38, -0.1]
/** 只放螢幕時：螢幕底部中心在 position */
const SCREEN_ONLY_OFFSET: Vec3 = [-0.195, 0, 0]
const GLOW: { pos: Vec3; size: [number, number] } = { pos: [0.195, 0.17, 0.005], size: [0.34, 0.2] }
/** 夜間工作中：螢幕前一圈 additive 光暈（不加光源，燈數才不會失控） */
const HALO: { pos: Vec3; size: [number, number]; opacity: number } = {
  pos: [0.195, 0.17, 0.02],
  size: [1.2, 0.8],
  opacity: 0.55,
}

useGLTF.preload(DESK)
useGLTF.preload(SCREEN)
useGLTF.preload(CHAIR)

/** 辦公椅，座位框架見 CHAIR_OFFSET */
function ChairModel() {
  const chair = useGLTF(CHAIR).scene
  const obj = useMemo(() => withShadows(chair.clone()), [chair])
  return <primitive object={obj} position={CHAIR_OFFSET} rotation-y={Math.PI} />
}

/** 放在人物腳下的辦公椅（plan 會議桌座位用）；rotationY 同 seatFacing，local -z 指向人面對方向 */
export function DeskChair({ position, rotationY = 0 }: { position: Vec3; rotationY?: number }) {
  return (
    <group position={position} rotation-y={rotationY} scale={DESK_SCALE}>
      <ChairModel />
    </group>
  )
}

export interface DeskProps {
  position: Vec3
  /** 螢幕亮色的 CSS token；null 不亮 */
  screenToken: string | null
  /** 只畫螢幕（放在 plan 會議桌上），不畫桌身 */
  screenOnly?: boolean
  /** rotation-y：local -z 指向坐的人面對的方向（layout 的 seatFacing） */
  rotationY?: number
  /** 0..1：夜間工作中桌子加亮（OfficeScene 傳 sky.night） */
  lamp?: number
  /** 桌子朝人那側（local +z 距 DESK_OUT）放辦公椅；screenOnly 時不放 */
  chair?: boolean
  onSelect?(): void
}

/** 辦公桌 + 螢幕（screenOnly 時只有螢幕）；未旋轉時螢幕面向 +z（坐在桌子 +z 側的人） */
export function Desk({
  position,
  screenToken,
  screenOnly = false,
  rotationY = 0,
  lamp = 0,
  chair = true,
  onSelect,
}: DeskProps) {
  const desk = useGLTF(DESK).scene
  const screen = useGLTF(SCREEN).scene
  const deskObj = useMemo(() => withShadows(desk.clone()), [desk])
  const screenObj = useMemo(() => withShadows(screen.clone()), [screen])
  const glow = useMemo(() => (screenToken ? readToken(screenToken) : null), [screenToken])

  return (
    <group
      position={position}
      rotation-y={rotationY}
      scale={DESK_SCALE}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation()
              if (event.delta <= 5) onSelect()
            }
          : undefined
      }
    >
      {!screenOnly && (
        <group scale={[1.5, 1, 1.3]}>
          <primitive object={deskObj} position={DESK_OFFSET} />
        </group>
      )}
      {!screenOnly && chair && (
        <group position={[0, 0, DESK_OUT / DESK_SCALE]}>
          <ChairModel />
        </group>
      )}
      <group position={screenOnly ? SCREEN_ONLY_OFFSET : SCREEN_OFFSET}>
        <primitive object={screenObj} />
        {glow && (
          <mesh position={GLOW.pos}>
            <planeGeometry args={GLOW.size} />
            <meshBasicMaterial color={glow} side={DoubleSide} />
          </mesh>
        )}
        {glow && lamp > 0 && (
          <mesh position={HALO.pos}>
            <planeGeometry args={HALO.size} />
            <meshBasicMaterial
              color={glow}
              side={DoubleSide}
              transparent
              opacity={HALO.opacity * lamp}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}
