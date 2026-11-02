import { getPosition, getTimes } from 'suncalc'
import type { City } from '../../../shared/weather'
import type { SkyState } from './office/sky'

export function skyAtLocation(now: number, city: City): SkyState {
  const { altitude, azimuth } = getPosition(new Date(now), city.latitude, city.longitude)
  const rising = getPosition(new Date(now + 60_000), city.latitude, city.longitude).altitude > altitude
  const twilight = rising ? 'dawn' : 'dusk'
  const lower = Math.max(0, Math.min(1, (altitude + 6) / 6))
  const upper = Math.max(0, Math.min(1, altitude / 6))
  const from = altitude < 0 ? 'night' : twilight
  const to = altitude < 0 ? twilight : 'day'
  const t = altitude < 0 ? lower : upper
  const night = altitude < 0 ? 1 - 0.6 * lower : 0.4 * (1 - upper)
  const a = (altitude * Math.PI) / 180
  const z = (azimuth * Math.PI) / 180
  const sunDir: SkyState['sunDir'] = [Math.sin(z) * Math.cos(a), Math.sin(a), -Math.cos(z) * Math.cos(a)]
  const sunUp = altitude >= 0
  return { from, to, t, night, sunDir, sunUp, moonDir: [-sunDir[0], -sunDir[1], -sunDir[2]], moonUp: !sunUp }
}

export function sunTimesAtLocation(now: number, city: City) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: city.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  const wallTime = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute, +values.second)
  const offset = (wallTime - Math.floor(now / 1000) * 1000) / 60_000
  return getTimes(new Date(now), city.latitude, city.longitude, 0, offset)
}
