export const S650_HMI_STYLE_ID = 's650_hmi' as const;
export const DEFAULT_S650_HMI_THEME = 'heritage67' as const;
export const DEFAULT_S650_CENTER_WIDGET = 'drive' as const;

const S650_HMI_THEME_VALUES = [
  'normal',
  'sport',
  'track',
  'calm',
  'foxbody',
  'heritage67',
  'svt_cobra',
] as const;

export type S650HmiTheme = (typeof S650_HMI_THEME_VALUES)[number];

// Only production-ready themes are exposed in the HMI Mode selector. The
// complete value set remains recognized below so existing configurations and
// legacy identifiers can still be loaded without data loss.
export const S650_HMI_THEMES = [
  { value: 'heritage67', label: "S650 Heritage '67" },
] as const;

export const S650_CENTER_WIDGETS = [
  { value: 'drive', label: 'Drive summary' },
  { value: 'tire_temp', label: 'Tire temperature' },
  { value: 'performance', label: 'Performance telemetry' },
] as const;

export type S650CenterWidget = (typeof S650_CENTER_WIDGETS)[number]['value'];

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
  return S650_HMI_THEME_VALUES.some((theme) => theme === value);
}

export function isS650CenterWidget(value: unknown): value is S650CenterWidget {
  return S650_CENTER_WIDGETS.some((widget) => widget.value === value);
}

/**
 * Converts the seven pre-HMI style ids into one HUD style plus a theme.
 * Non-S650 configurations are returned by identity so this helper can be
 * applied at every config boundary without changing other HUDs.
 */
export function normalizeS650HmiConfig<T extends { hudStyle?: string; s650Theme?: unknown; s650CenterWidget?: unknown }>(config: T): T {
  const legacyTheme = config.hudStyle ? LEGACY_S650_STYLE_MAP[config.hudStyle] : undefined;
  if (!legacyTheme && config.hudStyle !== S650_HMI_STYLE_ID) {
    return config;
  }

  return {
    ...config,
    hudStyle: S650_HMI_STYLE_ID,
    s650Theme: legacyTheme ?? (isS650HmiTheme(config.s650Theme) ? config.s650Theme : DEFAULT_S650_HMI_THEME),
    s650CenterWidget: isS650CenterWidget(config.s650CenterWidget)
      ? config.s650CenterWidget
      : DEFAULT_S650_CENTER_WIDGET,
  } as T;
}
