export type GaugeValueKey = 'boost' | 'oilPressure' | 'oilTemperature' | 'waterTemperature';
export type GaugeSourceUnit = 'native' | 'C' | 'F' | 'psi' | 'bar' | 'kpa';
export interface GaugeValueSource { field: string; unit: GaugeSourceUnit; label: string; }
export type GaugeValueSources = Record<GaugeValueKey, GaugeValueSource>;
export const GAUGE_SOURCE_DEFAULTS: GaugeValueSources;
export const GAUGE_VALUE_KEYS: GaugeValueKey[];
export const GAUGE_SOURCE_UNITS: GaugeSourceUnit[];
export const GAUGE_TELEMETRY_FIELDS: string[];
export function normalizeGaugeValueSources(input: unknown): GaugeValueSources;
export function readGaugeValues(data: Record<string, unknown>, sources: GaugeValueSources, output: Record<GaugeValueKey, number | null>): Record<GaugeValueKey, number | null>;
