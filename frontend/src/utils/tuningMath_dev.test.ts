import { describe, expect, it } from 'vitest';
import { calculateFrictionEllipse } from '../domain/tuning/tires/tireModel';
import {
  calculateDevTuning,
  calculateLoadTransfer,
  calculateTireGeometry,
  calculateTireVerticalStiffnessPrior,
  DevTuningInput,
  getDevTirePrior
} from './tuningMath_dev';

const baseInput: DevTuningInput = {
  raceGoal: 'Road',
  surface: 'tarmac',
  targetTopSpeedKmh: 280,
  targetRideFrequencyFrontHz: 2.2,
  targetRideFrequencyRearHz: 2.3,
  dampingRatioFront: 0.70,
  dampingRatioRear: 0.70,
  car: {
    weight: 1500,
    weight_distribution: 54,
    drivetrain: 'AWD',
    maxHp: 500,
    maxHpRpm: 7000,
    maxTorqueRpm: 4500,
    tireType: 'Sport',
    frontTireWidth: 245,
    frontTireAspect: 40,
    frontTireRim: 18,
    rearTireWidth: 275,
    rearTireAspect: 35,
    rearTireRim: 18,
    adjustability: {
      gears: 6,
      suspension: 'Race',
      arb: 'Adjustable',
      gearbox: 'Full',
      diff: 'Adjustable'
    },
    spring_front_min: 10,
    spring_front_max: 120,
    spring_rear_min: 10,
    spring_rear_max: 120,
    height_front_min: 10,
    height_front_max: 25,
    height_rear_min: 10,
    height_rear_max: 25,
    arb_front_min: 1,
    arb_front_max: 65,
    arb_rear_min: 1,
    arb_rear_max: 65
  }
};

describe('tuningMath_dev', () => {
  it('exposes tire coefficients as calibration priors with surface effects', () => {
    const tarmac = getDevTirePrior('Sport', 'tarmac');
    const snow = getDevTirePrior('Sport', 'snow');

    expect(tarmac.source).toBe('calibration-prior');
    expect(tarmac.peakSlipRatio).toBeGreaterThan(0);
    expect(tarmac.peakSlipAngleDeg).toBeGreaterThan(0);
    expect(tarmac.muLongitudinal).toBeGreaterThan(snow.muLongitudinal);
    expect(tarmac.muLateral).toBeGreaterThan(snow.muLateral);
  });

  it('keeps combined longitudinal and lateral demand inside a friction ellipse', () => {
    const feasible = calculateFrictionEllipse({
      muLongitudinal: 1,
      muLateral: 1,
      normalForceN: 1000,
      longitudinalDemandN: 600,
      lateralDemandN: 600
    });
    const infeasible = calculateFrictionEllipse({
      muLongitudinal: 1,
      muLateral: 1,
      normalForceN: 1000,
      longitudinalDemandN: 900,
      lateralDemandN: 900
    });

    expect(feasible.utilization).toBeCloseTo(Math.sqrt(0.72), 8);
    expect(feasible.feasible).toBe(true);
    expect(infeasible.feasible).toBe(false);
    expect(infeasible.maxLongitudinalForceN).toBe(1000);
  });

  it('returns a stable typed result with descending gear ratios', () => {
    const result = calculateDevTuning(baseInput);

    expect(result.schemaVersion).toBe('tuning-dev/v1');
    expect(result.inputSummary).toEqual({ raceGoal: 'Road', surface: 'tarmac', drivetrain: 'AWD' });
    expect(result.gearing.gears).toHaveLength(6);
    expect(result.gearing.gears.every((ratio, index, ratios) => index === 0 || ratio < ratios[index - 1])).toBe(true);
    expect(result.chassis.springs.frontKgfMm).toBeGreaterThanOrEqual(10);
    expect(result.chassis.springs.frontKgfMm).toBeLessThanOrEqual(120);
    expect(result.warnings.some((warning) => warning.includes('calibration priors'))).toBe(true);
  });

  it('clamps outputs to supplied FH6 part boundaries and reports locks', () => {
    const result = calculateDevTuning({
      ...baseInput,
      targetRideFrequencyFrontHz: 4.5,
      targetRideFrequencyRearHz: 4.5,
      car: {
        ...baseInput.car,
        adjustability: { gears: 4, suspension: 'Fixed', arb: 'Fixed', gearbox: 'Fixed', diff: 'Fixed' },
        spring_front_min: 20,
        spring_front_max: 25,
        spring_rear_min: 20,
        spring_rear_max: 23,
        arb_front_min: 5,
        arb_front_max: 6,
        arb_rear_min: 7,
        arb_rear_max: 8
      }
    });

    expect(result.chassis.springs.frontKgfMm).toBe(25);
    expect(result.chassis.springs.rearKgfMm).toBe(23);
    expect(result.chassis.arb.front).toBe(6);
    expect(result.chassis.arb.rear).toBe(8);
    expect(result.gearing.gears).toHaveLength(4);
    expect(result.warnings).toHaveLength(8);
    expect(result.warnings.some((w) => w.includes('direct wheel-load approximation'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('explicit physical critical damping'))).toBe(true);
  });

  it('exposes typed load-transfer and tire-geometry pure functions through the developer façade', () => {
    const geo = calculateTireGeometry({ widthMm: 245, aspectRatio: 40, rimDiameterIn: 18 });
    expect(geo.sidewallHeightMm).toBeCloseTo(98.0, 2);
    expect(geo.overallDiameterMm).toBeCloseTo(653.2, 2);

    const stiffness = calculateTireVerticalStiffnessPrior(geo, { pressurePsi: 32.0 });
    expect(stiffness.source).toBe('geometric-heuristic-prior/v1');
    expect(stiffness.isHeuristic).toBe(true);
    expect(stiffness.verticalStiffnessNPerM).toBeGreaterThan(200000);

    const lt = calculateLoadTransfer({
      massKg: 1500,
      weightDistributionFrontPct: 54,
      wheelbaseM: 2.65,
      cgHeightM: 0.48,
      accelLongitudinalMPerS2: 2.0,
      accelLateralMPerS2: 3.0
    });
    expect(lt.staticAxleLoadsN.total).toBeCloseTo(1500 * 9.80665, 1);
    expect(lt.transfersN.longitudinalTransferN).toBeGreaterThan(0);
    expect(lt.transfersN.lateralTransferTotalN).toBeGreaterThan(0);
    expect(lt.dynamicWheelLoadsN.rearRight).toBeGreaterThan(lt.dynamicWheelLoadsN.frontLeft);
  });
});
