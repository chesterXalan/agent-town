import type { ActivityKind } from './life'
import type { Phase } from './sky'

export type RoutineSlot = 'morning' | 'work' | 'lunch' | 'evening' | 'night'

/** dawn → morning；day 且 12 ≤ hour < 14 → lunch；day 其他 → work；dusk → evening；night → night */
export function routineSlot(phase: Phase, hour: number): RoutineSlot {
  switch (phase) {
    case 'dawn':
      return 'morning'
    case 'day':
      return hour >= 12 && hour < 14 ? 'lunch' : 'work'
    case 'dusk':
      return 'evening'
    case 'night':
      return 'night'
  }
}

/** weights 覆蓋 chooseActivity 的預設權重；roamScale 乘在自發出門的每秒機率上 */
export interface RoutineBias {
  weights: Partial<Record<ActivityKind, number>>
  roamScale: number
}

const BIAS: Record<RoutineSlot, RoutineBias> = {
  morning: { weights: { arrive: 4 }, roamScale: 1 },
  work: { weights: {}, roamScale: 1 },
  lunch: { weights: { lunch: 6 }, roamScale: 1 },
  evening: { weights: { stretch: 4 }, roamScale: 1 },
  night: { weights: {}, roamScale: 0.3 },
}

/** morning 偏 arrive、lunch 偏 lunch、evening 偏 stretch、night roamScale 0.3，其他 1 */
export function routineBias(slot: RoutineSlot): RoutineBias {
  return BIAS[slot]
}
