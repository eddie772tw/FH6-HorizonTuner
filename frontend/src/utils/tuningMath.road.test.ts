import { describe, expect, it } from 'vitest';
import { calculateAEGOGearing, calculateChassisTuning, calculateMeasuredGearing, getRoadAwdRearPercent,
  type TuningCarParams } from './tuningMath';

const car: TuningCarParams = { weight: 1200, weight_distribution: 62, drivetrain: 'FWD',
  maxHp: 330, maxTorque: 420, maxHpRpm: 7200, maxTorqueRpm: 4800,
  frontTireWidth: 245, frontTireAspect: 40, frontTireRim: 18,
  spring_front_min: 20, spring_front_max: 150, spring_rear_min: 15, spring_rear_max: 130 };
const totalFirst = (p: TuningCarParams) => {
  const result = calculateAEGOGearing('Road', 6, p, 8100);
  return result.finalDrive * result.gears[0];
};
describe('Road driven-axle baseline', () => {
  it('supports front compliance and rear rotation without changing the non-driven differential', () => {
    const fwd = calculateChassisTuning('Road', car);
    const rwd = calculateChassisTuning('Road', { ...car, drivetrain: 'RWD' });
    expect(fwd.arb.front).toBeLessThan(fwd.arb.rear);
    expect(fwd.springs.front).toBeLessThan(rwd.springs.front);
    expect(fwd.springs.rear).toBeGreaterThan(rwd.springs.rear);
    expect(fwd.diff.accelF).toBeGreaterThanOrEqual(20);
    expect(fwd.diff.accelF).toBeLessThanOrEqual(30);
    expect(fwd.diff.accelR).toBe(0);
    expect(fwd.diff.decelR).toBe(0);
  });
  it('lengthens FWD launch as torque rises or front load falls, using front tyre geometry', () => {
    expect(totalFirst({ ...car, maxTorque: 700 })).toBeLessThan(totalFirst(car));
    expect(totalFirst({ ...car, weight_distribution: 45 })).toBeLessThan(totalFirst(car));
    expect(totalFirst({ ...car, frontTireRim: 20 })).toBeGreaterThan(totalFirst(car));
    expect(totalFirst({ ...car, rearTireRim: 22 })).toBe(totalFirst(car));
  });
  it('does not infer FWD grip from a hidden compound label', () => {
    expect(totalFirst({ ...car, tireType: 'Stock' })).toBe(totalFirst({ ...car, tireType: 'Drag' }));
  });
  it.each([4, 5, 6, 7, 8, 9, 10])('keeps %i measured gears positive and strictly descending', gears => {
    for (const torque of [150, 420, 1200]) {
      const result = calculateMeasuredGearing('Road', gears, { ...car, maxTorque: torque },
        { engineMaxRpm: 8100, peakPowerRpm: 7200, peakTorqueRpm: 4800 })!;
      expect(result.gears).toHaveLength(gears);
      expect(result.finalDrive).toBeGreaterThanOrEqual(2);
      expect(result.finalDrive).toBeLessThanOrEqual(6.1);
      result.gears.forEach((ratio, index) => {
        expect(Number.isFinite(ratio)).toBe(true);
        expect(ratio).toBeGreaterThan(0);
        if (index) expect(ratio).toBeLessThan(result.gears[index - 1]);
      });
    }
  });
  it('preserves the default AWD result, applies the complete override range only to Road', () => {
    const awd = { ...car, drivetrain: 'AWD' as const };
    expect(getRoadAwdRearPercent(awd)).toBe(60);
    for (const split of [0, 35, 50, 75, 100]) {
      const overridden = { ...awd, roadAwdRearPercent: split };
      expect(calculateChassisTuning('Road', overridden).diff.centerRear).toBe(split);
      for (const goal of ['Rally', 'Drag', 'Drift', 'DangerSign']) {
        expect(calculateChassisTuning(goal, overridden)).toEqual(calculateChassisTuning(goal, awd));
        expect(calculateAEGOGearing(goal, 6, overridden, 8100)).toEqual(calculateAEGOGearing(goal, 6, awd, 8100));
      }
    }
    expect(totalFirst({ ...awd, roadAwdRearPercent: 0 })).toBeLessThan(totalFirst(awd));
  });
  it.each([0, 100, NaN, Infinity, -20, 150])('sanitizes a front-weight input of %s without mutation', bias => {
    const input = { ...car, weight_distribution: bias, roadAwdRearPercent: NaN };
    const before = structuredClone(input);
    const chassis = calculateChassisTuning('Road', input);
    Object.values(chassis).forEach(group => Object.values(group).forEach(value => expect(Number.isFinite(value)).toBe(true)));
    expect(input).toEqual(before);
  });
  it('falls back on missing nonfinite data and keeps an invalid centre override disabled', () => {
    const input = { ...car, weight: Infinity, maxHp: NaN, maxTorque: Infinity,
      aero_downforce_front: NaN, spring_front_min: 90, spring_front_max: 40, frontTireWidth: 0 };
    const result = calculateAEGOGearing('Road', NaN, input, 0);
    expect(result.gears).toHaveLength(6);
    expect(result.gears.every(Number.isFinite)).toBe(true);
    expect(calculateChassisTuning('Road', input).springs.front).toBe(90);
    expect(getRoadAwdRearPercent({ ...car, roadAwdRearPercent: Infinity })).toBe(getRoadAwdRearPercent(car));
  });
});
