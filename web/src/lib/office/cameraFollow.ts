import { Vector3 } from 'three'
import type { Vec3 } from './layout'

interface FollowControls {
  getTarget(out: Vector3, receiveEndValue?: boolean): Vector3
  moveTo(x: number, y: number, z: number, enableTransition?: boolean): Promise<void>
}

/** Track movement while retaining any target offset introduced by manual panning. */
export function createCameraFollow() {
  const previous = new Vector3()
  const goal = new Vector3()
  const written = new Vector3()
  const target = new Vector3()
  const end = new Vector3()
  let initialized = false
  return {
    reset() {
      initialized = false
    },
    step(controls: FollowControls, position: Vec3, delta: number, immediate = false) {
      if (delta <= 0 && !immediate) return
      controls.getTarget(end)
      if (!initialized) {
        previous.set(...position)
        goal.copy(end)
        written.copy(end)
        initialized = true
      }
      goal.add(target.copy(end).sub(written))
      goal.x += position[0] - previous.x
      goal.y += position[1] - previous.y
      goal.z += position[2] - previous.z
      previous.set(...position)

      controls.getTarget(target, false)
      if (target.distanceToSquared(goal) < 1e-12 && target.distanceToSquared(end) < 1e-12) return
      target.lerp(goal, immediate ? 1 : 1 - Math.exp(-Math.min(delta, 0.25) / 0.12))
      if (target.distanceToSquared(goal) < 1e-6) target.copy(goal)
      // Apply our interpolation immediately; animated moveTo calls would queue a rest listener per frame.
      void controls.moveTo(target.x, target.y, target.z, false)
      written.copy(target)
    },
  }
}
