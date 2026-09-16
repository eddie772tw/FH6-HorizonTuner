export const CLASSIC_JDM_STYLE_ID = 'classic_jdm' as const;
export const DEFAULT_CLASSIC_JDM_TACH_STYLE = 'trd' as const;
export const DEFAULT_CLASSIC_JDM_SHOW_TRIPLE = true;
export const DEFAULT_CLASSIC_JDM_AUX1 = 'tire_temp_4w' as const;
export const DEFAULT_CLASSIC_JDM_AUX2 = 'tire_temp_rear' as const;
export const DEFAULT_CLASSIC_JDM_DEFI_THEME = 'amber' as const;

export const CLASSIC_JDM_TACH_STYLES = [
  { value: 'trd', label: 'TRD 11,000 RPM (AE86)' },
  { value: 'defi', label: 'Defi Advance BF' },
] as const;

export type ClassicJdmTachStyle = (typeof CLASSIC_JDM_TACH_STYLES)[number]['value'];

export const CLASSIC_JDM_AUX_GAUGES = [
  { value: 'tire_temp_4w', label: '四輪平均胎溫 (4W Avg)' },
  { value: 'tire_temp_rear', label: '後輪平均胎溫 (Rear Avg)' },
  { value: 'tire_temp_front', label: '前輪平均胎溫 (Front Avg)' },
  { value: 'susp_travel_4w', label: '四輪平均懸吊行程 (4W Susp)' },
  { value: 'susp_travel_front', label: '前輪平均懸吊行程 (Front Susp)' },
  { value: 'susp_travel_rear', label: '後輪平均懸吊行程 (Rear Susp)' },
  { value: 'slip_ratio_4w', label: '四輪平均滑移率 (Slip Ratio)' },
  { value: 'oil_temp', label: '機油溫度 (Oil Temp)' },
  { value: 'oil_press', label: '機油壓力 (Oil Press)' },
] as const;

export type ClassicJdmAuxGauge = (typeof CLASSIC_JDM_AUX_GAUGES)[number]['value'];

export const CLASSIC_JDM_DEFI_THEMES = [
  { value: 'amber', label: 'Amber Red (琥珀紅)' },
  { value: 'white', label: 'White (冷冽白)' },
] as const;

export type ClassicJdmDefiTheme = (typeof CLASSIC_JDM_DEFI_THEMES)[number]['value'];

export function isClassicJdmTachStyle(value: unknown): value is ClassicJdmTachStyle {
  return CLASSIC_JDM_TACH_STYLES.some((s) => s.value === value);
}

export function isClassicJdmAuxGauge(value: unknown): value is ClassicJdmAuxGauge {
  return CLASSIC_JDM_AUX_GAUGES.some((g) => g.value === value);
}

export function isClassicJdmDefiTheme(value: unknown): value is ClassicJdmDefiTheme {
  return CLASSIC_JDM_DEFI_THEMES.some((t) => t.value === value);
}

/**
 * Normalizes Classic JDM configuration and handles seamless migration from
 * legacy 'initial_d' and 'defi_triple' HUD styles.
 */
export function normalizeClassicJdmConfig<T extends {
  hudStyle?: string;
  classicJdmTachStyle?: unknown;
  classicJdmShowTriple?: unknown;
  classicJdmAux1?: unknown;
  classicJdmAux2?: unknown;
  classicJdmDefiTheme?: unknown;
}>(config: T): T {
  if (!config) return config;

  // Legacy initial_d migration -> classic_jdm (TRD mode)
  if (config.hudStyle === 'initial_d') {
    return {
      ...config,
      hudStyle: CLASSIC_JDM_STYLE_ID,
      classicJdmTachStyle: 'trd',
      classicJdmShowTriple: config.classicJdmShowTriple !== undefined ? Boolean(config.classicJdmShowTriple) : DEFAULT_CLASSIC_JDM_SHOW_TRIPLE,
      classicJdmAux1: isClassicJdmAuxGauge(config.classicJdmAux1) ? config.classicJdmAux1 : DEFAULT_CLASSIC_JDM_AUX1,
      classicJdmAux2: isClassicJdmAuxGauge(config.classicJdmAux2) ? config.classicJdmAux2 : DEFAULT_CLASSIC_JDM_AUX2,
      classicJdmDefiTheme: isClassicJdmDefiTheme(config.classicJdmDefiTheme) ? config.classicJdmDefiTheme : DEFAULT_CLASSIC_JDM_DEFI_THEME,
    } as T;
  }

  // Legacy defi_triple migration -> classic_jdm (Defi mode with triple gauges)
  if (config.hudStyle === 'defi_triple') {
    return {
      ...config,
      hudStyle: CLASSIC_JDM_STYLE_ID,
      classicJdmTachStyle: 'defi',
      classicJdmShowTriple: true,
      classicJdmAux1: isClassicJdmAuxGauge(config.classicJdmAux1) ? config.classicJdmAux1 : DEFAULT_CLASSIC_JDM_AUX1,
      classicJdmAux2: isClassicJdmAuxGauge(config.classicJdmAux2) ? config.classicJdmAux2 : DEFAULT_CLASSIC_JDM_AUX2,
      classicJdmDefiTheme: isClassicJdmDefiTheme(config.classicJdmDefiTheme) ? config.classicJdmDefiTheme : DEFAULT_CLASSIC_JDM_DEFI_THEME,
    } as T;
  }

  // Active classic_jdm normalization
  if (config.hudStyle === CLASSIC_JDM_STYLE_ID) {
    return {
      ...config,
      classicJdmTachStyle: isClassicJdmTachStyle(config.classicJdmTachStyle) ? config.classicJdmTachStyle : DEFAULT_CLASSIC_JDM_TACH_STYLE,
      classicJdmShowTriple: config.classicJdmShowTriple !== undefined ? Boolean(config.classicJdmShowTriple) : DEFAULT_CLASSIC_JDM_SHOW_TRIPLE,
      classicJdmAux1: isClassicJdmAuxGauge(config.classicJdmAux1) ? config.classicJdmAux1 : DEFAULT_CLASSIC_JDM_AUX1,
      classicJdmAux2: isClassicJdmAuxGauge(config.classicJdmAux2) ? config.classicJdmAux2 : DEFAULT_CLASSIC_JDM_AUX2,
      classicJdmDefiTheme: isClassicJdmDefiTheme(config.classicJdmDefiTheme) ? config.classicJdmDefiTheme : DEFAULT_CLASSIC_JDM_DEFI_THEME,
    } as T;
  }

  return config;
}
