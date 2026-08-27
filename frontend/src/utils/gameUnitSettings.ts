import type { UnitSettings } from '../context/SettingsContext';

export type GeneralUnitSystem = 'metric' | 'imperial';

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
