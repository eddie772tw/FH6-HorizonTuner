import { describe, expect, it } from 'vitest';
import {
  calculateAEGOGearing,
  calculateChassisTuning,
  calculateStaticTireAlignment,
  type TuningCarParams,
} from './tuningMath';

const car: TuningCarParams = {
  weight: 1450,
  weight_distribution: 54,
  drivetrain: 'AWD',
  maxHp: 420,
  maxTorque: 500,
  maxHpRpm: 7000,
  maxTorqueRpm: 4500,
  frontTireWidth: 245,
  frontTireAspect: 40,
  frontTireRim: 17,
  rearTireWidth: 255,
  rearTireAspect: 40,
  rearTireRim: 17,
  spring_front_min: 20,
  spring_front_max: 100,
  spring_rear_min: 20,
  spring_rear_max: 100,
  height_front_min: 10,
  height_front_max: 25,
  height_rear_min: 10,
  height_rear_max: 25,
};

describe('Rally profile split', () => {
  it('keeps omitted and mixed-surface Rally output identical', () => {
    expect(calculateChassisTuning('Rally', car)).toEqual(
      calculateChassisTuning('Rally', { ...car, rallyProfile: 'mixed-surface' }),
    );
    expect(calculateAEGOGearing('Rally', 6, car, 7000)).toEqual(
      calculateAEGOGearing('Rally', 6, { ...car, rallyProfile: 'mixed-surface' }, 7000),
    );
  });

  it('gives cross-country more landing support and a rear-biased AWD diff', () => {
    const mixed = calculateChassisTuning('Rally', { ...car, rallyProfile: 'mixed-surface' });
    const crossCountry = calculateChassisTuning('Rally', { ...car, rallyProfile: 'cross-country' });
    expect(crossCountry.arb.rear).toBeGreaterThan(mixed.arb.rear);
    expect(crossCountry.springs.front).toBeGreaterThan(mixed.springs.front);
    expect(crossCountry.damping.bumpF).toBeGreaterThan(mixed.damping.bumpF);
    expect(crossCountry.diff.accelR).toBeGreaterThan(mixed.diff.accelR);
    expect(crossCountry.diff.centerRear).toBeLessThan(mixed.diff.centerRear);
    expect(crossCountry.springs.heightF).toBeGreaterThan(mixed.springs.heightF);
  });

  it('uses shorter cross-country gearing and conservative alignment baseline', () => {
    const mixedGearing = calculateAEGOGearing('Rally', 6, { ...car, rallyProfile: 'mixed-surface' }, 7000);
    const crossCountryGearing = calculateAEGOGearing('Rally', 6, { ...car, rallyProfile: 'cross-country' }, 7000);
    expect(crossCountryGearing.finalDrive).toBeGreaterThan(mixedGearing.finalDrive);
    const alignment = calculateStaticTireAlignment('Rally', 'Summer', { ...car, rallyProfile: 'cross-country' });
    expect(alignment.targetPhot).toBe(28.5);
    expect(alignment.camber.front).toBe(-0.8);
    expect(alignment.toe.front).toBe('0.0°');
  });

  it('does not alter Road output when a Rally profile is persisted', () => {
    expect(calculateChassisTuning('Road', car)).toEqual(
      calculateChassisTuning('Road', { ...car, rallyProfile: 'cross-country' }),
    );
    expect(calculateStaticTireAlignment('Road', 'Summer', car)).toEqual(
      calculateStaticTireAlignment('Road', 'Summer', { ...car, rallyProfile: 'cross-country' }),
    );
  });

  it('keeps DangerSign on its historical branch', () => {
    const historical = calculateChassisTuning('DangerSign', car);
    expect(historical.springs.heightF).toBe(25);
    expect(historical.arb.front).toBeCloseTo((64 * 0.54 + 1) * 0.35, 1);
    expect(calculateChassisTuning('DangerSign', { ...car, rallyProfile: 'cross-country' })).toEqual(
      calculateChassisTuning('DangerSign', car),
    );
    expect(calculateStaticTireAlignment('DangerSign', 'Summer', { ...car, rallyProfile: 'cross-country' })).toEqual(
      calculateStaticTireAlignment('DangerSign', 'Summer', car),
    );
  });

  it.each([0, 100, NaN, Infinity])('bounds invalid Rally weight distribution %s', bias => {
    for (const rallyProfile of ['mixed-surface', 'cross-country'] as const) {
      const result = calculateChassisTuning('Rally', { ...car, weight_distribution: bias, rallyProfile });
      Object.values(result).forEach(group => Object.values(group).forEach(value => expect(Number.isFinite(value)).toBe(true)));
    }
  });
});
