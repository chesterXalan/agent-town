import { CORNER_ROOMS, deptZone, DOOR, HALF, MANAGER_OFFICE, ZONE_W, type Vec3 } from '@/lib/office/layout'
import type { OfficeDept } from '../../../../shared/office'
import { Model, preloadModels } from './Model'

const S = 2
/** 靠牆家具中心離牆多遠 */
const WALL = 0.3
const W = HALF - WALL
/** 未旋轉時 Kenney 正面朝 +z；這幾個 rotation-y 讓正面朝該方向 */
const FACE = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 }

const FILES = [
  'machine.glb',
  'televisionModern.glb',
  'table.glb',
  'chair.glb',
  'pottedPlant.glb',
  'bookcaseClosedWide.glb',
  'loungeChair.glb',
  'lampRoundFloor.glb',
  'rugRound.glb',
  'rugRectangle.glb',
  'desk.glb',
  'chairDesk.glb',
  'plantSmall1.glb',
]
preloadModels(FILES)

interface Item {
  file: string
  pos: Vec3
  rot?: number
  scale?: number | Vec3
  flat?: boolean
}

/** 地毯略高於地板分區，避免 z-fighting */
const RUG_Y = 0.006

// nw 機房：機櫃兩排（北牆、南玻璃牆邊），中間走道留給 serverRoom 主機與 env-admin 站位（x -18.5～-15.5、z -17）
const RACK_SCALE = 1
const RACK_W = 1.5
const RACK_XS = [-22.9, -22.9 + RACK_W, -22.9 + 2 * RACK_W]
const server: Item[] = [
  ...RACK_XS.map((x): Item => ({ file: 'machine.glb', pos: [x, 0, -23.1], rot: Math.PI / 2, scale: RACK_SCALE })),
  ...[...RACK_XS, -22.9 + 3 * RACK_W].map((x): Item => ({
    file: 'machine.glb',
    pos: [x, 0, -14.4],
    rot: Math.PI / 2,
    scale: RACK_SCALE,
  })),
  // 監控牆：三台電視掛在北窗牆、monitorWall 上方
  ...[-17.5, -16, -14.5].map((x): Item => ({
    file: 'televisionModern.glb',
    pos: [x, 1.3, -W - 0.1],
    rot: FACE.south,
    scale: S,
  })),
]

// ne 會議室：長桌＋8 椅（長邊各 3、兩端各 1）在 meeting 白板北側，電視靠北牆
const MEET_X = 18.5
const MEET_Z = -21
const TABLE_L = 3.2
const TABLE_D = 1.4
const CHAIR_GAP = 0.4
const meeting: Item[] = [
  { file: 'table.glb', pos: [MEET_X, 0, MEET_Z], scale: [TABLE_L / 0.84, S, TABLE_D / 0.45] },
  ...[-1, 0, 1].flatMap((i): Item[] => [
    { file: 'chair.glb', pos: [MEET_X + i, 0, MEET_Z - TABLE_D / 2 - CHAIR_GAP], rot: FACE.south, scale: S },
    { file: 'chair.glb', pos: [MEET_X + i, 0, MEET_Z + TABLE_D / 2 + CHAIR_GAP], rot: FACE.north, scale: S },
  ]),
  { file: 'chair.glb', pos: [MEET_X - TABLE_L / 2 - CHAIR_GAP, 0, MEET_Z], rot: FACE.east, scale: S },
  { file: 'chair.glb', pos: [MEET_X + TABLE_L / 2 + CHAIR_GAP, 0, MEET_Z], rot: FACE.west, scale: S },
  { file: 'televisionModern.glb', pos: [MEET_X, 1.3, -W - 0.1], rot: FACE.south, scale: S },
  { file: 'pottedPlant.glb', pos: [W - 0.2, 0, CORNER_ROOMS.ne.z1 - 0.6], scale: S },
]

// sw 圖書檔案：書櫃沿西牆、南牆（避開 archive 書櫃 (-16,21)）；閱讀角在 library 與 archive 之間
const SHELF = 1.6
const library: Item[] = [
  ...[15, 15 + SHELF, 15 + 2 * SHELF, 15 + 3 * SHELF, 15 + 4 * SHELF].map((z): Item => ({
    file: 'bookcaseClosedWide.glb',
    pos: [-W, 0, z],
    rot: FACE.east,
    scale: S,
  })),
  ...[-22.4, -22.4 + SHELF, -22.4 + 2 * SHELF, -22.4 + 3 * SHELF, -22.4 + 4 * SHELF].map((x): Item => ({
    file: 'bookcaseClosedWide.glb',
    pos: [x, 0, W],
    rot: FACE.north,
    scale: S,
  })),
  { file: 'rugRound.glb', pos: [-18.5, RUG_Y, 19.3], scale: 2.5, flat: true },
  { file: 'loungeChair.glb', pos: [-19.3, 0, 19.1], rot: FACE.east, scale: S },
  { file: 'loungeChair.glb', pos: [-17.7, 0, 19.1], rot: FACE.west, scale: S },
  { file: 'lampRoundFloor.glb', pos: [-18.5, 0, 20.2], scale: S },
]

// se 主管室：主管桌在 MANAGER_OFFICE，人坐南側面向北（門的方向）；Inbox 邊桌在東側（CommonObject）
const [MX, , MZ] = MANAGER_OFFICE
const manager: Item[] = [
  { file: 'rugRectangle.glb', pos: [MX + 0.9, RUG_Y, MZ + 0.4], scale: 2.5, flat: true },
  { file: 'desk.glb', pos: [MX, 0, MZ], rot: FACE.south, scale: S },
  { file: 'chairDesk.glb', pos: [MX, 0, MZ + 1], rot: FACE.north, scale: S },
  { file: 'bookcaseClosedWide.glb', pos: [W, 0, MZ - 2.5], rot: FACE.west, scale: S },
  { file: 'pottedPlant.glb', pos: [W - 0.2, 0, W - 0.2], scale: S },
]

// 大廳：門墊與門兩側盆栽；中線 x=0、服務台排隊（counter z+1～+5）、codex-bot（審查台 +1.5）都留空
const [DX, , DZ] = DOOR
const lobby: Item[] = [
  { file: 'rugRectangle.glb', pos: [DX, RUG_Y, DZ - 0.9], scale: 1.5, flat: true },
  ...[-1, 1].map((s): Item => ({ file: 'pottedPlant.glb', pos: [DX + s * 1.8, 0, DZ - 0.5], scale: S })),
]

/** 三翼沿外牆每 PLANT_STEP 一盆；避開散座＋manager（a ∈ [-6.5, -0.6]）與部門隔板（s=0） */
const PLANT_STEP = 4
const PLANT_D = 10.6
const SEAT_A: [number, number] = [-ZONE_W / 2, -0.6]
const WINGS: [OfficeDept, OfficeDept][] = [
  ['north-west', 'north-east'],
  ['east-north', 'east-south'],
  ['west-south', 'west-north'],
]
function windowPlants(): Item[] {
  const out: Item[] = []
  for (const [first, second] of WINGS) {
    const za = deptZone(first)
    const zb = deptZone(second)
    for (let s = -3 * PLANT_STEP; s <= 3 * PLANT_STEP; s += PLANT_STEP) {
      if (s === 0) continue
      const z = s < 0 ? za : zb
      const a = s + (s < 0 ? ZONE_W / 2 : -ZONE_W / 2)
      if (a >= SEAT_A[0] && a <= SEAT_A[1]) continue
      out.push({
        file: 'plantSmall1.glb',
        pos: [z.base[0] + a * z.u[0] + PLANT_D * z.n[0], 0, z.base[2] + a * z.u[1] + PLANT_D * z.n[1]],
        scale: 4,
      })
    }
  }
  return out
}

const ITEMS: Item[] = [...server, ...meeting, ...library, ...manager, ...lobby, ...windowPlants()]

/** 四角房間、大廳與三翼窗邊的陳設；不可點擊（點擊只在 CommonObject／InboxTray） */
export function RoomDecor() {
  return (
    <group>
      {ITEMS.map((it, i) => (
        <Model
          key={i}
          file={it.file}
          position={it.pos}
          rotationY={it.rot}
          scale={it.scale ?? S}
          castShadow={!it.flat}
        />
      ))}
    </group>
  )
}
