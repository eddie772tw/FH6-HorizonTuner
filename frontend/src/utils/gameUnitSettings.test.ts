import { describe, expect, it } from 'vitest';
import type { UnitSettings } from '../context/SettingsContext';
import {
  applyGeneralUnitSystem,
  createGranularUnitPreference,
  createUnitPreference,
  inferGeneralUnitSystem,
  normalizeGranularUnitPreference,
  normalizeGeneralUnitSettings,
  resolveGranularUnitPreference,
  resolveUnitPreference
} from './gameUnitSettings';

const units: UnitSettings = {
  speed: 'kmh', weight: 'kg', temperature: 'C', tirePressure: 'psi',
  boostPressure: 'bar', springRate: 'kgfmm', rideHeight: 'cm',
  suspensionForce: 'kgf', power: 'hp', torque: 'nm'
};

describe('game-style unit settings', () => {
  it('maps the general metric selection without changing power or spring units', () => {
    const result = applyGeneralUnitSystem({ ...units, speed: 'mph' }, 'metric');
    expect(result).toMatchObject({
      speed: 'kmh', weight: 'kg', temperature: 'C', tirePressure: 'bar',
      boostPressure: 'bar', rideHeight: 'cm', suspensionForce: 'kgf', torque: 'nm',
      power: 'hp', springRate: 'kgfmm'
    });
  });

  it('maps the general imperial selection without changing power or spring units', () => {
    const result = applyGeneralUnitSystem(units, 'imperial');
    expect(result).toMatchObject({
      speed: 'mph', weight: 'lbs', temperature: 'F', tirePressure: 'psi',
      boostPressure: 'psi', rideHeight: 'in', suspensionForce: 'lbf', torque: 'lbft',
      power: 'hp', springRate: 'kgfmm'
    });
  });

  it('uses speed as the backward-compatible general-unit discriminator', () => {
    expect(inferGeneralUnitSystem(units)).toBe('metric');
    expect(inferGeneralUnitSystem({ ...units, speed: 'mph' })).toBe('imperial');
  });

  it('migrates legacy mixed metric settings while preserving independent categories', () => {
    expect(normalizeGeneralUnitSettings({ ...units, power: 'ps', springRate: 'lbsin' })).toMatchObject({
      speed: 'kmh', tirePressure: 'bar', boostPressure: 'bar', torque: 'nm',
      power: 'ps', springRate: 'lbsin'
    });
  });

  it('resolves a three-category override without mutating global units', () => {
    const globalUnits = { ...units };
    const result = resolveUnitPreference(globalUnits, {
      followGlobal: false,
      general: 'imperial',
      power: 'ps',
      spring: 'lbsin'
    });

    expect(result).toMatchObject({ speed: 'mph', torque: 'lbft', power: 'ps', springRate: 'lbsin' });
    expect(globalUnits).toEqual(units);
  });

  it('returns global units unchanged while following the app', () => {
    expect(resolveUnitPreference(units, createUnitPreference(units))).toBe(units);
  });

  it('migrates the legacy telemetry preference into a complete custom-unit snapshot', () => {
    const preference = normalizeGranularUnitPreference({
      followGlobal: false,
      general: 'imperial',
      power: 'ps',
      spring: 'lbsin'
    }, units);

    expect(preference).toEqual({
      followGlobal: false,
      units: {
        ...units,
        speed: 'mph',
        weight: 'lbs',
        temperature: 'F',
        tirePressure: 'psi',
        boostPressure: 'psi',
        springRate: 'lbsin',
        rideHeight: 'in',
        suspensionForce: 'lbf',
        power: 'ps',
        torque: 'lbft'
      }
    });
  });

  it('resolves an independently configurable telemetry unit snapshot', () => {
    const preference = createGranularUnitPreference(units);
    preference.followGlobal = false;
    preference.units = {
      ...preference.units,
      speed: 'mph',
      tirePressure: 'kpa',
      boostPressure: 'bar',
      power: 'ps',
      torque: 'nm'
    };

    expect(resolveGranularUnitPreference(units, preference)).toEqual(preference.units);
    expect(resolveGranularUnitPreference(units, { ...preference, followGlobal: true })).toBe(units);
  });
});
