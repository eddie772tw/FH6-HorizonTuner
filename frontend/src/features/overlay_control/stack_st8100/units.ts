import { barToPsi, psiToBar } from '../../../utils/units';
import type { HudDisplayUnits } from '../HudUnitSettingsSidebar';
import { normalizeStackSt8100Threshold, type StackSt8100TemperatureUnit, type StackSt8100Threshold } from './config';

type BoostUnit = HudDisplayUnits['boostPressure'];
export interface StackSt8100DisplayUnits {
  temperature: StackSt8100TemperatureUnit;
  boostPressure: BoostUnit;
}

export function resolveStackSt8100BoostUnit(
  config: { followAppUnits?: boolean; units?: Partial<HudDisplayUnits> },
  appUnits: Pick<HudDisplayUnits, 'boostPressure'>,
): BoostUnit {
  return config.followAppUnits !== false ? appUnits.boostPressure : config.units?.boostPressure ?? 'bar';
}

export function stackSt8100ThresholdToDisplay(key: StackSt8100Threshold, value: number, units: StackSt8100DisplayUnits): number {
  if (key === 'stackSt8100TireWarningC') return units.temperature === 'f' ? value * 9 / 5 + 32 : value;
  if (key === 'stackSt8100BoostWarningBar') return units.boostPressure === 'psi' ? barToPsi(value) : units.boostPressure === 'kpa' ? value * 100 : value;
  return value;
}

export function stackSt8100ThresholdFromDisplay(key: StackSt8100Threshold, value: number, units: StackSt8100DisplayUnits): number {
  let canonical = value;
  if (key === 'stackSt8100TireWarningC' && units.temperature === 'f') canonical = (value - 32) * 5 / 9;
  if (key === 'stackSt8100BoostWarningBar') canonical = units.boostPressure === 'psi' ? psiToBar(value) : units.boostPressure === 'kpa' ? value / 100 : value;
  return normalizeStackSt8100Threshold(key, canonical);
}

/** Form drafts may be incomplete; only commit a complete finite decimal. */
export function parseStackSt8100ThresholdDraft(key: StackSt8100Threshold, draft: string, units: StackSt8100DisplayUnits): number | null {
  const text = draft.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? stackSt8100ThresholdFromDisplay(key, value, units) : null;
}
