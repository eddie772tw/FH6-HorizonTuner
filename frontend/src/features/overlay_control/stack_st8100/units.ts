import { barToPsi, psiToBar } from '../../../utils/units';
import type { HudDisplayUnits } from '../HudUnitSettingsSidebar';
import { STACK_ST8100_ALARM_METRICS, normalizeStackSt8100Number, type StackSt8100AlarmMetric, type StackSt8100TemperatureUnit } from './config';

export type StackSt8100ThresholdMetric = StackSt8100AlarmMetric | 'shift_percent';
export interface StackSt8100DisplayUnits extends HudDisplayUnits {
  temperature: StackSt8100TemperatureUnit;
}
export function resolveStackSt8100DisplayUnits(
  config: { followAppUnits?: boolean; units?: Partial<HudDisplayUnits>; stackSt8100TemperatureUnit?: StackSt8100TemperatureUnit },
  appUnits: HudDisplayUnits,
): StackSt8100DisplayUnits {
  const units = config.followAppUnits !== false ? appUnits : { speed: 'kmh', boostPressure: 'bar', power: 'hp', torque: 'nm', ...config.units } as HudDisplayUnits;
  return { ...units, temperature: config.stackSt8100TemperatureUnit ?? 'c' };
}
export function stackSt8100ThresholdSpec(metric: StackSt8100ThresholdMetric) {
  return metric === 'shift_percent' ? { min: 50, max: 100, threshold: 90 } : STACK_ST8100_ALARM_METRICS[metric];
}
export function stackSt8100ThresholdUnit(metric: StackSt8100ThresholdMetric, units: StackSt8100DisplayUnits): string {
  if (metric === 'shift_percent') return '% max RPM';
  if (metric === 'throttle' || metric === 'brake') return '%';
  if (metric === 'tire_avg' || metric === 'tire_max') return units.temperature === 'f' ? '°F' : '°C';
  if (metric === 'boost') return units.boostPressure === 'kpa' ? 'kPa' : units.boostPressure;
  if (metric === 'speed') return units.speed === 'mph' ? 'mph' : 'km/h';
  if (metric === 'power') return units.power === 'kw' ? 'kW' : units.power === 'ps' ? 'PS' : 'hp';
  if (metric === 'torque') return units.torque === 'lbft' ? 'lb-ft' : 'Nm';
  return 'RPM';
}
export function stackSt8100ThresholdToDisplay(metric: StackSt8100ThresholdMetric, value: number, units: StackSt8100DisplayUnits): number {
  if ((metric === 'tire_avg' || metric === 'tire_max') && units.temperature === 'f') return value * 9 / 5 + 32;
  if (metric === 'boost') return units.boostPressure === 'psi' ? barToPsi(value) : units.boostPressure === 'kpa' ? value * 100 : value;
  if (metric === 'speed' && units.speed === 'mph') return value / 1.609344;
  if (metric === 'power') return units.power === 'hp' ? value * 1000 / 745.7 : units.power === 'ps' ? value * 1.35962 : value;
  if (metric === 'torque' && units.torque === 'lbft') return value * 0.73756;
  return value;
}
export function stackSt8100ThresholdFromDisplay(metric: StackSt8100ThresholdMetric, value: number, units: StackSt8100DisplayUnits): number {
  let canonical = value;
  if ((metric === 'tire_avg' || metric === 'tire_max') && units.temperature === 'f') canonical = (value - 32) * 5 / 9;
  if (metric === 'boost') canonical = units.boostPressure === 'psi' ? psiToBar(value) : units.boostPressure === 'kpa' ? value / 100 : value;
  if (metric === 'speed' && units.speed === 'mph') canonical = value * 1.609344;
  if (metric === 'power') canonical = units.power === 'hp' ? value * 745.7 / 1000 : units.power === 'ps' ? value / 1.35962 : value;
  if (metric === 'torque' && units.torque === 'lbft') canonical = value / 0.73756;
  const spec = stackSt8100ThresholdSpec(metric);
  return normalizeStackSt8100Number(canonical, spec.min, spec.max, spec.threshold);
}
/** Form drafts may be incomplete; only commit a complete finite decimal. */
export function parseStackSt8100ThresholdDraft(metric: StackSt8100ThresholdMetric, draft: string, units: StackSt8100DisplayUnits): number | null {
  const text = draft.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? stackSt8100ThresholdFromDisplay(metric, value, units) : null;
}
