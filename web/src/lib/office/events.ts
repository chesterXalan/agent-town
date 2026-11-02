export type OfficeEvent =
  | { kind: 'review-start'; reviewerId: string; targetId: string }
  | { kind: 'review-end'; reviewerId: string; targetId: string; outcome: 'pass' | 'fail' }
  | { kind: 'qa-patrol'; qaId: string; slug: string }
  | { kind: 'blocked'; slug: string }
  | { kind: 'enter'; id: string }
  | { kind: 'fixer-enter'; id: string }
  | { kind: 'leave'; id: string }
  | { kind: 'plan-complete'; slug: string }
