export const STACK_ST8100_STYLE_ID = 'stack_st8100' as const;
export const STACK_ST8100_FIELDS = [
  { value: 'speed', label: 'Speed' },
  { value: 'gear', label: 'Gear' },
  { value: 'tire_avg', label: 'Average tire temperature' },
  { value: 'tire_max', label: 'Maximum tire temperature' },
  { value: 'boost', label: 'Boost' },
  { value: 'rpm', label: 'Engine RPM' },
  { value: 'power', label: 'Power' },
  { value: 'torque', label: 'Torque' },
  { value: 'throttle', label: 'Throttle' },
  { value: 'brake', label: 'Brake' },
  { value: 'current_lap', label: 'Current lap time' },
  { value: 'race_time', label: 'Race elapsed time' },
  { value: 'last_lap', label: 'Last lap time' },
  { value: 'best_lap', label: 'Best lap time' },
  { value: 'lap', label: 'Lap number' },
  { value: 'peak_rpm', label: 'Peak RPM' },
  { value: 'peak_speed', label: 'Peak speed' },
] as const;
export const STACK_ST8100_DIALS = ['auto', '0-3-8', '0-4-10', '0-3-10.5', '0-6-13'] as const;
export const STACK_ST8100_ALARM_METRICS = {
  rpm: { label: 'Engine RPM', min: 0, max: 30000, threshold: 7000, unit: 'rpm' },
  speed: { label: 'Speed', min: 0, max: 1440, threshold: 200, unit: 'speed' },
  tire_avg: { label: 'Average tire temperature', min: -100, max: 800, threshold: 120, unit: 'temperature' },
  tire_max: { label: 'Maximum tire temperature', min: -100, max: 800, threshold: 120, unit: 'temperature' },
  boost: { label: 'Boost', min: -1, max: 10, threshold: 1.5, unit: 'boostPressure' },
  power: { label: 'Power', min: -2000, max: 20000, threshold: 300, unit: 'power' },
  torque: { label: 'Torque', min: -100000, max: 100000, threshold: 500, unit: 'torque' },
  throttle: { label: 'Throttle', min: 0, max: 100, threshold: 90, unit: 'percent' },
  brake: { label: 'Brake', min: 0, max: 100, threshold: 90, unit: 'percent' },
} as const;
export type StackSt8100Field = (typeof STACK_ST8100_FIELDS)[number]['value'];
export type StackSt8100Dial = (typeof STACK_ST8100_DIALS)[number];
export type StackSt8100Face = 'black' | 'white';
export type StackSt8100Page = 'live' | 'peaks';
export type StackSt8100TemperatureUnit = 'c' | 'f';
export type StackSt8100AlarmMetric = keyof typeof STACK_ST8100_ALARM_METRICS;
export interface StackSt8100Alarm {
  enabled: boolean;
  metric: StackSt8100AlarmMetric;
  direction: 'high' | 'low';
  /** Canonical rpm, km/h, Celsius, bar, kW, Nm or percentage. */
  threshold: number;
}
export type StackSt8100Alarms = [StackSt8100Alarm, StackSt8100Alarm, StackSt8100Alarm];
export interface StackSt8100Settings {
  stackSt8100Field1: StackSt8100Field;
  stackSt8100Field2: StackSt8100Field;
  stackSt8100Field3: StackSt8100Field;
  stackSt8100Field4: StackSt8100Field;
  stackSt8100Page: StackSt8100Page;
  stackSt8100TemperatureUnit: StackSt8100TemperatureUnit;
  stackSt8100Dial: StackSt8100Dial;
  stackSt8100Face: StackSt8100Face;
  stackSt8100ShiftEnabled: boolean;
  stackSt8100ShiftPercent: number;
  stackSt8100Alarms: StackSt8100Alarms;
}
export const STACK_ST8100_DEFAULTS: Readonly<StackSt8100Settings> = {
  "stackSt8100Field1": "speed",
  "stackSt8100Field2": "gear",
  "stackSt8100Field3": "race_time",
  "stackSt8100Field4": "tire_avg",
  "stackSt8100Page": "live",
  "stackSt8100TemperatureUnit": "c",
  "stackSt8100Dial": "auto",
  "stackSt8100Face": "black",
  "stackSt8100ShiftEnabled": true,
  "stackSt8100ShiftPercent": 90,
  "stackSt8100Alarms": [
    {
      "enabled": false,
      "metric": "tire_max",
      "direction": "high",
      "threshold": 120
    },
    {
      "enabled": false,
      "metric": "boost",
      "direction": "high",
      "threshold": 1.5
    },
    {
      "enabled": false,
      "metric": "rpm",
      "direction": "high",
      "threshold": 7000
    }
  ]
};
export const STACK_ST8100_LEGACY_KEYS = ["stackSt8100FuelWarningEnabled","stackSt8100FuelWarningPercent","stackSt8100TireWarningEnabled","stackSt8100TireWarningC","stackSt8100BoostWarningEnabled","stackSt8100BoostWarningBar"] as const;
const owns = (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isStackSt8100AlarmMetric(value: unknown): value is StackSt8100AlarmMetric {
  return typeof value === 'string' && owns(STACK_ST8100_ALARM_METRICS, value);
}
export function normalizeStackSt8100Number(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function normalizeStackSt8100Alarms(value: unknown): StackSt8100Alarms {
  return STACK_ST8100_DEFAULTS.stackSt8100Alarms.map((fallback, index) => {
    const input = Array.isArray(value) && isRecord(value[index]) ? value[index] : {};
    const metric = isStackSt8100AlarmMetric(input.metric) ? input.metric : fallback.metric;
    const spec = STACK_ST8100_ALARM_METRICS[metric];
    return { enabled: input.enabled === true, metric, direction: input.direction === 'low' ? 'low' : 'high',
      threshold: normalizeStackSt8100Number(input.threshold, spec.min, spec.max, spec.threshold) };
  }) as StackSt8100Alarms;
}
/** Changing metric discards incompatible units and requires explicitly re-enabling. */
export function changeStackSt8100AlarmMetric(alarm: StackSt8100Alarm, metric: StackSt8100AlarmMetric): StackSt8100Alarm {
  return { ...alarm, metric, enabled: false, threshold: STACK_ST8100_ALARM_METRICS[metric].threshold };
}
/** Retired fuel keys are removed; tire/boost settings migrate only when present. */
export function normalizeStackSt8100Config<T extends { hudStyle?: unknown }>(config: T): T {
  const next: Record<string, unknown> = { ...config };
  const active = config.hudStyle === STACK_ST8100_STYLE_ID;
  if (!owns(next, 'stackSt8100Alarms') && STACK_ST8100_LEGACY_KEYS.slice(2).some(key => owns(next, key))) {
    next.stackSt8100Alarms = [
      { metric: 'tire_max', enabled: next.stackSt8100TireWarningEnabled, threshold: next.stackSt8100TireWarningC },
      { metric: 'boost', enabled: next.stackSt8100BoostWarningEnabled, threshold: next.stackSt8100BoostWarningBar },
    ];
  }
  for (const key of STACK_ST8100_LEGACY_KEYS) delete next[key];
  for (const key of Object.keys(STACK_ST8100_DEFAULTS) as (keyof StackSt8100Settings)[]) {
    if (!active && !owns(next, key)) continue;
    const value = next[key], fallback = STACK_ST8100_DEFAULTS[key];
    if (key === 'stackSt8100Alarms') next[key] = normalizeStackSt8100Alarms(value);
    else if (key === 'stackSt8100ShiftEnabled') next[key] = typeof value === 'boolean' ? value : fallback;
    else if (key === 'stackSt8100ShiftPercent') next[key] = normalizeStackSt8100Number(value, 50, 100, 90);
    else {
      const allowed: readonly string[] = key === 'stackSt8100Dial' ? STACK_ST8100_DIALS
        : key === 'stackSt8100Face' ? ['black', 'white'] : key === 'stackSt8100Page' ? ['live', 'peaks']
          : key === 'stackSt8100TemperatureUnit' ? ['c', 'f'] : STACK_ST8100_FIELDS.map(field => field.value);
      next[key] = key.startsWith('stackSt8100Field') && value === 'fuel' ? 'race_time'
        : typeof value === 'string' && allowed.includes(value) ? value : fallback;
    }
  }
  return next as T;
}
export function readStackSt8100Settings(config: Partial<StackSt8100Settings>): StackSt8100Settings {
  return normalizeStackSt8100Config({ ...config, hudStyle: STACK_ST8100_STYLE_ID }) as StackSt8100Settings;
}
