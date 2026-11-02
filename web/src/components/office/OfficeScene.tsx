import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Fragment, Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import { Vector3 } from 'three'
import type { TownAgent } from '../../../../shared/api'
import type { OfficeDept } from '../../../../shared/office'
import { appearanceOf } from '@/lib/office/appearance'
import { useZoomSpeed } from '@/lib/zoomStore'
import { townDistance, OFFICE_CAMERA } from '@/lib/office/camera'
import { isMoveKey, isTypingTarget, PAN_SPEED, panStep } from '@/lib/office/keys'
import { deptZone, HALF, seatFacing, type SeatMap, type Vec3 } from '@/lib/office/layout'
import { agentHome, resolvePose } from '@/lib/office/resolvePose'
import type { EventPose } from '@/lib/office/eventQueue'
import type { OfficeEvent } from '@/lib/office/events'
import type { SkyState, Weather } from '@/lib/office/sky'
import { EYE, slide, WALK_SPEED, walkDelta } from '@/lib/office/walk'
import { Atrium } from './Atrium'
import { Character } from './Character'
import { Clouds } from './Clouds'
import { Desk, DESK_OUT } from './Desk'
import { Floor } from './Floor'
import { LifeFurniture } from './LifeFurniture'
import { Precipitation } from './Precipitation'
import { RoomDecor } from './RoomDecor'
import { Sky } from './Sky'
import { Street } from './Street'
import { Traffic } from './Traffic'
import { useAgentLife } from './useAgentLife'
import { WALL_FOOTPRINTS, Walls } from './Walls'

const NO_EVENTS: OfficeEvent[] = []
const NO_POSE: EventPose = { position: null, anim: null, facing: null, carry: null, emote: null }
const eventPoseOf = () => NO_POSE
const eventBusy = () => false

interface Props {
  agents: TownAgent[]
  seats: SeatMap
  labels: Partial<Record<OfficeDept, string>>
  htmlPortal: RefObject<HTMLElement>
  sky: SkyState
  weather: Weather
  hour: number
  focusId: string | null
  firstPerson: boolean
  reduce: boolean
  onSelectAgent(id: string): void
  agentLabel(agent: TownAgent): string
}
function useWasdPan(controls: RefObject<CameraControls | null>, firstPerson: boolean, disabled: boolean) {
  const held = useRef(new Set<string>())
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (disabled) {
      held.current.clear()
      return
    }
    const down = (e: KeyboardEvent) => {
      if (!isMoveKey(e.code) || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      e.preventDefault()
      held.current.add(e.code)
      invalidate()
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.code)
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [invalidate, disabled])
  useFrame((_, dt) => {
    const c = controls.current
    if (!c || disabled || held.current.size === 0) return
    if (firstPerson) {
      const { forward, right } = panStep(held.current, WALK_SPEED, dt)
      const t = c.getTarget(new Vector3())
      const [x, z] = slide([t.x, t.z], walkDelta(c.azimuthAngle, forward, right), WALL_FOOTPRINTS, HALF)
      void c.moveTo(x, EYE, z, false)
      invalidate()
      return
    }
    const { forward, right } = panStep(held.current, c.distance * PAN_SPEED, dt)
    if (forward !== 0) void c.forward(forward, false)
    if (right !== 0) void c.truck(right, 0, false)
    invalidate()
  })
}

export function OfficeScene({
  agents,
  seats,
  labels,
  htmlPortal,
  sky,
  weather,
  hour,
  focusId,
  firstPerson,
  reduce,
  onSelectAgent,
  agentLabel,
}: Props) {
  const zoomSpeed = useZoomSpeed()
  const controls = useRef<CameraControls>(null)
  const size = useThree((s) => s.size)
  const life = useAgentLife({ agents, seats, events: NO_EVENTS, sky, hour, reduce, eventBusy, eventPoseOf })
  const latest = useRef({ agents, seats, life })
  latest.current = { agents, seats, life }
  const fit = useMemo(
    () => Math.min(140, townDistance(size.width / Math.max(1, size.height))),
    [size.width, size.height],
  )
  useEffect(() => {
    const c = controls.current
    if (!c) return
    if (firstPerson) void c.setLookAt(0, EYE, HALF - 2.99, 0, EYE, HALF - 3, false)
    else {
      void c.setLookAt(...OFFICE_CAMERA.position, 0, 0, 0, false)
      void c.dollyTo(fit, false)
    }
  }, [firstPerson, fit])
  useEffect(() => {
    if (firstPerson) return
    if (!focusId) {
      void controls.current?.setLookAt(...OFFICE_CAMERA.position, 0, 0, 0, !reduce)
      void controls.current?.dollyTo(fit, !reduce)
      return
    }
    const { agents: current, seats: currentSeats, life: currentLife } = latest.current
    const agent = current.find((a) => a.id === focusId)
    const seat = currentSeats.get(focusId)
    if (!agent || !seat) return
    const [x, y, z] = currentLife.poseOf(focusId)?.position ?? agentHome(agent, seat).home
    void controls.current?.setLookAt(x, y + 12, z + 14, x, y, z, !reduce)
  }, [focusId, firstPerson, reduce, fit])
  useWasdPan(controls, firstPerson, false)
  return (
    <>
      <Sky sky={sky} weather={weather} />
      <Clouds weather={weather} moving={!reduce} />
      {!reduce && <Precipitation weather={weather} />}
      <Street sky={sky} />
      <Traffic sky={sky} moving={!reduce} />
      <Walls />
      <Suspense fallback={null}>
        <Atrium />
        <Floor labels={labels} htmlPortal={htmlPortal} />
        <RoomDecor />
        <LifeFurniture />
        {agents.map((agent) => {
          const seat = seats.get(agent.id)
          if (!seat) return null
          const { home, facing, atSeat } = agentHome(agent, seat)
          const draw = resolvePose({
            event: NO_POSE,
            life: life.poseOf(agent.id),
            home,
            atSeat,
            emote: life.emoteOf(agent.id),
          })
          const yaw = seatFacing(seat)
          const { n } = deptZone(seat.dept)
          const [x, y, z] = home
          const desk: Vec3 = [x + DESK_OUT * n[0], y, z + DESK_OUT * n[1]]
          return (
            <Fragment key={agent.id}>
              {atSeat && (
                <Desk
                  position={desk}
                  rotationY={yaw}
                  screenToken={appearanceOf(agent).screenToken}
                  lamp={agent.session.state === 'working' ? sky.night : 0}
                  onSelect={() => onSelectAgent(agent.id)}
                />
              )}
              <Character
                agent={agent}
                label={agentLabel(agent)}
                position={draw.position}
                facing={draw.facing ?? facing}
                action={draw.anim}
                seated={draw.seated}
                carry={draw.carry}
                emote={draw.emote}
                mood={life.moodOf(agent.id)}
                seatLift={draw.lift}
                lifeLine={draw.line}
                onSelect={() => onSelectAgent(agent.id)}
              />
            </Fragment>
          )
        })}
      </Suspense>
      <CameraControls
        ref={controls}
        makeDefault
        minPolarAngle={firstPerson ? 0.1 : 0}
        maxPolarAngle={firstPerson ? Math.PI - 0.1 : 1.15}
        minDistance={firstPerson ? 0.01 : 8}
        maxDistance={firstPerson ? 0.01 : 140}
        azimuthRotateSpeed={firstPerson ? -0.3 : 1}
        polarRotateSpeed={firstPerson ? -0.3 : 1}
        truckSpeed={firstPerson ? 0 : 2}
        dollySpeed={zoomSpeed}
      />
    </>
  )
}
