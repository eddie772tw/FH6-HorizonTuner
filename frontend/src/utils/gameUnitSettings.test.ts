import { describe, expect, it } from 'vitest';
import type { UnitSettings } from '../context/SettingsContext';
import { applyGeneralUnitSystem, inferGeneralUnitSystem } from './gameUnitSettings';

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
});
