import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type { FrameRate } from '@/lib/frameRate'
import { createFrameClock } from '@/lib/frameClock'

/** Manual advance also bounds components that continuously invalidate their own animation. */
export function SceneClock({ active, fps }: { active: boolean; fps: FrameRate }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    if (!active) return
    const step = createFrameClock(fps)
    let frame = 0
    const tick = (time: number) => {
      const delta = step(time)
      if (delta !== null) {
        const state = get()
        state.advance(state.clock.elapsedTime + delta, true)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, fps, get])
  return null
}
