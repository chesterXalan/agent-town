export const GRAPHICS_QUALITIES = ['low', 'balanced', 'high'] as const
export type GraphicsQuality = (typeof GRAPHICS_QUALITIES)[number]
export const DEFAULT_GRAPHICS_QUALITY: GraphicsQuality = 'balanced'
export const GRAPHICS_QUALITY_KEY = 'agent-town-graphics-quality'

export const GRAPHICS_PROFILES: Record<GraphicsQuality, { dpr: [number, number]; shadowMapSize: number }> = {
  low: { dpr: [1, 1], shadowMapSize: 0 },
  balanced: { dpr: [1, 1], shadowMapSize: 2048 },
  high: { dpr: [1, 1.5], shadowMapSize: 4096 },
}

export function loadGraphicsQuality(storage?: Pick<Storage, 'getItem'>): GraphicsQuality {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(GRAPHICS_QUALITY_KEY)
    return GRAPHICS_QUALITIES.includes(value as GraphicsQuality) ? (value as GraphicsQuality) : DEFAULT_GRAPHICS_QUALITY
  } catch {
    return DEFAULT_GRAPHICS_QUALITY
  }
}
