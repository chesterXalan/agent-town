import { ATRIUM_SOFAS, COMMONS, RING_IN, TREE_R, type Vec3 } from '@/lib/office/layout'
import { Model, preloadModels } from './Model'

const S = 2
const TREE_SCALE = 4
const BENCHES = 8
/** 沙發往原點方向多遠放茶几 */
const TABLE_IN = 1.4
/** 吧台在茶水間（中庭中心）北側，客人坐北側面向大樹；離 pantrySpot ≥ 0.8，也不擋 slot 6 往北走的 x=1.15 */
const BAR_Z = -3.9
const BAR_TOP = 0.84
const MACHINE_DX = 0.2
const STOOL_DZ = -0.7
const STOOL_DX = 0.3
const CORNER = RING_IN - 0.6
/** 吧台內側（南、靠樹）的後檯：櫥櫃＋冰箱並排、背貼 BACK_Z、正面朝北；只往 -x 排，不擋 slot 6 的 x=1.15 */
const BACK_Z = -2.55
const CABINET: Vec3 = [-0.43, 0, BACK_Z - 0.45]
const FRIDGE: Vec3 = [-1.29, 0, BACK_Z - 0.29]

const FILES = [
  'tree_oak.glb',
  'benchCushion.glb',
  'loungeDesignSofa.glb',
  'tableCoffee.glb',
  'kitchenBar.glb',
  'kitchenCoffeeMachine.glb',
  'stoolBar.glb',
  'pottedPlant.glb',
  'kitchenCabinet.glb',
  'kitchenFridge.glb',
]
preloadModels(FILES)

const [CX, , CZ] = COMMONS.pantry
const at = (x: number, z: number, y = 0): Vec3 => [CX + x, y, CZ + z]

/** 中庭：大樹、環形長椅（背靠樹、面朝外）、四組沙發＋茶几、吧台與後檯（櫥櫃、冰箱）、四角盆栽；不可點擊（茶水間點擊在 CommonObject） */
export function Atrium() {
  return (
    <group>
      <Model file="tree_oak.glb" position={at(0, 0)} scale={TREE_SCALE} />
      {Array.from({ length: BENCHES }, (_, k) => {
        const a = (k * 2 * Math.PI) / BENCHES
        const x = Math.cos(a) * TREE_R
        const z = Math.sin(a) * TREE_R
        // Kenney 正面朝 local +z：轉向外
        return <Model key={k} file="benchCushion.glb" position={at(x, z)} rotationY={Math.atan2(x, z)} scale={S} />
      })}
      {ATRIUM_SOFAS.map((s, k) => {
        const [x, , z] = s.position
        const r = Math.hypot(x, z)
        const t = (r - TABLE_IN) / r
        return (
          <group key={k}>
            {/* facing 是 local -z 指向原點；Kenney 正面朝 +z，加 π */}
            <Model file="loungeDesignSofa.glb" position={at(x, z)} rotationY={s.facing + Math.PI} scale={S} />
            <Model file="tableCoffee.glb" position={at(x * t, z * t)} rotationY={s.facing} scale={S} />
          </group>
        )
      })}
      {/* 轉 π：正面朝北（客人那側） */}
      <Model file="kitchenBar.glb" position={at(0, BAR_Z)} rotationY={Math.PI} scale={S} />
      <Model file="kitchenCoffeeMachine.glb" position={at(MACHINE_DX, BAR_Z, BAR_TOP)} rotationY={Math.PI} scale={S} />
      <Model file="kitchenCabinet.glb" position={at(CABINET[0], CABINET[2])} rotationY={Math.PI} scale={S} />
      <Model file="kitchenFridge.glb" position={at(FRIDGE[0], FRIDGE[2])} rotationY={Math.PI} scale={S} />
      {[-1, 1].map((side) => (
        // 坐吧台北側，面向南（吧台）
        <Model key={side} file="stoolBar.glb" position={at(side * STOOL_DX, BAR_Z + STOOL_DZ)} scale={S} />
      ))}
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz]) => (
        <Model key={`${sx}${sz}`} file="pottedPlant.glb" position={at(sx * CORNER, sz * CORNER)} scale={S} />
      ))}
    </group>
  )
}
