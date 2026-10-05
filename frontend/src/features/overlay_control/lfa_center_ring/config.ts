export const LFA_CENTER_RING_STYLE_ID = 'lfa_center_ring' as const;
export const DEFAULT_LFA_MANUAL_EXPAND = false;
export const DEFAULT_LFA_AUTO_EXPAND = false;

/** Only actual booleans opt into movement; other HUDs retain their own config. */
export function normalizeLfaExpansionConfig<T extends {
  hudStyle?: string;
  lfaManualExpand?: unknown;
  lfaAutoExpand?: unknown;
}>(config: T): T {
  if (config.hudStyle !== LFA_CENTER_RING_STYLE_ID) return config;
  return {
    ...config,
    lfaManualExpand: typeof config.lfaManualExpand === 'boolean' ? config.lfaManualExpand : DEFAULT_LFA_MANUAL_EXPAND,
    lfaAutoExpand: typeof config.lfaAutoExpand === 'boolean' ? config.lfaAutoExpand : DEFAULT_LFA_AUTO_EXPAND,
  };
}
