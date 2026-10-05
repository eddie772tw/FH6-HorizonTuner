export type HalfmoonCore = 'default' | 'modern' | 'elegant' | 'swiss';

export interface ThemeSettings {
  mode: 'dark' | 'light';
  halfmoonCore: HalfmoonCore;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCSS: string;
}

export const defaultThemeSettings: ThemeSettings = {
  mode: 'dark',
  halfmoonCore: 'default',
  primaryColor: '#00f0ff',
  secondaryColor: '#ff003c',
  accentColor: '#7000ff',
  customCSS: '',
};

export const isHalfmoonCore = (value: unknown): value is HalfmoonCore => (
  value === 'default' || value === 'modern' || value === 'elegant' || value === 'swiss'
);

const isHexColor = (value: unknown): value is string => (
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
);

export function normalizeThemeSettings(
  candidate: Partial<ThemeSettings> | null | undefined,
  fallback: ThemeSettings = defaultThemeSettings,
): ThemeSettings {
  const settings: ThemeSettings = {
    mode: candidate?.mode === 'light' ? 'light' : candidate?.mode === 'dark' ? 'dark' : fallback.mode,
    halfmoonCore: isHalfmoonCore(candidate?.halfmoonCore) ? candidate.halfmoonCore : fallback.halfmoonCore,
    primaryColor: isHexColor(candidate?.primaryColor) ? candidate.primaryColor : fallback.primaryColor,
    secondaryColor: isHexColor(candidate?.secondaryColor) ? candidate.secondaryColor : fallback.secondaryColor,
    accentColor: isHexColor(candidate?.accentColor) ? candidate.accentColor : fallback.accentColor,
    customCSS: typeof candidate?.customCSS === 'string' ? candidate.customCSS : fallback.customCSS,
  };
  // Recognize both saved Mono variants without adding a preset ID to the storage schema.
  if (['#f1f5f9', '#000000'].includes(settings.primaryColor.toLowerCase())
      && settings.secondaryColor.toLowerCase() === '#ef4444'
      && settings.accentColor.toLowerCase() === '#64748b') {
    settings.primaryColor = settings.mode === 'light' ? '#000000' : '#f1f5f9';
  }
  return settings;
}

/** Choose the higher-contrast text color for a user-supplied primary fill. */
export function primaryForeground(hex: string): string {
  const channels = hex.slice(1).match(/../g)!.map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
