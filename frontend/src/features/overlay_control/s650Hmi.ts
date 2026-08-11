export const S650_HMI_STYLE_ID = 's650_hmi' as const;
export const DEFAULT_S650_HMI_THEME = 'heritage67' as const;
export const DEFAULT_S650_CENTER_WIDGET = 'drive' as const;

const S650_HMI_THEME_VALUES = [
  'normal',
  'heritage67',
  'foxbody',
  'sport',
  'track',
] as const;

export type S650HmiTheme = (typeof S650_HMI_THEME_VALUES)[number];

export const S650_HMI_THEMES = [
  { value: 'normal', label: 'S650 Normal' },
  { value: 'sport', label: 'S650 Sport' },
  { value: 'heritage67', label: "S650 Heritage '67" },
  { value: 'foxbody', label: "S650 Fox Body '87–'93" },
  { value: 'track', label: 'S650 Track' },
] as const;

export const S650_CENTER_WIDGETS = [
  { value: 'disable', label: 'Disable' },
  { value: 'drive', label: 'Driving overview' },
  { value: 'tire_temp', label: 'Tire temperature' },
  { value: 'performance', label: 'Powertrain telemetry' },
] as const;

export type S650CenterWidget = (typeof S650_CENTER_WIDGETS)[number]['value'];

export const LEGACY_S650_STYLE_MAP: Readonly<Record<string, S650HmiTheme>> = {
  s650_normal: 'normal',
  s650_heritage67: 'heritage67',
  s650_foxbody: 'foxbody',
};

export function isS650HmiTheme(value: unknown): value is S650HmiTheme {
  return S650_HMI_THEME_VALUES.some((theme) => theme === value);
}

export function isS650CenterWidget(value: unknown): value is S650CenterWidget {
  return S650_CENTER_WIDGETS.some((widget) => widget.value === value);
}

/**
 * Converts retained and unknown legacy S650 style ids into one HUD style plus
 * a theme. Unknown S650 ids are treated as removed styles and fall back to
 * Heritage. Non-S650 configurations are returned by identity so this helper
 * can be applied at every config boundary without changing other HUDs.
 */
export function normalizeS650HmiConfig<T extends { hudStyle?: string; s650Theme?: unknown; s650CenterWidget?: unknown }>(config: T): T {
  const legacyTheme = config.hudStyle ? LEGACY_S650_STYLE_MAP[config.hudStyle] : undefined;
  const isLegacyS650Style =
    typeof config.hudStyle === 'string' &&
    config.hudStyle !== S650_HMI_STYLE_ID &&
    config.hudStyle.startsWith('s650_');
  if (!legacyTheme && !isLegacyS650Style && config.hudStyle !== S650_HMI_STYLE_ID) {
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
