import { buildScene, pickScene, type NpcScene, type Rng, type SceneKind } from './npc'

export const SCENE_GAP_MIN_MS = 20_000
export const SCENE_GAP_MAX_MS = 60_000
export const MAX_SCENES = 2
/** 抽到與在演情境 uses 重疊時重抽的次數；用完就跳過這一格 */
const PICK_TRIES = 4

export function nextGapMs(rng: Rng): number {
  return SCENE_GAP_MIN_MS + rng() * (SCENE_GAP_MAX_MS - SCENE_GAP_MIN_MS)
}

export interface NpcScheduler {
  setHidden(h: boolean): void
  setBusy(b: boolean): void
  /** 該段情境演完；從清單移除並在有空位時排下一段 */
  sceneDone(id: number): void
  dispose(): void
}

/** 建立時視為 hidden=false、busy=false 並開始等第一個間隔；一次只有一個計時器，有空位才計時 */
/** onScenes：目前在演的全部情境（0–2 段）；新情境的 kind 與 uses 不得與在演的重疊 */
/** gossip：開演當下的現場八卦（給聊天台詞用）；reduce：true 時不排任何情境 */
export function createNpcScheduler(opts: {
  rng: Rng
  onScenes(scenes: readonly NpcScene[]): void
  gossip?: () => string[]
  reduce?: boolean
}): NpcScheduler {
  const { rng, onScenes, gossip, reduce = false } = opts
  let hidden = false
  let busy = false
  let pending = false
  let disposed = false
  let nextId = 1
  let scenes: readonly NpcScene[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  /** 抽一段 kind 與 uses 都不和在演重疊的情境；抽不到回 null */
  const pickFree = (): NpcScene | null => {
    const kinds = new Set<SceneKind>(scenes.map((s) => s.kind))
    const used = new Set(scenes.flatMap((s) => s.uses))
    for (let i = 0; i < PICK_TRIES; i++) {
      const kind = pickScene(rng, kinds)
      if (kinds.has(kind)) return null
      const scene = buildScene(kind, rng, { gossip: gossip?.() ?? [] }, nextId)
      if (scene.uses.every((u) => !used.has(u))) return scene
    }
    return null
  }
  const start = () => {
    const scene = pickFree()
    if (scene) {
      nextId++
      scenes = [...scenes, scene]
      onScenes(scenes)
    }
    schedule()
  }
  /** 沒在計時、沒在等 busy 結束、且有空位時才開始等下一個間隔 */
  const schedule = () => {
    if (disposed || reduce || hidden || pending || timer !== null || scenes.length >= MAX_SCENES) return
    timer = setTimeout(() => {
      timer = null
      if (busy) pending = true
      else start()
    }, nextGapMs(rng))
  }

  schedule()

  return {
    setHidden(h) {
      if (disposed || h === hidden) return
      hidden = h
      if (h) {
        clear()
        pending = false
      } else schedule()
    },
    setBusy(b) {
      if (disposed) return
      busy = b
      if (!b && pending && !hidden) {
        pending = false
        start()
      }
    },
    sceneDone(id) {
      if (disposed || !scenes.some((s) => s.id === id)) return
      scenes = scenes.filter((s) => s.id !== id)
      onScenes(scenes)
      schedule()
    },
    dispose() {
      disposed = true
      clear()
      pending = false
    },
  }
}
