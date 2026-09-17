import { describe, expect, it } from 'vitest';
import { calculateDevGearing, calculateTireCircumferenceM } from './gearSpeed';
import type { DevTuningInput } from '../../../utils/tuningMath_dev';

describe('gearSpeed domain calculations', () => {
  describe('calculateTireCircumferenceM', () => {
    it('calculates circumference for FWD car using front tire dimensions', () => {
      const car: DevTuningInput['car'] = {
        weight: 1200,
        weight_distribution: 60,
        drivetrain: 'FWD',
        maxHp: 200,
        maxHpRpm: 6000,
        maxTorqueRpm: 4000,
        frontTireWidth: 225,
        frontTireAspect: 45,
        frontTireRim: 17,
        rearTireWidth: 255,
        rearTireAspect: 35,
        rearTireRim: 19
      };

      // Sidewall height = (225 * 45 / 100) = 101.25 mm
      // Diameter = 101.25 * 2 + 17 * 25.4 = 202.5 + 431.8 = 634.3 mm = 0.6343 m
      // Circumference = 0.6343 * PI ≈ 1.992688... m
      const expectedCircumference = (((225 * 45 / 100) * 2 + 17 * 25.4) * Math.PI) / 1000;
      expect(calculateTireCircumferenceM(car)).toBeCloseTo(expectedCircumference, 6);
    });

    it('calculates circumference for RWD/AWD car using rear tire dimensions', () => {
      const carRwd: DevTuningInput['car'] = {
        weight: 1500,
        weight_distribution: 50,
        drivetrain: 'RWD',
        maxHp: 400,
        maxHpRpm: 6500,
        maxTorqueRpm: 4500,
        frontTireWidth: 245,
        frontTireAspect: 40,
        frontTireRim: 18,
        rearTireWidth: 295,
        rearTireAspect: 30,
        rearTireRim: 20
      };

      const expectedCircumference = (((295 * 30 / 100) * 2 + 20 * 25.4) * Math.PI) / 1000;
      expect(calculateTireCircumferenceM(carRwd)).toBeCloseTo(expectedCircumference, 6);

      const carAwd: DevTuningInput['car'] = {
        ...carRwd,
        drivetrain: 'AWD'
      };
      expect(calculateTireCircumferenceM(carAwd)).toBeCloseTo(expectedCircumference, 6);
    });

    it('uses fallback default values (245/40R18) when tire dimensions are undefined or non-finite', () => {
      const carWithUndefined: DevTuningInput['car'] = {
        weight: 1300,
        weight_distribution: 55,
        drivetrain: 'FWD',
        maxHp: 150,
        maxHpRpm: 5500,
        maxTorqueRpm: 3500
      };

      const expectedFallbackCircumference = (((245 * 40 / 100) * 2 + 18 * 25.4) * Math.PI) / 1000;
      expect(calculateTireCircumferenceM(carWithUndefined)).toBeCloseTo(expectedFallbackCircumference, 6);

      const carWithNonFinite: DevTuningInput['car'] = {
        weight: 1300,
        weight_distribution: 55,
        drivetrain: 'RWD',
        maxHp: 150,
        maxHpRpm: 5500,
        maxTorqueRpm: 3500,
        rearTireWidth: NaN,
        rearTireAspect: Infinity,
        rearTireRim: undefined
      };

      expect(calculateTireCircumferenceM(carWithNonFinite)).toBeCloseTo(expectedFallbackCircumference, 6);
    });
  });

  describe('calculateDevGearing', () => {
    const baseInput: DevTuningInput = {
      raceGoal: 'Road',
      surface: 'tarmac',
      targetTopSpeedKmh: 280,
      targetRideFrequencyFrontHz: 2.0,
      targetRideFrequencyRearHz: 2.2,
      dampingRatioFront: 0.65,
      dampingRatioRear: 0.65,
      car: {
        weight: 1400,
        weight_distribution: 52,
        drivetrain: 'AWD',
        maxHp: 350,
        maxHpRpm: 7000,
        maxTorqueRpm: 5000,
        rearTireWidth: 265,
        rearTireAspect: 35,
        rearTireRim: 19,
        adjustability: { gears: 6 }
      }
    };

    it('calculates dev gearing output correctly for Road goal', () => {
      const output = calculateDevGearing(baseInput);

      expect(output.gears.length).toBe(6);
      expect(output.finalDrive).toBeGreaterThanOrEqual(2.0);
      expect(output.finalDrive).toBeLessThanOrEqual(6.5);
      expect(output.tireCircumferenceM).toBeGreaterThan(0);
      expect(output.topSpeedAtPeakHpKmh).toBeGreaterThan(0);
    });

    it('adjusts gearing based on race goals (Drag, Drift, Rally)', () => {
      const dragOutput = calculateDevGearing({ ...baseInput, raceGoal: 'Drag' });
      const driftOutput = calculateDevGearing({ ...baseInput, raceGoal: 'Drift' });
      const rallyOutput = calculateDevGearing({ ...baseInput, raceGoal: 'Rally' });

      expect(dragOutput.gears.length).toBe(6);
      expect(driftOutput.gears.length).toBe(6);
      expect(rallyOutput.gears.length).toBe(6);
    });

    it('clamps gear counts and target speed within expected boundaries', () => {
      const customInput: DevTuningInput = {
        ...baseInput,
        targetTopSpeedKmh: 600, // exceeds 450 max clamp
        car: {
          ...baseInput.car,
          adjustability: { gears: 12 } // exceeds 10 max clamp
        }
      };

      const output = calculateDevGearing(customInput);
      expect(output.gears.length).toBe(10);
    });
  });
});
