import type { UnitSettings } from '../context/SettingsContext';

export type GeneralUnitSystem = 'metric' | 'imperial';

export interface UnitPreferenceOverride {
  followGlobal: boolean;
  general: GeneralUnitSystem;
  power: UnitSettings['power'];
  spring: UnitSettings['springRate'];
}

export interface GranularUnitPreference {
  followGlobal: boolean;
  units: UnitSettings;
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

export function normalizeGeneralUnitSettings(units: UnitSettings): UnitSettings {
  return applyGeneralUnitSystem(units, inferGeneralUnitSystem(units));
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

export function createGranularUnitPreference(units: UnitSettings): GranularUnitPreference {
  return { followGlobal: true, units: { ...units } };
}

function isUnitValue<K extends keyof UnitSettings>(
  value: unknown,
  validValues: readonly UnitSettings[K][]
): value is UnitSettings[K] {
  return validValues.includes(value as UnitSettings[K]);
}

function mergeGranularUnits(globalUnits: UnitSettings, storedUnits: unknown): UnitSettings {
  const stored = storedUnits && typeof storedUnits === 'object'
    ? storedUnits as Partial<UnitSettings>
    : {};

  return {
    speed: isUnitValue(stored.speed, ['kmh', 'mph']) ? stored.speed : globalUnits.speed,
    weight: isUnitValue(stored.weight, ['kg', 'lbs']) ? stored.weight : globalUnits.weight,
    temperature: isUnitValue(stored.temperature, ['C', 'F']) ? stored.temperature : globalUnits.temperature,
    tirePressure: isUnitValue(stored.tirePressure, ['bar', 'psi', 'kpa']) ? stored.tirePressure : globalUnits.tirePressure,
    boostPressure: isUnitValue(stored.boostPressure, ['bar', 'psi', 'kpa']) ? stored.boostPressure : globalUnits.boostPressure,
    springRate: isUnitValue(stored.springRate, ['kgfmm', 'lbsin']) ? stored.springRate : globalUnits.springRate,
    rideHeight: isUnitValue(stored.rideHeight, ['cm', 'in']) ? stored.rideHeight : globalUnits.rideHeight,
    suspensionForce: isUnitValue(stored.suspensionForce, ['kgf', 'lbf']) ? stored.suspensionForce : globalUnits.suspensionForce,
    power: isUnitValue(stored.power, ['kw', 'hp', 'ps']) ? stored.power : globalUnits.power,
    torque: isUnitValue(stored.torque, ['nm', 'lbft']) ? stored.torque : globalUnits.torque
  };
}

export function normalizeGranularUnitPreference(
  storedPreference: unknown,
  globalUnits: UnitSettings
): GranularUnitPreference {
  const fallback = createGranularUnitPreference(globalUnits);
  if (!storedPreference || typeof storedPreference !== 'object') return fallback;

  const stored = storedPreference as Partial<GranularUnitPreference & UnitPreferenceOverride>;
  const followGlobal = typeof stored.followGlobal === 'boolean'
    ? stored.followGlobal
    : fallback.followGlobal;

  if ('units' in stored) {
    return {
      followGlobal,
      units: mergeGranularUnits(globalUnits, stored.units)
    };
  }

  const legacy = stored as Partial<UnitPreferenceOverride>;
  const general = legacy.general === 'imperial' || legacy.general === 'metric'
    ? legacy.general
    : inferGeneralUnitSystem(globalUnits);
  const legacyUnits = applyGeneralUnitSystem(globalUnits, general);
  return {
    followGlobal,
    units: {
      ...legacyUnits,
      power: legacy.power === 'kw' || legacy.power === 'hp' || legacy.power === 'ps'
        ? legacy.power
        : legacyUnits.power,
      springRate: legacy.spring === 'kgfmm' || legacy.spring === 'lbsin'
        ? legacy.spring
        : legacyUnits.springRate
    }
  };
}

export function resolveGranularUnitPreference(
  globalUnits: UnitSettings,
  preference: GranularUnitPreference
): UnitSettings {
  return preference.followGlobal ? globalUnits : preference.units;
}

export function loadGranularUnitPreference(
  storageKey: string,
  globalUnits: UnitSettings
): GranularUnitPreference {
  try {
    return normalizeGranularUnitPreference(
      JSON.parse(localStorage.getItem(storageKey) ?? '{}'),
      globalUnits
    );
  } catch {
    return createGranularUnitPreference(globalUnits);
  }
}
