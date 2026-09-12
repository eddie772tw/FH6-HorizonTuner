import { describe, expect, it } from 'vitest';
import { calculateAEGOGearing, calculateChassisTuning, TuningCarParams } from './tuningMath';

const baseCar: TuningCarParams = {
  weight: 1350,
  weight_distribution: 54,
  drivetrain: 'RWD',
  induction: 'NA',
  maxHp: 400,
  maxTorque: 500,
  maxHpRpm: 6500,
  maxTorqueRpm: 4000,
  rearTireWidth: 275,
  rearTireAspect: 35,
  rearTireRim: 18
};

describe('Drift meta drivetrain boundaries', () => {
  it('interpolates the sourced four-point shape across every supported gear count', () => {
    for (let count = 4; count <= 10; count++) {
      const result = calculateAEGOGearing('Drift', count, baseCar, 7000);
      expect(result.gears).toHaveLength(count);
      for (let i = 0; i < count; i++) expect(result.gears[i]).toBeGreaterThan(0);
      for (let i = 1; i < count; i++) expect(result.gears[i]).toBeLessThan(result.gears[i - 1]);
    }
  });

  it('changes the ladder when the measured torque-to-power RPM band changes', () => {
    const lowBand = calculateAEGOGearing('Drift', 6, baseCar, 7000);
    const highBand = calculateAEGOGearing('Drift', 6, { ...baseCar, maxTorqueRpm: 6200 }, 7000);
    expect(lowBand.gears).not.toEqual(highBand.gears);
  });

  it('fails safely to finite positive gearing for nonfinite engine inputs', () => {
    const result = calculateAEGOGearing('Drift', 8, { ...baseCar, maxTorque: Number.NaN, maxHpRpm: Number.NaN, maxTorqueRpm: Number.NaN }, Number.NaN);
    expect(Number.isFinite(result.finalDrive)).toBe(true);
    expect(result.gears).toHaveLength(8);
    for (let i = 0; i < result.gears.length; i++) expect(Number.isFinite(result.gears[i]) && result.gears[i] > 0).toBe(true);
    for (let i = 1; i < result.gears.length; i++) expect(result.gears[i]).toBeLessThan(result.gears[i - 1]);
  });

  it('gives AWD a rear-biased center split while retaining front axle lock', () => {
    const result = calculateChassisTuning('Drift', { ...baseCar, drivetrain: 'AWD' });
    expect(result.diff.accelF).toBe(85);
    expect(result.diff.accelR).toBe(60);
    expect(result.diff.centerRear).toBe(75);
  });

  it('does not apply the RWD rear power-oversteer baseline to FWD', () => {
    const result = calculateChassisTuning('Drift', { ...baseCar, drivetrain: 'FWD' });
    expect(result.diff.accelF).toBe(85);
    expect(result.diff.decelF).toBe(5);
    expect(result.diff.accelR).toBe(0);
    expect(result.diff.decelR).toBe(0);
  });
});
