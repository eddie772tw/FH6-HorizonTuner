import { describe, expect, it } from 'vitest';
import {
  calculateRoadProfile,
  calculateRoadTireCircumferenceM,
  validateRoadProfileInput,
  type RoadProfileInput
} from './roadProfile';

const createBaseCar = (): RoadProfileInput['car'] => ({
  weight: 1450,
  weight_distribution: 52,
  drivetrain: 'AWD',
  maxHp: 500,
  maxHpRpm: 7200,
  maxTorqueRpm: 4500,
  tireType: 'Sport',
  frontTireWidth: 255,
  frontTireAspect: 35,
  frontTireRim: 19,
  rearTireWidth: 285,
  rearTireAspect: 30,
  rearTireRim: 19,
  adjustability: {
    gears: 6,
    gearbox: 'Full',
    suspension: 'Race',
    arb: 'Adjustable',
    aero: 'Adjustable',
    diff: 'Adjustable'
  },
  spring_front_min: 15,
  spring_front_max: 120,
  spring_rear_min: 15,
  spring_rear_max: 120,
  height_front_min: 10,
  height_front_max: 22,
  height_rear_min: 10,
  height_rear_max: 22,
  arb_front_min: 1,
  arb_front_max: 65,
  arb_rear_min: 1,
  arb_rear_max: 65
});

const createBaseInput = (overrides?: Partial<RoadProfileInput>): RoadProfileInput => ({
  profile: 'balanced',
  targetTopSpeedKmh: 300,
  straightRatio: 0.45,
  surface: 'tarmac',
  car: createBaseCar(),
  ...overrides
});

describe('roadProfile solver (tuning-profile/v1)', () => {
  describe('tire circumference and wheel speed geometry', () => {
    it('calculates tire circumference in metres matching formula C = pi * (rim + 2 * sidewall)', () => {
      const car = createBaseCar();
      car.drivetrain = 'RWD';
      car.rearTireWidth = 285;
      car.rearTireAspect = 30;
      car.rearTireRim = 19;

      // rim = 19 * 0.0254 = 0.4826 m
      // sidewall = (285 / 1000) * 0.30 = 0.0855 m
      // outerDiameter = 0.4826 + 2 * 0.0855 = 0.6536 m
      // circumference = pi * 0.6536 = 2.05334... m
      const circumference = calculateRoadTireCircumferenceM(car);
      expect(circumference).toBeGreaterThan(2.00);
      expect(circumference).toBeLessThan(2.10);
      expect(circumference).toBeCloseTo(Math.PI * (19 * 0.0254 + 2 * (285 / 1000) * 0.3), 5);
    });
  });

  describe('profile support: technical, balanced, high_speed', () => {
    it('generates correct schema and tuning targets for technical profile', () => {
      const input = createBaseInput({ profile: 'technical', targetTopSpeedKmh: 260, straightRatio: 0.2 });
      const output = calculateRoadProfile(input);

      expect(output.schemaVersion).toBe('tuning-profile/v1');
      expect(output.profile).toBe('technical');
      expect(output.status).toBe('empirical-prior');
      expect(output.source).toBe('empirical-prior');

      // Technical profile has higher natural frequencies and tighter damping for agility
      expect(output.chassis.springs.targetFrequencyFrontHz).toBe(2.4);
      expect(output.chassis.springs.targetFrequencyRearHz).toBe(2.5);
      expect(output.chassis.damping.frontDampingRatio).toBe(0.75);

      // Technical profile has more aggressive front camber
      expect(output.tireTargets.camberFrontDeg).toBe(-1.8);
      expect(output.tireTargets.camberRearDeg).toBe(-1.0);

      // Gearing top gear is shorter for responsiveness
      expect(output.gearing.gears[output.gearing.gearCount - 1]).toBeGreaterThanOrEqual(0.80);
    });

    it('generates correct schema and tuning targets for balanced profile', () => {
      const input = createBaseInput({ profile: 'balanced', targetTopSpeedKmh: 300, straightRatio: 0.5 });
      const output = calculateRoadProfile(input);

      expect(output.profile).toBe('balanced');
      expect(output.chassis.springs.targetFrequencyFrontHz).toBe(2.2);
      expect(output.chassis.springs.targetFrequencyRearHz).toBe(2.3);
      expect(output.chassis.damping.frontDampingRatio).toBe(0.70);
      expect(output.tireTargets.camberFrontDeg).toBe(-1.5);
      expect(output.tireTargets.camberRearDeg).toBe(-0.8);
    });

    it('generates correct schema and tuning targets for high_speed profile', () => {
      const input = createBaseInput({ profile: 'high_speed', targetTopSpeedKmh: 360, straightRatio: 0.8 });
      const output = calculateRoadProfile(input);

      expect(output.profile).toBe('high_speed');
      expect(output.chassis.springs.targetFrequencyFrontHz).toBe(2.3);
      expect(output.chassis.springs.targetFrequencyRearHz).toBe(2.4);

      // Lower ride height for aero stability and lower drag
      expect(output.chassis.springs.frontRideHeightCm).toBeLessThan(12);
      expect(output.chassis.springs.rearRideHeightCm).toBeLessThan(12);

      // Less negative camber to maximize straight-line braking contact patch
      expect(output.tireTargets.camberFrontDeg).toBe(-1.2);
      expect(output.tireTargets.camberRearDeg).toBe(-0.6);

      // Taller top gear for high top speeds
      expect(output.gearing.gears[output.gearing.gearCount - 1]).toBeLessThan(0.75);
    });
  });

  describe('AWD circuit_rotation explicit 1/65 prior', () => {
    it('sets ARB to exactly 1/65 when awdCircuitRotationPrior is enabled for AWD car', () => {
      const input = createBaseInput({
        profile: 'technical',
        awdCircuitRotationPrior: true,
        car: { ...createBaseCar(), drivetrain: 'AWD' }
      });
      const output = calculateRoadProfile(input);

      expect(output.chassis.arb.mode).toBe('circuit_rotation_1_65');
      expect(output.chassis.arb.front).toBe(1.0);
      expect(output.chassis.arb.rear).toBe(65.0);
      expect(output.chassis.differential.centerToRearPercent).toBe(70);
      expect(output.warnings.some((w) => w.includes('circuit_rotation preset (1/65 ARB)'))).toBe(true);
    });

    it('uses standard formula ARBs when awdCircuitRotationPrior is omitted or false on AWD car', () => {
      const input = createBaseInput({
        profile: 'balanced',
        awdCircuitRotationPrior: false,
        car: { ...createBaseCar(), drivetrain: 'AWD' }
      });
      const output = calculateRoadProfile(input);

      expect(output.chassis.arb.mode).toBe('standard');
      expect(output.chassis.arb.front).toBeGreaterThan(10);
      expect(output.chassis.arb.rear).toBeLessThan(60);
      expect(output.warnings.some((w) => w.includes('circuit_rotation preset (1/65 ARB)'))).toBe(false);
    });

    it('does not apply 1/65 ARB to RWD or FWD even if awdCircuitRotationPrior is true', () => {
      const input = createBaseInput({
        profile: 'technical',
        awdCircuitRotationPrior: true,
        car: { ...createBaseCar(), drivetrain: 'RWD' }
      });
      const output = calculateRoadProfile(input);

      expect(output.chassis.arb.mode).toBe('standard');
      expect(output.chassis.arb.front).toBeGreaterThan(1.0);
      expect(output.chassis.arb.rear).toBeLessThan(65.0);
    });
  });

  describe('gearing top-speed relation and monotonicity', () => {
    it('produces lower (taller) final drive ratio when targetTopSpeedKmh is increased', () => {
      const lowSpeedInput = createBaseInput({ targetTopSpeedKmh: 240 });
      const highSpeedInput = createBaseInput({ targetTopSpeedKmh: 360 });

      const lowSpeedOutput = calculateRoadProfile(lowSpeedInput);
      const highSpeedOutput = calculateRoadProfile(highSpeedInput);

      expect(highSpeedOutput.gearing.finalDrive).toBeLessThan(lowSpeedOutput.gearing.finalDrive);
      expect(highSpeedOutput.gearing.topSpeedAtPeakHpKmh).toBeGreaterThan(lowSpeedOutput.gearing.topSpeedAtPeakHpKmh);
    });

    it('guarantees strictly positive monotonic decreasing gear ratios for all gear counts (4 to 10)', () => {
      for (const gearCount of [4, 5, 6, 7, 8, 9, 10]) {
        const input = createBaseInput({ gearCount, targetTopSpeedKmh: 310 });
        const output = calculateRoadProfile(input);

        expect(output.gearing.gearCount).toBe(gearCount);
        expect(output.gearing.gears).toHaveLength(gearCount);

        for (let i = 0; i < output.gearing.gears.length; i++) {
          expect(output.gearing.gears[i]).toBeGreaterThan(0);
          if (i > 0) {
            expect(output.gearing.gears[i]).toBeLessThan(output.gearing.gears[i - 1]);
          }
        }

        // Check gear speeds are strictly increasing
        for (let i = 1; i < output.gearing.gearSpeedsKmh.length; i++) {
          expect(output.gearing.gearSpeedsKmh[i]).toBeGreaterThan(output.gearing.gearSpeedsKmh[i - 1]);
        }
      }
    });

    it('adjusts first gear based on slowestCornerSpeedKmh when provided', () => {
      const tightCornerInput = createBaseInput({ slowestCornerSpeedKmh: 45 });
      const fastCornerInput = createBaseInput({ slowestCornerSpeedKmh: 110 });

      const tightOutput = calculateRoadProfile(tightCornerInput);
      const fastOutput = calculateRoadProfile(fastCornerInput);

      // Tighter corner needs shorter first gear (higher ratio number) for punchy exit
      expect(tightOutput.gearing.gears[0]).toBeGreaterThan(fastOutput.gearing.gears[0]);
    });
  });

  describe('power curve shift advice and missing curve handling', () => {
    it('computes post-shift wheel force crossover advice when power curve is provided', () => {
      const powerCurve = [
        { rpm: 3000, torqueNm: 500 },
        { rpm: 4500, torqueNm: 620 },
        { rpm: 6000, torqueNm: 580 },
        { rpm: 7200, torqueNm: 510 },
        { rpm: 8000, torqueNm: 420 }
      ];

      const input = createBaseInput({ powerCurve });
      const output = calculateRoadProfile(input);

      expect(output.gearing.shiftAdvice).toHaveLength(output.gearing.gearCount - 1);
      for (const advice of output.gearing.shiftAdvice) {
        expect(advice.shiftRpm).toBeGreaterThan(4500);
        expect(advice.postShiftRpm).toBeLessThan(advice.shiftRpm);
        expect(advice.postShiftForceN).toBeDefined();
        expect(advice.postShiftForceN!).toBeGreaterThan(0);
        expect(['wheel_force_crossover', 'redline_optimal']).toContain(advice.reason);
      }
      expect(output.warnings.some((w) => w.includes('Power curve missing'))).toBe(false);
    });

    it('emits warning and uses estimated peak power RPM prior when power curve is omitted', () => {
      const input = createBaseInput({ powerCurve: undefined });
      const output = calculateRoadProfile(input);

      expect(output.warnings.some((w) => w.includes('Power curve missing'))).toBe(true);
      expect(output.gearing.shiftAdvice).toHaveLength(output.gearing.gearCount - 1);
      for (const advice of output.gearing.shiftAdvice) {
        expect(advice.reason).toBe('estimated_peak_hp_prior');
        expect(advice.shiftRpm).toBeGreaterThanOrEqual(input.car.maxHpRpm);
      }
    });
  });

  describe('aero state warnings', () => {
    it('emits warning when aeroState is omitted', () => {
      const input = createBaseInput({ aeroState: undefined });
      const output = calculateRoadProfile(input);

      expect(output.warnings.some((w) => w.includes('Aero state not provided'))).toBe(true);
    });

    it('does not emit missing aero warning when aeroState is provided', () => {
      const input = createBaseInput({
        aeroState: {
          frontDownforceLevel: 'medium',
          rearDownforceLevel: 'high',
          frontDownforceKg: 80,
          rearDownforceKg: 140
        }
      });
      const output = calculateRoadProfile(input);

      expect(output.warnings.some((w) => w.includes('Aero state not provided'))).toBe(false);
    });
  });

  describe('optional bicycle cornering advisory', () => {
    it('returns undefined corneringAdvisory when corneringGeometry is omitted', () => {
      const input = createBaseInput({ corneringGeometry: undefined });
      const output = calculateRoadProfile(input);

      expect(output.corneringAdvisory).toBeUndefined();
    });

    it('calculates steady-state bicycle advisory fulfilling sumFy=mV^2/R and a*Fyf=b*Fyr', () => {
      const corneringGeometry = {
        cornerRadiusM: 60,
        wheelbaseM: 2.65,
        tireGripMu: 1.15
      };
      const input = createBaseInput({ corneringGeometry });
      const output = calculateRoadProfile(input);

      const adv = output.corneringAdvisory;
      expect(adv).toBeDefined();
      expect(adv?.status).toBe('estimated');
      expect(adv?.model).toBe('linear_bicycle_model_estimated');
      expect(adv?.cornerRadiusM).toBe(60);

      // Corner speed: V_max = sqrt(mu * g * R) * 3.6
      const expectedMaxSpeedKmh = Math.sqrt(1.15 * 9.80665 * 60) * 3.6;
      expect(adv?.maxCornerSpeedKmh).toBeCloseTo(expectedMaxSpeedKmh, 1);

      // Verify lateral force equilibrium: Fyf + Fyr = sumFy
      expect(adv?.frontLateralForceN! + adv?.rearLateralForceN!).toBeCloseTo(adv?.totalLateralForceN!, 1);

      // Verify yaw moment equilibrium: a * Fyf = b * Fyr
      const frontRatio = input.car.weight_distribution / 100;
      const rearRatio = 1 - frontRatio;
      const a = 2.65 * rearRatio;
      const b = 2.65 * frontRatio;
      expect(a * adv?.frontLateralForceN!).toBeCloseTo(b * adv?.rearLateralForceN!, 1);

      // Steer angle: delta = L/R + alphaF - alphaR
      expect(adv?.steerAngleDeg).toBeCloseTo(adv?.ackermannSteerAngleDeg! + adv?.understeerGradientDeg!, 2);
    });
  });

  describe('input validation and error handling', () => {
    it('validates profile names', () => {
      // @ts-expect-error test invalid profile
      const errors = validateRoadProfileInput(createBaseInput({ profile: 'drift_master' }));
      expect(errors.some((e) => e.includes("Invalid profile: 'drift_master'"))).toBe(true);
    });

    it('rejects non-finite and out-of-range targetTopSpeedKmh', () => {
      expect(() => calculateRoadProfile(createBaseInput({ targetTopSpeedKmh: -50 }))).toThrowError(
        /targetTopSpeedKmh/
      );
      expect(() => calculateRoadProfile(createBaseInput({ targetTopSpeedKmh: NaN }))).toThrowError(
        /targetTopSpeedKmh/
      );
      expect(() => calculateRoadProfile(createBaseInput({ targetTopSpeedKmh: 1000 }))).toThrowError(
        /targetTopSpeedKmh/
      );
    });

    it('rejects straightRatio outside [0, 1] or non-finite', () => {
      expect(() => calculateRoadProfile(createBaseInput({ straightRatio: 1.5 }))).toThrowError(
        /straightRatio/
      );
      expect(() => calculateRoadProfile(createBaseInput({ straightRatio: -0.1 }))).toThrowError(
        /straightRatio/
      );
    });

    it('rejects slowestCornerSpeedKmh greater than or equal to targetTopSpeedKmh', () => {
      expect(() =>
        calculateRoadProfile(createBaseInput({ targetTopSpeedKmh: 200, slowestCornerSpeedKmh: 250 }))
      ).toThrowError(/slowestCornerSpeedKmh/);
    });

    it('rejects invalid gearCount outside [4, 10]', () => {
      expect(() => calculateRoadProfile(createBaseInput({ gearCount: 3 }))).toThrowError(/gearCount/);
      expect(() => calculateRoadProfile(createBaseInput({ gearCount: 12 }))).toThrowError(/gearCount/);
    });

    it('rejects non-positive or non-finite car weight', () => {
      const badCar = { ...createBaseCar(), weight: 0 };
      expect(() => calculateRoadProfile(createBaseInput({ car: badCar }))).toThrowError(/car\.weight/);
    });
  });
});
