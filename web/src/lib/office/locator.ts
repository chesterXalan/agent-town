import type { OfficeAgent } from '../../../../shared/api'
import type { OfficeLocator } from './eventQueue'
import { COMMONS, patrolSpot, reviewSpot, seatPosition, type SeatMap, type Vec3 } from './layout'
import { roamOf } from './life'
import { MAX_ACTIVE, type LifePose } from './lifeRun'
import { ringPath } from './path'
import { agentHome } from './resolvePose'

/** 開會站位：COMMONS.meeting 周圍半徑 */
const MEETING_R = 1.6
/** 圍蛋糕站位：COMMONS.pantry 周圍半徑；起始角 7.5° 讓六點都落在環形長椅之間，北側兩點也離吧台後檯 ≥ 0.5 */
const CAKE_R = 2.2
const CAKE_PHASE = Math.PI / 24
/** c 周圍半徑 r 平均分佈 6 點的第 k 點 */
function ringSpot(c: Vec3, r: number, phase: number, k: number): Vec3 {
  const a = phase + (((k % 6) + 6) % 6) * (Math.PI / 3)
  return [c[0] + Math.cos(a) * r, 0, c[2] + Math.sin(a) * r]
}

/** locator 透過 ref 讀當下的 agents、生活位置與事件佇列（hook 互相依賴，不放進 useMemo 依賴） */
export interface LocatorLive {
  agents: { readonly current: readonly OfficeAgent[] }
  life: { readonly current: { poseOf(id: string): LifePose | null } }
  events: { readonly current: { busyOf(id: string): boolean } }
  reduce: boolean
}

export function makeLocator(seats: SeatMap, live: LocatorLive): OfficeLocator {
  const seatOf = (id: string) => {
    const seat = seats.get(id)
    return seat ? seatPosition(seat) : null
  }
  return {
    seatOf,
    route: ringPath,
    reviewSpot(id) {
      const seat = seats.get(id)
      return seat ? reviewSpot(seat) : null
    },
    patrolRoute(slug) {
      return [...seats.values()]
        .filter((s) => s.group === slug)
        .sort((a, b) => a.index - b.index)
        .map(patrolSpot)
    },
    currentOf(id) {
      const life = live.life.current.poseOf(id)?.position
      if (life) return life
      const seat = seats.get(id)
      const agent = live.agents.current.find((a) => a.id === id)
      // 做完的 session 畫在 pantry：從那裡出發，不先瞬移到桌子
      return seat && agent ? agentHome(agent, seat).home : seatOf(id)
    },
    idleIds(among) {
      if (live.reduce) return []
      const busy = live.events.current
      const only = among ? new Set(among) : null
      return live.agents.current
        .filter(
          (a) => (!only || only.has(a.id)) && seats.has(a.id) && roamOf(a.status) !== 'none' && !busy.busyOf(a.id),
        )
        .slice(0, MAX_ACTIVE)
        .map((a) => a.id)
    },
    membersOf(slug) {
      return live.agents.current.filter((a) => a.slug === slug && seats.has(a.id)).map((a) => a.id)
    },
    meetingSpot: (k) => ringSpot(COMMONS.meeting, MEETING_R, 0, k),
    cakeSpot: (k) => ringSpot(COMMONS.pantry, CAKE_R, CAKE_PHASE, k),
  }
}
