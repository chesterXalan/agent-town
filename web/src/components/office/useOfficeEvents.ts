import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OfficeAgent } from '../../../../shared/api'
import type { OfficeEvent } from '@/lib/office/events'
import {
  createEventQueue,
  enqueueEvents,
  recallToSeat,
  tickEventQueue,
  type EventPose,
  type EventQueue,
  type OfficeLocator,
} from '@/lib/office/eventQueue'
import { roamOf } from '@/lib/office/life'

export type { EventAnim, EventPose, OfficeLocator } from '@/lib/office/eventQueue'

/**
 * 依事件替 agent 排動畫，useFrame 的 delta 推進；一個 agent 同時只播一段，後到的排隊。
 * agents 有人轉工作中（tool／replying）就把他的被動劇情換成走回座位（recallToSeat）。
 * 只能在 Canvas 內呼叫。
 */
export function useOfficeEvents(
  events: OfficeEvent[],
  locator: OfficeLocator,
  agents: readonly OfficeAgent[],
): { animating: boolean; poseOf(id: string): EventPose; busyOf(id: string): boolean; cakes: EventQueue['cakes'] } {
  const locRef = useRef(locator)
  locRef.current = locator
  const queue = useRef(createEventQueue())
  const [animating, setAnimating] = useState(false)
  const [, setTick] = useState(0)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    // leave 可能清掉最後一段動畫，所以一律以佇列實況設定 animating
    const busy = enqueueEvents(queue.current, events, locRef.current)
    setAnimating(busy)
    if (busy) invalidate()
  }, [events, invalidate])

  useEffect(() => {
    if (queue.current.queues.size === 0) return
    const working = agents.filter((a) => roamOf(a.status) === 'none').map((a) => a.id)
    const busy = recallToSeat(queue.current, working, locRef.current)
    setAnimating(busy)
    if (busy) invalidate()
  }, [agents, invalidate])

  useFrame((_, delta) => {
    if (queue.current.queues.size === 0 && queue.current.cakes.length === 0) return
    const busy = tickEventQueue(queue.current, delta)
    setTick((n) => n + 1)
    if (!busy) setAnimating(false)
  })

  const poseOf = useCallback(
    (id: string): EventPose =>
      queue.current.poses.get(id) ?? { position: null, anim: null, facing: null, emote: null, carry: null },
    [],
  )
  /** 該 agent 佇列裡還有動畫（含 target 原地等 reviewer 走到的那段） */
  const busyOf = useCallback((id: string): boolean => queue.current.queues.has(id), [])
  return { animating, poseOf, busyOf, cakes: queue.current.cakes }
}
