export const R34_MFD_STYLE_ID = 'r34_mfd' as const;
export const R34_MFD_MODES = [
  { value: 'single', label: 'R34 single gauge and memory' },
  { value: 'twin', label: 'R34 twin gauges' },
  { value: 'multi', label: 'R34 multi monitor' },
  { value: 'g', label: 'R34 G indication' },
  { value: 'lap', label: 'R34 lap time' },
] as const;
export type R34MfdMode = (typeof R34_MFD_MODES)[number]['value'];
export type R34Lighting = 'day' | 'night';
export function normalizeR34MfdConfig<T extends { hudStyle?: string; r34MfdMode?: unknown; r34ShowCluster?: unknown; r34Lighting?: unknown }>(config: T): T {
  if (config.hudStyle !== R34_MFD_STYLE_ID) return config;
  return {
    ...config,
    r34MfdMode: R34_MFD_MODES.some(mode => mode.value === config.r34MfdMode) ? config.r34MfdMode : 'single',
    r34ShowCluster: typeof config.r34ShowCluster === 'boolean' ? config.r34ShowCluster : true,
    r34Lighting: config.r34Lighting === 'day' ? 'day' : 'night',
  };
}
