import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OfficeAgent } from '../../../../shared/api'
import type { OfficeStatus } from '../../../../shared/office'
import type { EventPose } from '@/lib/office/eventQueue'
import type { OfficeEvent } from '@/lib/office/events'
import type { SeatMap, Vec3 } from '@/lib/office/layout'
import { roamOf } from '@/lib/office/life'
import {
  activeCount,
  createLife,
  lifePose,
  tickLife,
  type AgentLife,
  type LifeAgentInput,
  type LifePose,
} from '@/lib/office/lifeRun'
import {
  causeEmote,
  emoteVisible,
  gaitSpeed,
  markMood,
  moodAt,
  type Emote,
  type Mood,
  type MoodCause,
  type MoodMark,
} from '@/lib/office/mood'
import { ringPath } from '@/lib/office/path'
import { agentHome } from '@/lib/office/resolvePose'
import { routineBias, routineSlot } from '@/lib/office/routine'
import type { SkyState } from '@/lib/office/sky'
import { seeded } from '@/lib/office/street'

/** 單幀最多推進秒數（分頁切回或 demand 久未重繪時 delta 很大） */
const MAX_FRAME = 0.25

const WORK: ReadonlySet<OfficeStatus> = new Set(['tool', 'replying'])

interface EmoteMark {
  emote: Emote
  at: number
}

const samePoint = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]) < 1e-3

/** 事件播完時人不在 home：從事件留下的位置走回 home（已中斷：不補需求、不再被中斷改道） */
function walkHomeRun(from: Vec3, home: Vec3, homeFacing: number): NonNullable<AgentLife['run']> {
  return {
    kind: 'stretch',
    steps: [{ kind: 'move', path: ringPath(from, home) }],
    i: 0,
    seg: 0,
    t: 0,
    facility: null,
    slot: -1,
    interrupted: true,
    carry: null,
    home,
    homeFacing,
  }
}

export interface AgentLifeOptions {
  agents: OfficeAgent[]
  seats: SeatMap
  events: OfficeEvent[]
  sky: SkyState
  hour: number
  reduce: boolean
  eventBusy(id: string): boolean
  eventPoseOf(id: string): EventPose
}

/**
 * agent 自主生活：useFrame 推進 tickLife，另記心情與短暫情緒圖示（時間皆為 life clock 秒）。
 * reduce 時不跑行程、poseOf 恆 null、心情恆 normal；事件帶出的情緒圖示照常顯示。只能在 Canvas 內呼叫。
 * 事件接手行程中的 agent：中止行程、釋出設施站位（事件從生活位置出發）；事件播完人不在 home 就從那裡走回去，不瞬移。
 */
export function useAgentLife(o: AgentLifeOptions): {
  animating: boolean
  poseOf(id: string): LifePose | null
  moodOf(id: string): Mood
  emoteOf(id: string): Emote | null
} {
  const latest = useRef(o)
  latest.current = o
  const life = useRef(createLife())
  const rng = useRef(seeded(Date.now()))
  const moods = useRef(new Map<string, MoodMark>())
  const emotes = useRef(new Map<string, EmoteMark>())
  const shown = useRef(0)
  /** 事件中的 agent 最近一幀所在位置（事件姿勢沒位置就是 home） */
  const eventAt = useRef(new Map<string, Vec3>())
  const [animating, setAnimating] = useState(false)
  const [, setTick] = useState(0)
  const invalidate = useThree((s) => s.invalidate)

  const showEmote = useCallback(
    (id: string, emote: Emote) => {
      emotes.current.set(id, { emote, at: life.current.clock })
      setTick((n) => n + 1)
      invalidate()
    },
    [invalidate],
  )
  const mark = useCallback(
    (id: string, cause: MoodCause) => {
      moods.current.set(id, markMood(cause, life.current.clock))
      showEmote(id, causeEmote(cause))
    },
    [showEmote],
  )

  // thinking → tool／replying：想到了；離場的 agent 清掉心情與圖示
  const prevStatus = useRef(new Map<string, OfficeStatus>())
  useEffect(() => {
    const next = new Map<string, OfficeStatus>()
    for (const a of o.agents) {
      if (prevStatus.current.get(a.id) === 'thinking' && WORK.has(a.status)) showEmote(a.id, 'idea')
      next.set(a.id, a.status)
    }
    prevStatus.current = next
    for (const id of [...moods.current.keys()]) if (!next.has(id)) moods.current.delete(id)
    for (const id of [...emotes.current.keys()]) if (!next.has(id)) emotes.current.delete(id)
    for (const id of [...eventAt.current.keys()]) if (!next.has(id)) eventAt.current.delete(id)
  }, [o.agents, showEmote])

  useEffect(() => {
    for (const e of o.events) {
      if (e.kind === 'review-end') mark(e.targetId, e.outcome)
      else if (e.kind === 'blocked') {
        for (const a of latest.current.agents) if (a.job === 'lead' && a.slug === e.slug) mark(a.id, 'blocked')
      } else if (e.kind === 'plan-complete') {
        const { agents, seats } = latest.current
        for (const a of agents)
          if (a.slug === e.slug && seats.has(a.id) && roamOf(a.status) !== 'none') mark(a.id, 'celebrate')
      }
    }
  }, [o.events, mark])

  useFrame((_, delta) => {
    const s = life.current
    const dt = Math.min(delta, MAX_FRAME)
    const { agents, seats, sky, hour, reduce, eventBusy, eventPoseOf } = latest.current
    if (reduce) s.clock += dt
    else {
      const inputs: LifeAgentInput[] = []
      const paused = new Set<string>()
      for (const a of agents) {
        const seat = seats.get(a.id)
        if (!seat) continue
        const { home, facing } = agentHome(a, seat)
        const speed = gaitSpeed(moodAt(moods.current.get(a.id), s.clock))
        inputs.push({
          id: a.id,
          status: a.status,
          dept: seat.dept,
          slug: a.slug,
          job: a.job,
          home,
          homeFacing: facing,
          speed,
        })
        const al = s.agents.get(a.id)
        if (eventBusy(a.id)) {
          paused.add(a.id)
          if (al) al.run = null
          eventAt.current.set(a.id, eventPoseOf(a.id).position ?? home)
        } else {
          const last = eventAt.current.get(a.id)
          if (last) {
            eventAt.current.delete(a.id)
            if (al && !al.run && !samePoint(last, home)) al.run = walkHomeRun(last, home, facing)
          }
        }
      }
      const slot = routineSlot(sky.t >= 0.5 ? sky.to : sky.from, hour)
      tickLife(s, inputs, dt, { bias: routineBias(slot), slot, route: ringPath, rng: rng.current, paused })
    }
    let visible = 0
    for (const e of emotes.current.values()) if (emoteVisible(e.at, s.clock)) visible++
    const active = reduce ? 0 : activeCount(s)
    // 有人在走或圖示數變了才重繪；圖示顯示中持續要幀，demand 下也能準時消失
    if (active > 0 || visible !== shown.current) setTick((n) => n + 1)
    if (visible > 0) invalidate()
    shown.current = visible
    setAnimating(active > 0)
  })

  const poseOf = useCallback((id: string) => (latest.current.reduce ? null : lifePose(life.current, id)), [])
  const moodOf = useCallback(
    (id: string): Mood => (latest.current.reduce ? 'normal' : moodAt(moods.current.get(id), life.current.clock)),
    [],
  )
  const emoteOf = useCallback((id: string): Emote | null => {
    const e = emotes.current.get(id)
    return e && emoteVisible(e.at, life.current.clock) ? e.emote : null
  }, [])
  return { animating, poseOf, moodOf, emoteOf }
}
