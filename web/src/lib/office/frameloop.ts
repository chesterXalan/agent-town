/** 分頁隱藏停 render；有動畫才連續跑，其他按需 */
export function frameloopFor(s: { hidden: boolean; animating: boolean }): 'never' | 'always' | 'demand' {
  if (s.hidden) return 'never'
  return s.animating ? 'always' : 'demand'
}
