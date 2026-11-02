import { isCity, type City, type TownWeather } from '../../../shared/weather'
import { PHASES, WEATHERS, type Phase } from './office/sky'

export interface EnvironmentPreferences {
  city: City | null
  phase: Phase | 'auto'
  weather: TownWeather | 'auto'
}
export const ENVIRONMENT_KEY = 'agent-town-environment'
export const DEFAULT_ENVIRONMENT: EnvironmentPreferences = { city: null, phase: 'auto', weather: 'auto' }

export function loadEnvironment(storage?: Pick<Storage, 'getItem'>): EnvironmentPreferences {
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage)?.getItem(ENVIRONMENT_KEY) ?? '{}')
    return {
      city: isCity(value?.city) ? value.city : null,
      phase: PHASES.includes(value?.phase) ? value.phase : 'auto',
      weather: WEATHERS.includes(value?.weather) ? value.weather : 'auto',
    }
  } catch {
    return DEFAULT_ENVIRONMENT
  }
}

export function saveEnvironment(value: EnvironmentPreferences, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? globalThis.localStorage)?.setItem(ENVIRONMENT_KEY, JSON.stringify(value))
  } catch {
    // Preferences still apply to the current tab when storage is unavailable.
  }
}
