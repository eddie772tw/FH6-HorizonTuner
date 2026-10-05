export const STACK_ST8100_STYLE_ID = 'stack_st8100' as const;

export const STACK_ST8100_FIELDS = [
  { value: 'speed', label: 'Speed' },
  { value: 'gear', label: 'Gear' },
  { value: 'fuel', label: 'Fuel level' },
  { value: 'tire_avg', label: 'Average tire temperature' },
  { value: 'tire_max', label: 'Maximum tire temperature' },
  { value: 'boost', label: 'Boost' },
  { value: 'rpm', label: 'Engine RPM' },
  { value: 'current_lap', label: 'Current lap time' },
  { value: 'last_lap', label: 'Last lap time' },
  { value: 'best_lap', label: 'Best lap time' },
  { value: 'lap', label: 'Lap number' },
  { value: 'peak_rpm', label: 'Peak RPM' },
  { value: 'peak_speed', label: 'Peak speed' },
] as const;
export const STACK_ST8100_DIALS = ['auto', '0-3-8', '0-4-10', '0-6-13'] as const;
export type StackSt8100Field = (typeof STACK_ST8100_FIELDS)[number]['value'];
export type StackSt8100Dial = (typeof STACK_ST8100_DIALS)[number];
export type StackSt8100Page = 'live' | 'peaks';
export type StackSt8100TemperatureUnit = 'c' | 'f';

export interface StackSt8100Settings {
  stackSt8100Field1: StackSt8100Field;
  stackSt8100Field2: StackSt8100Field;
  stackSt8100Field3: StackSt8100Field;
  stackSt8100Field4: StackSt8100Field;
  stackSt8100Page: StackSt8100Page;
  stackSt8100TemperatureUnit: StackSt8100TemperatureUnit;
  stackSt8100Dial: StackSt8100Dial;
  stackSt8100ShiftEnabled: boolean;
  stackSt8100ShiftPercent: number;
  stackSt8100FuelWarningEnabled: boolean;
  stackSt8100FuelWarningPercent: number;
  stackSt8100TireWarningEnabled: boolean;
  /** Persist Celsius regardless of the selected display unit. */
  stackSt8100TireWarningC: number;
  stackSt8100BoostWarningEnabled: boolean;
  /** Persist bar regardless of the effective HUD boost unit. */
  stackSt8100BoostWarningBar: number;
}

export const STACK_ST8100_DEFAULTS: Readonly<StackSt8100Settings> = {
  stackSt8100Field1: 'speed',
  stackSt8100Field2: 'gear',
  stackSt8100Field3: 'fuel',
  stackSt8100Field4: 'tire_avg',
  stackSt8100Page: 'live',
  stackSt8100TemperatureUnit: 'c',
  stackSt8100Dial: 'auto',
  stackSt8100ShiftEnabled: true,
  stackSt8100ShiftPercent: 90,
  stackSt8100FuelWarningEnabled: false,
  stackSt8100FuelWarningPercent: 10,
  stackSt8100TireWarningEnabled: false,
  stackSt8100TireWarningC: 120,
  stackSt8100BoostWarningEnabled: false,
  stackSt8100BoostWarningBar: 1.5,
};

export const STACK_ST8100_LIMITS = {
  stackSt8100ShiftPercent: { min: 50, max: 100 },
  stackSt8100FuelWarningPercent: { min: 1, max: 50 },
  stackSt8100TireWarningC: { min: 50, max: 200 },
  stackSt8100BoostWarningBar: { min: 0.1, max: 5 },
} as const;
export type StackSt8100Threshold = keyof typeof STACK_ST8100_LIMITS;

export function normalizeStackSt8100Threshold(key: StackSt8100Threshold, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return STACK_ST8100_DEFAULTS[key];
  const { min, max } = STACK_ST8100_LIMITS[key];
  return Math.max(min, Math.min(max, value));
}

function normalizeSetting(key: keyof StackSt8100Settings, value: unknown): StackSt8100Settings[typeof key] {
  const fallback = STACK_ST8100_DEFAULTS[key];
  if (typeof fallback === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (key in STACK_ST8100_LIMITS) return normalizeStackSt8100Threshold(key as StackSt8100Threshold, value);
  const allowed: readonly string[] = key === 'stackSt8100Dial' ? STACK_ST8100_DIALS
    : key === 'stackSt8100Page' ? ['live', 'peaks']
      : key === 'stackSt8100TemperatureUnit' ? ['c', 'f'] : STACK_ST8100_FIELDS.map(field => field.value);
  return typeof value === 'string' && allowed.includes(value) ? value as StackSt8100Settings[typeof key] : fallback;
}

/** Strict primitive boundary: inactive HUDs keep absent Stack settings absent. */
export function normalizeStackSt8100Config<T extends { hudStyle?: unknown }>(config: T): T {
  const source = config as Record<string, unknown>;
  const active = config.hudStyle === STACK_ST8100_STYLE_ID;
  const settings: Record<string, unknown> = {};
  for (const key of Object.keys(STACK_ST8100_DEFAULTS) as (keyof StackSt8100Settings)[]) {
    if (active || Object.prototype.hasOwnProperty.call(source, key)) settings[key] = normalizeSetting(key, source[key]);
  }
  return { ...config, ...settings };
}

export function readStackSt8100Settings(config: Partial<StackSt8100Settings>): StackSt8100Settings {
  return normalizeStackSt8100Config({ ...STACK_ST8100_DEFAULTS, ...config, hudStyle: STACK_ST8100_STYLE_ID });
}
