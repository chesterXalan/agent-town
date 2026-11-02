import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, type Points } from 'three'
import type { Weather } from '@/lib/office/sky'
import { readToken } from '@/lib/office/tokens'

/** 粒子範圍：蓋住整層樓上方 */
const SPAN = 30
const TOP = 40

const KIND = {
  rain: { count: 1500, speed: 30, drift: 0, size: 0.14, opacity: 0.75, token: '--office-rain' },
  snow: { count: 800, speed: 2.5, drift: 0.8, size: 0.2, opacity: 0.9, token: '--office-snow' },
} as const

/** 雨雪粒子：每幀下落、到底回頂；雪左右飄；晴／多雲不畫 */
export function Precipitation({ weather }: { weather: Weather }) {
  if (weather === 'clear' || weather === 'cloudy') return null
  return <Particles kind={weather === 'snow' ? 'snow' : 'rain'} />
}

function Particles({ kind }: { kind: keyof typeof KIND }) {
  const k = KIND[kind]
  const ref = useRef<Points>(null)
  const { geometry, phase } = useMemo(() => {
    const pos = new Float32Array(k.count * 3)
    const phase = new Float32Array(k.count)
    for (let i = 0; i < k.count; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * SPAN
      pos[i * 3 + 1] = Math.random() * TOP
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * SPAN
      phase[i] = Math.random() * Math.PI * 2
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(pos, 3))
    return { geometry: g, phase }
  }, [k.count])
  useEffect(() => () => geometry.dispose(), [geometry])
  const color = useMemo(() => readToken(k.token), [k.token])

  useFrame(({ clock }, delta) => {
    const attr = geometry.getAttribute('position') as BufferAttribute
    const a = attr.array as Float32Array
    const dt = Math.min(delta, 0.1)
    const t = clock.elapsedTime
    for (let i = 0; i < k.count; i++) {
      let y = a[i * 3 + 1] - k.speed * dt
      if (y < 0) y += TOP
      a[i * 3 + 1] = y
      if (k.drift) a[i * 3] += Math.sin(t + phase[i]) * k.drift * dt
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={ref} geometry={geometry} frustumCulled={false}>
      <pointsMaterial color={color} size={k.size} sizeAttenuation transparent opacity={k.opacity} depthWrite={false} />
    </points>
  )
}
