import { useEffect, useMemo } from 'react'
import { MeshStandardMaterial } from 'three'
import type { Vec3 } from '@/lib/office/layout'
import { readToken } from '@/lib/office/tokens'

const STAND_H = 0.7
const CAKE_H = 0.22
const CREAM_H = 0.04
const CANDLE_H = 0.14
/** 蠟燭在蛋糕頂面的 x 偏移 */
const CANDLES = [-0.1, 0, 0.1]

/** plan 完成的蛋糕：小圓桌上兩層圓柱（蛋糕體＋奶油）、三根蠟燭與火焰；簡單幾何＋token 色，不可點擊 */
export function Cake({ position }: { position: Vec3 }) {
  const mats = useMemo(
    () => ({
      stand: new MeshStandardMaterial({ color: readToken('--office-cake-stand'), roughness: 0.8 }),
      cake: new MeshStandardMaterial({ color: readToken('--office-cake'), roughness: 0.7 }),
      cream: new MeshStandardMaterial({ color: readToken('--office-cake-cream'), roughness: 0.5 }),
      candle: new MeshStandardMaterial({ color: readToken('--office-candle'), roughness: 0.6 }),
      flame: new MeshStandardMaterial({
        color: readToken('--office-flame'),
        emissive: readToken('--office-flame'),
        emissiveIntensity: 1,
      }),
    }),
    [],
  )
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats])
  const top = STAND_H + CAKE_H + CREAM_H
  return (
    <group position={position}>
      <mesh position={[0, STAND_H / 2, 0]} material={mats.stand}>
        <cylinderGeometry args={[0.35, 0.3, STAND_H, 20]} />
      </mesh>
      <mesh position={[0, STAND_H + CAKE_H / 2, 0]} material={mats.cake}>
        <cylinderGeometry args={[0.28, 0.28, CAKE_H, 24]} />
      </mesh>
      <mesh position={[0, STAND_H + CAKE_H + CREAM_H / 2, 0]} material={mats.cream}>
        <cylinderGeometry args={[0.29, 0.29, CREAM_H, 24]} />
      </mesh>
      {CANDLES.map((x) => (
        <group key={x} position={[x, top, 0]}>
          <mesh position={[0, CANDLE_H / 2, 0]} material={mats.candle}>
            <cylinderGeometry args={[0.015, 0.015, CANDLE_H, 8]} />
          </mesh>
          <mesh position={[0, CANDLE_H + 0.025, 0]} material={mats.flame}>
            <sphereGeometry args={[0.022, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
