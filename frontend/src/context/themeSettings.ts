import { isCoreTheme, type CoreThemeId } from './themeCatalog';

export interface ThemeSettings {
  mode: 'dark' | 'light';
  /** Legacy storage/API key; identifies a core from any design system. */
  halfmoonCore: CoreThemeId;
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

const isHexColor = (value: unknown): value is string => (
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
);

export function normalizeThemeSettings(
  candidate: Partial<ThemeSettings> | null | undefined,
  fallback: ThemeSettings = defaultThemeSettings,
): ThemeSettings {
  const settings: ThemeSettings = {
    mode: candidate?.mode === 'light' ? 'light' : candidate?.mode === 'dark' ? 'dark' : fallback.mode,
    halfmoonCore: isCoreTheme(candidate?.halfmoonCore) ? candidate.halfmoonCore : fallback.halfmoonCore,
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

/** Halfmoon utilities consume comma-separated HSL, while our canvases consume hex. */
function hexToHsl(hex: string): string {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const hue = delta === 0 ? 0 : 60 * (max === r ? ((g - b) / delta + 6) % 6
    : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4);
  return `${hue}, ${saturation * 100}%, ${lightness * 100}%`;
}

/** One palette for first paint, React, native Halfmoon controls and custom instruments. */
export function themeColorProperties(theme: ThemeSettings): Record<string, string> {
  const foreground = primaryForeground(theme.primaryColor);
  const hoverShade = foreground === '#ffffff' ? '#000000' : '#ffffff';
  const hsl = hexToHsl(theme.primaryColor);
  const properties: Record<string, string> = {
    '--primary': theme.primaryColor,
    '--secondary': theme.secondaryColor,
    '--accent': theme.accentColor,
    '--on-primary': foreground,
    '--bs-primary': 'var(--primary)',
    '--bs-primary-hsl': hsl,
    '--bs-link-color-hsl': hsl,
    '--bs-link-hover-color-hsl': hsl,
    '--bs-primary-foreground': foreground,
    '--bs-primary-foreground-hsl': hexToHsl(foreground),
    '--bs-primary-text-emphasis': 'var(--text-primary)',
    '--bs-primary-text-emphasis-hsl': hsl,
    '--bs-primary-hover-bg': `color-mix(in srgb, var(--primary) 88%, ${hoverShade})`,
    '--bs-primary-active-bg': `color-mix(in srgb, var(--primary) 76%, ${hoverShade})`,
    '--bs-primary-bg-subtle': 'color-mix(in srgb, var(--primary) 12%, var(--glass-bg))',
    '--bs-primary-border-subtle': 'color-mix(in srgb, var(--primary) 40%, var(--glass-border))',
  };
  for (const icon of ['checkbox', 'dash', 'radio', 'switch']) {
    properties[`--bs-primary-${icon}-svg`] = `var(--bs-${icon}-svg-${foreground === '#000000' ? 'dark' : 'light'})`;
  }
  return properties;
}
