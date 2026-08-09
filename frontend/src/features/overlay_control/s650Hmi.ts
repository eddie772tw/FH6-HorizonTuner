export const S650_HMI_STYLE_ID = 's650_hmi' as const;
export const DEFAULT_S650_HMI_THEME = 'normal' as const;

export const S650_HMI_THEMES = [
  { value: 'normal', label: 'S650 Normal' },
  { value: 'sport', label: 'S650 Sport' },
  { value: 'track', label: 'S650 Track' },
  { value: 'calm', label: 'S650 Calm' },
  { value: 'foxbody', label: 'S650 Foxbody' },
  { value: 'heritage67', label: "S650 Heritage '67" },
  { value: 'svt_cobra', label: 'S650 SVT Cobra' },
] as const;

export type S650HmiTheme = (typeof S650_HMI_THEMES)[number]['value'];

export const LEGACY_S650_STYLE_MAP: Readonly<Record<string, S650HmiTheme>> = {
  s650_normal: 'normal',
  s650_sport: 'sport',
  s650_track: 'track',
  s650_calm: 'calm',
  s650_foxbody: 'foxbody',
  s650_heritage67: 'heritage67',
  s650_svt_cobra: 'svt_cobra',
};

export function isS650HmiTheme(value: unknown): value is S650HmiTheme {
  return S650_HMI_THEMES.some((theme) => theme.value === value);
}

/**
 * Converts the seven pre-HMI style ids into one HUD style plus a theme.
 * Non-S650 configurations are returned by identity so this helper can be
 * applied at every config boundary without changing other HUDs.
 */
export function normalizeS650HmiConfig<T extends { hudStyle?: string; s650Theme?: unknown }>(config: T): T {
  const legacyTheme = config.hudStyle ? LEGACY_S650_STYLE_MAP[config.hudStyle] : undefined;
  if (!legacyTheme && config.hudStyle !== S650_HMI_STYLE_ID) {
    return config;
  }

  return {
    ...config,
    hudStyle: S650_HMI_STYLE_ID,
    s650Theme: legacyTheme ?? (isS650HmiTheme(config.s650Theme) ? config.s650Theme : DEFAULT_S650_HMI_THEME),
  } as T;
}
