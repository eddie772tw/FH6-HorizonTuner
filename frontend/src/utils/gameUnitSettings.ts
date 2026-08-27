import type { UnitSettings } from '../context/SettingsContext';

export type GeneralUnitSystem = 'metric' | 'imperial';

export interface UnitPreferenceOverride {
  followGlobal: boolean;
  general: GeneralUnitSystem;
  power: UnitSettings['power'];
  spring: UnitSettings['springRate'];
}

export function inferGeneralUnitSystem(units: UnitSettings): GeneralUnitSystem {
  return units.speed === 'mph' ? 'imperial' : 'metric';
}

export function applyGeneralUnitSystem(
  units: UnitSettings,
  system: GeneralUnitSystem
): UnitSettings {
  return system === 'metric'
    ? {
        ...units,
        speed: 'kmh',
        weight: 'kg',
        temperature: 'C',
        tirePressure: 'bar',
        boostPressure: 'bar',
        rideHeight: 'cm',
        suspensionForce: 'kgf',
        torque: 'nm'
      }
    : {
        ...units,
        speed: 'mph',
        weight: 'lbs',
        temperature: 'F',
        tirePressure: 'psi',
        boostPressure: 'psi',
        rideHeight: 'in',
        suspensionForce: 'lbf',
        torque: 'lbft'
      };
}

export function createUnitPreference(units: UnitSettings): UnitPreferenceOverride {
  return {
    followGlobal: true,
    general: inferGeneralUnitSystem(units),
    power: units.power,
    spring: units.springRate
  };
}

export function resolveUnitPreference(
  globalUnits: UnitSettings,
  preference: UnitPreferenceOverride
): UnitSettings {
  if (preference.followGlobal) return globalUnits;

  return {
    ...applyGeneralUnitSystem(globalUnits, preference.general),
    power: preference.power,
    springRate: preference.spring
  };
}

export function loadUnitPreference(
  storageKey: string,
  globalUnits: UnitSettings
): UnitPreferenceOverride {
  const fallback = createUnitPreference(globalUnits);
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<UnitPreferenceOverride>;
    return {
      followGlobal: typeof stored.followGlobal === 'boolean' ? stored.followGlobal : fallback.followGlobal,
      general: stored.general === 'imperial' || stored.general === 'metric' ? stored.general : fallback.general,
      power: stored.power === 'kw' || stored.power === 'hp' || stored.power === 'ps' ? stored.power : fallback.power,
      spring: stored.spring === 'kgfmm' || stored.spring === 'lbsin' ? stored.spring : fallback.spring
    };
  } catch {
    return fallback;
  }
}
