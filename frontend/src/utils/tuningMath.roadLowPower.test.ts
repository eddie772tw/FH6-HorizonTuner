import { describe, expect, it } from 'vitest';
import { calculateAEGOGearing, calculateMeasuredGearing, calcGearSpeed, type TuningCarParams } from './tuningMath';

const beetle: TuningCarParams = {
  weight: 801.952, weight_distribution: 42, drivetrain: 'RWD', induction: 'NA',
  maxHp: 72, maxTorque: 158.631, maxHpRpm: 3365.312, maxTorqueRpm: 2832.948,
  rearTireWidth: 245, rearTireAspect: 50, rearTireRim: 15, aeroEfficiency: 0.855,
};
const circumference = Math.PI * 0.626;
const launchTarget = (p: TuningCarParams) => p.weight * 9.81 * 0.725 * 0.313 / (p.maxTorque * 0.90);

describe('Road joint endpoint allocation', () => {
  it.each([
    [12, 0.8, 6, 2, 6, 0.4],
    [36.6, 4.392, 6, 6.1, 6, 0.72],
    [2.06, 2, 4, 2.07, 1, 0.97],
    [8, 1.4436, 6, 2, 4, 0.72],
  ])('preserves quantized endpoints at grid boundaries (%s, %s)', (first, top, count, fd, firstGear, topGear) => {
    const targetSpeed = Math.cbrt(72) * 37 * (1 + 0.12 * 0.855) * 0.95;
    const params = { ...beetle, weight: beetle.weight * first / launchTarget(beetle),
      maxHpRpm: top * targetSpeed * 1000 / (circumference * 60) };
    const result = calculateAEGOGearing('Road', count, params, 10000);
    expect(result.unsupported).not.toBe(true);
    expect(result.finalDrive).toBe(fd);
    expect([result.gears[0], result.gears[count - 1]]).toEqual([firstGear, topGear]);
  });
  it.each([3365.312, 3983.44])('fixes launch independently of peak-power input %s', rpm => {
    const result = calculateAEGOGearing('Road', 6, { ...beetle, maxHpRpm: rpm }, 6000);
    expect(result.unsupported).not.toBe(true);
    expect(result.gears).toHaveLength(6);
    const first = result.finalDrive * result.gears[0];
    expect(Math.abs(first - launchTarget(beetle))).toBeLessThanOrEqual(result.finalDrive * 0.005 + 1e-9);
    expect(first).toBeGreaterThan(2.41 * 4.14); // Race-six initial setting, not factory four-speed.
    expect(new Set(result.gears).size).toBe(6);
    const targetTop = rpm * circumference * 60 / (Math.cbrt(72) * 37 * (1 + 0.12 * 0.855) * 0.95 * 1000);
    expect(Math.abs(result.finalDrive * result.gears[5] - targetTop)).toBeLessThanOrEqual(result.finalDrive * 0.005 + 1e-9);
  });
  it.each([4, 5, 6, 7, 8, 9, 10])('allocates all %i installed gears across drivetrains', count => {
    for (const drivetrain of ['FWD', 'RWD', 'AWD'] as const) {
      for (const torque of [80, 158.631, 250]) {
        const result = calculateAEGOGearing('Road', count, { ...beetle, drivetrain, maxTorque: torque }, 6000);
        expect(result.unsupported).not.toBe(true);
        expect(result.gears).toHaveLength(count);
        expect(result.finalDrive).toBeGreaterThanOrEqual(2);
        expect(result.finalDrive).toBeLessThanOrEqual(6.1);
        result.gears.forEach((g, i) => {
          expect(Number.isFinite(g)).toBe(true);
          expect(g).toBeGreaterThanOrEqual(i ? 0.4 : 1);
          expect(g).toBeLessThanOrEqual(6);
          if (i) expect(result.gears[i - 1] - g).toBeGreaterThanOrEqual(0.01 - 1e-9);
        });
      }
    }
  });
  it('does not classify the same observed curve differently by induction label', () => {
    const solve = (induction: TuningCarParams['induction']) => calculateAEGOGearing('Road', 6, { ...beetle, induction }, 6000, { simulatedTopSpeed: 240 });
    expect(solve('NA')).toEqual(solve('Turbo'));
  });
  it.each([1, 5000])('reports conflicting launch/terminal targets at torque %s without usable ratios', maxTorque => {
    const result = calculateAEGOGearing('Road', 6, { ...beetle, maxTorque }, 6000);
    expect(result.unsupported).toBe(true);
    expect(result.unsupportedReason).toMatch(/model targets/i);
    expect(result.gears).toEqual([]);
  });
  it('retains failure information through the measured adapter and uses measured torque', () => {
    const engine = { engineMaxRpm: 6000, peakPowerRpm: 3983.44, peakTorqueRpm: 2392, peakTorqueNm: 158.84 };
    expect(calculateMeasuredGearing('Road', 6, { ...beetle, maxTorque: 5000 }, engine)?.unsupported).not.toBe(true);
    expect(calculateMeasuredGearing('Road', 6, beetle, { ...engine, peakTorqueNm: 1 })?.unsupported).toBe(true);
  });
  it('resolves explicit top-speed correction jointly without changing launch multiplication', () => {
    const base = calculateAEGOGearing('Road', 6, beetle, 6000);
    const corrected = calculateAEGOGearing('Road', 6, beetle, 6000, { softMaxSpeed: 200 });
    expect(corrected.unsupported).not.toBe(true);
    expect(Math.abs(corrected.finalDrive * corrected.gears[0] - launchTarget(beetle))).toBeLessThanOrEqual(corrected.finalDrive * 0.005 + 1e-9);
    expect(calcGearSpeed(6000, corrected.gears[5], corrected.finalDrive, 0.313) * 3.6).toBeCloseTo(200, 0);
    expect(corrected.finalDrive * corrected.gears[5]).toBeGreaterThan(base.finalDrive * base.gears[5]);
  });
});
