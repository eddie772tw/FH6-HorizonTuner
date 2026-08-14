import { describe, expect, it } from 'vitest';
import {
  calculateDriftProfile,
  calculateDriftTireCircumferenceM,
  calculateDriftDifferential,
  calculateDriftAlignment,
  calculateDriftPressures,
  calculateDriftChassis,
  calculateDriftGearing,
  analyzeDriftTelemetry,
  validateDriftProfileInput,
  type DriftProfileInput
} from './driftProfile';
import type { TuningCaptureSample } from '../telemetryCapture';

const createBaseCar = (): DriftProfileInput['car'] => ({
  weight: 1320,
  weight_distribution: 52,
  drivetrain: 'RWD',
  maxHp: 550,
  maxHpRpm: 6800,
  maxTorqueRpm: 4500,
  tireType: 'Drift',
  frontTireWidth: 245,
  frontTireAspect: 40,
  frontTireRim: 18,
  rearTireWidth: 265,
  rearTireAspect: 35,
  rearTireRim: 18,
  adjustability: {
    gears: 6,
    gearbox: 'Full',
    suspension: 'Race',
    arb: 'Adjustable',
    aero: 'Adjustable',
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
});

const createBaseInput = (overrides?: Partial<DriftProfileInput>): DriftProfileInput => ({
  profile: 'pro_drift',
  targetDriftAngleDeg: 35,
  angleToleranceDeg: 8,
  surface: 'tarmac',
  car: createBaseCar(),
  ...overrides
});

const createMockSample = (overrides?: Partial<TuningCaptureSample & Record<string, any>>): TuningCaptureSample => ({
  timestampMS: 1000,
  isRaceOn: 1,
  carOrdinal: 1,
  speedMps: 25,
  rpm: 6000,
  gear: 3,
  accelInput: 0.85,
  brakeInput: 0,
  clutchInput: 0,
  handBrakeInput: 0,
  steerInput: -0.4,
  accelerationX: 4.5,
  accelerationY: 0.1,
  accelerationZ: 1.2,
  velocityX: 5.0,
  velocityY: 14.42, // vy = 14.42, vz = 20.6 -> atan2(14.42, 20.6) = 35.0 deg
  velocityZ: 20.6,
  normalizedSuspensionTravel: [0.35, 0.35, 0.35, 0.35],
  tireSlipRatio: [0.05, 0.05, 0.45, 0.48],
  tireSlipAngle: [0.15, 0.16, 0.38, 0.40],
  tireTemp: [95, 95, 110, 112],
  tireCombinedSlip: [0.18, 0.19, 0.65, 0.68],
  positionX: 10,
  positionY: 2,
  positionZ: 50,
  surfaceRumble: [0.1, 0.1, 0.1, 0.1],
  lapNumber: 1,
  currentRaceTime: 12.0,
  ...overrides
});

describe('driftProfile solver (tuning-profile/v1)', () => {
  describe('schema and baseline solver output', () => {
    it('outputs valid schemaVersion tuning-profile/v1 with empirical-prior status without telemetry', () => {
      const input = createBaseInput();
      const output = calculateDriftProfile(input);

      expect(output.schemaVersion).toBe('tuning-profile/v1');
      expect(output.profile).toBe('pro_drift');
      expect(output.status).toBe('empirical-prior');
      expect(output.source).toBe('empirical-prior');
      expect(output.targetDriftAngleDeg).toBe(35);
      expect(output.angleToleranceDeg).toBe(8);
      expect(output.telemetryMetrics).toBeUndefined();
      expect(output.warnings).toEqual([]);
    });

    it('calculates tire rolling circumference matching rear 265/35R18 geometry', () => {
      const car = createBaseCar();
      const circumference = calculateDriftTireCircumferenceM(car);

      // rim = 18 * 0.0254 = 0.4572 m
      // sidewall = 0.265 * 0.35 = 0.09275 m
      // outer diameter = 0.4572 + 2 * 0.09275 = 0.6427 m
      // circumference = pi * 0.6427 = ~2.0191 m
      expect(circumference).toBeGreaterThan(1.95);
      expect(circumference).toBeLessThan(2.10);
      expect(circumference).toBeCloseTo(Math.PI * (18 * 0.0254 + 2 * (265 / 1000) * 0.35), 3);
    });
  });

  describe('differential presets and range outputs', () => {
    it('provides pro 100/20 locked accel with ranges for aggressive_100_20 preset', () => {
      const car = createBaseCar();
      const diff = calculateDriftDifferential(car, 'aggressive_100_20');

      expect(diff.strategy).toBe('drift_rear_bias_prior');
      expect(diff.preset).toBe('aggressive_100_20');
      expect(diff.rearAccelPercent).toBe(100);
      expect(diff.rearDecelPercent).toBe(20);
      expect(diff.ranges.rearAccel).toEqual({ min: 90, max: 100, recommended: 100 });
      expect(diff.ranges.rearDecel).toEqual({ min: 10, max: 35, recommended: 20 });
    });

    it('provides 100/100 spool lock for spool_100_100 / welded preset', () => {
      const car = createBaseCar();
      const diff = calculateDriftDifferential(car, 'spool_100_100');

      expect(diff.preset).toBe('spool_100_100');
      expect(diff.rearAccelPercent).toBe(100);
      expect(diff.rearDecelPercent).toBe(100);
      expect(diff.ranges.rearAccel).toEqual({ min: 100, max: 100, recommended: 100 });
      expect(diff.ranges.rearDecel).toEqual({ min: 100, max: 100, recommended: 100 });
    });

    it('provides progressive 90/30 lock for progressive_90_30 preset', () => {
      const car = createBaseCar();
      const diff = calculateDriftDifferential(car, 'progressive_90_30');

      expect(diff.preset).toBe('progressive_90_30');
      expect(diff.rearAccelPercent).toBe(90);
      expect(diff.rearDecelPercent).toBe(30);
      expect(diff.ranges.rearAccel).toEqual({ min: 80, max: 95, recommended: 90 });
      expect(diff.ranges.rearDecel).toEqual({ min: 20, max: 40, recommended: 30 });
    });

    it('provides open mild 75/15 lock for open_mild preset', () => {
      const car = createBaseCar();
      const diff = calculateDriftDifferential(car, 'open_mild');

      expect(diff.preset).toBe('open_mild');
      expect(diff.rearAccelPercent).toBe(75);
      expect(diff.rearDecelPercent).toBe(15);
      expect(diff.ranges.rearAccel).toEqual({ min: 70, max: 85, recommended: 75 });
      expect(diff.ranges.rearDecel).toEqual({ min: 10, max: 25, recommended: 15 });
    });

    it('configures AWD drift center bias (85% rear) and front differential', () => {
      const car = createBaseCar();
      car.drivetrain = 'AWD';
      const diff = calculateDriftDifferential(car, 'aggressive_100_20');

      expect(diff.frontAccelPercent).toBe(40);
      expect(diff.frontDecelPercent).toBe(0);
      expect(diff.centerToRearPercent).toBe(85);
      expect(diff.ranges.centerToRear).toEqual({ min: 75, max: 92, recommended: 85 });
    });
  });

  describe('alignment, pressure, and ARB chassis targets', () => {
    it('sets aggressive front camber, mild rear camber, toe-out front, toe-in rear, and high caster', () => {
      const car = createBaseCar();
      const align = calculateDriftAlignment(car, 35);

      expect(align.frontCamberDeg).toBe(-3.5);
      expect(align.rearCamberDeg).toBe(-0.8);
      expect(align.frontToeDeg).toBe(-0.15); // Toe out
      expect(align.rearToeDeg).toBe(0.15); // Toe in
      expect(align.casterDeg).toBe(7.0);
    });

    it('scales front camber further negative when target drift angle is higher', () => {
      const car = createBaseCar();
      const align50 = calculateDriftAlignment(car, 50);

      expect(align50.frontCamberDeg).toBeLessThan(-3.5);
      expect(align50.frontCamberDeg).toBeCloseTo(-3.5 - (50 - 35) * 0.035, 2);
    });

    it('sets high front pressure (firm sidewall) and lower rear pressure (progressive traction)', () => {
      const car = createBaseCar();
      const pressures = calculateDriftPressures(car);

      expect(pressures.coldFrontPsi).toBe(30.5);
      expect(pressures.targetHotFrontPsi).toBe(32.0);
      expect(pressures.coldRearPsi).toBeLessThan(pressures.coldFrontPsi);
      expect(pressures.coldRearPsi).toBe(24.0);
    });

    it('sets soft front ARB and stiff rear ARB to promote oversteer rotation', () => {
      const car = createBaseCar();
      const diff = calculateDriftDifferential(car, 'aggressive_100_20');
      const chassis = calculateDriftChassis(car, diff);

      expect(chassis.arb.front).toBeLessThan(25);
      expect(chassis.arb.rear).toBeGreaterThan(40);
      expect(chassis.arb.rear).toBeGreaterThan(chassis.arb.front);
      expect(chassis.arb.mode).toBe('drift_stiff_rear_rotation');
    });

    it('computes spring rates and critical damping with 0.50 bump-to-rebound ratio', () => {
      const car = createBaseCar();
      const diff = calculateDriftDifferential(car, 'aggressive_100_20');
      const chassis = calculateDriftChassis(car, diff);

      expect(chassis.springs.frontKgfMm).toBeGreaterThan(10);
      expect(chassis.springs.rearKgfMm).toBeGreaterThan(10);
      expect(chassis.damping.bumpToReboundRatio).toBe(0.50);
      expect(chassis.damping.frontBumpNsM).toBeCloseTo(chassis.damping.frontReboundNsM * 0.50, 1);
    });

    it('generates drift gearing with usable gear speed spacing', () => {
      const car = createBaseCar();
      const gearing = calculateDriftGearing(car, 230, 6);

      expect(gearing.gearCount).toBe(6);
      expect(gearing.gears.length).toBe(6);
      // Ratios should be strictly monotonic decreasing
      for (let i = 0; i < gearing.gears.length - 1; i++) {
        expect(gearing.gears[i]).toBeGreaterThan(gearing.gears[i + 1]);
      }
      expect(gearing.shiftAdvice.length).toBe(5);
    });
  });

  describe('telemetry analysis and body sideslip beta vs tire alpha', () => {
    it('computes body beta = atan2(velocityY, abs(velocityZ)) in degrees', () => {
      // vy = 10, vz = 10 -> atan2(10, 10) = 45.0 deg
      const samples = [
        createMockSample({ timestampMS: 1000, velocityY: 10, velocityZ: 10 }),
        createMockSample({ timestampMS: 1050, velocityY: 10, velocityZ: 10 })
      ];

      const metrics = analyzeDriftTelemetry(samples, 45, 5);
      expect(metrics).toBeDefined();
      expect(metrics?.peakBodyBetaDeg).toBeCloseTo(45.0, 1);
      expect(metrics?.meanBodyBetaDeg).toBeCloseTo(45.0, 1);
      expect(metrics?.driftSampleCount).toBe(2);
    });

    it('keeps body sideslip beta distinct from tire slip angles alpha', () => {
      // Body beta is 35 deg, front tire alpha is 0.15 rad (8.59 deg), rear tire alpha is 0.40 rad (22.92 deg)
      const samples = [
        createMockSample({
          timestampMS: 1000,
          velocityY: 14.42,
          velocityZ: 20.6, // atan2(14.42, 20.6) = 35.0 deg
          tireSlipAngle: [0.15, 0.15, 0.40, 0.40]
        }),
        createMockSample({
          timestampMS: 1050,
          velocityY: 14.42,
          velocityZ: 20.6,
          tireSlipAngle: [0.15, 0.15, 0.40, 0.40]
        })
      ];

      const metrics = analyzeDriftTelemetry(samples, 35, 5);
      expect(metrics).toBeDefined();
      expect(metrics?.meanBodyBetaDeg).toBeCloseTo(35.0, 1);
      expect(metrics?.meanFrontTireSlipAngleDeg).toBeCloseTo((0.15 * 180) / Math.PI, 1);
      expect(metrics?.meanRearTireSlipAngleDeg).toBeCloseTo((0.40 * 180) / Math.PI, 1);
      // Front and rear alpha are separate and distinct from beta
      expect(metrics?.meanFrontTireSlipAngleDeg).not.toBeCloseTo(metrics?.meanBodyBetaDeg ?? 0, 1);
      expect(metrics?.meanRearTireSlipAngleDeg).not.toBeCloseTo(metrics?.meanBodyBetaDeg ?? 0, 1);
    });

    it('computes rear slip ratio and rear combined slip from wheels 2 and 3', () => {
      const samples = [
        createMockSample({
          timestampMS: 1000,
          tireSlipRatio: [0.02, 0.02, 0.50, 0.60],
          tireCombinedSlip: [0.10, 0.10, 0.70, 0.80]
        }),
        createMockSample({
          timestampMS: 1050,
          tireSlipRatio: [0.02, 0.02, 0.50, 0.60],
          tireCombinedSlip: [0.10, 0.10, 0.70, 0.80]
        })
      ];

      const metrics = analyzeDriftTelemetry(samples, 35, 10);
      expect(metrics).toBeDefined();
      expect(metrics?.meanRearSlipRatio).toBeCloseTo(0.55, 2);
      expect(metrics?.peakRearSlipRatio).toBeCloseTo(0.55, 2);
      expect(metrics?.meanRearCombinedSlip).toBeCloseTo(0.75, 2);
      expect(metrics?.peakRearCombinedSlip).toBeCloseTo(0.75, 2);
    });

    it('integrates yaw rate from direct AngularVelocityY when available', () => {
      const samples = [
        createMockSample({ timestampMS: 1000, angularVelocityY: 0.5 }), // 0.5 rad/s = ~28.6 deg/s
        createMockSample({ timestampMS: 1050, angularVelocityY: 0.5 })
      ];

      const metrics = analyzeDriftTelemetry(samples, 35, 10);
      expect(metrics?.yawRateSource).toBe('direct_angular_velocity');
      expect(metrics?.meanYawRateDegPerSec).toBeCloseTo((0.5 * 180) / Math.PI, 1);
    });

    it('estimates yaw rate from unwrapped Yaw delta over timestamp delta when AngularVelocityY is missing', () => {
      // 0.05 rad delta over 50 ms = 1.0 rad/s = ~57.3 deg/s
      const samples = [
        createMockSample({ timestampMS: 1000, yaw: 1.0, angularVelocityY: undefined }),
        createMockSample({ timestampMS: 1050, yaw: 1.05, angularVelocityY: undefined }),
        createMockSample({ timestampMS: 1100, yaw: 1.10, angularVelocityY: undefined })
      ];

      const metrics = analyzeDriftTelemetry(samples, 35, 10);
      expect(metrics?.yawRateSource).toBe('estimated_unwrapped_yaw');
      expect(metrics?.meanYawRateDegPerSec).toBeCloseTo((1.0 * 180) / Math.PI, 1);
    });

    it('handles angle wrap across +-PI without spurious yaw rate spikes', () => {
      // Crossing from +3.10 rad to -3.10 rad (delta = +0.083 rad, not 6.2 rad!)
      const samples = [
        createMockSample({ timestampMS: 1000, yaw: 3.10, angularVelocityY: undefined }),
        createMockSample({ timestampMS: 1050, yaw: -3.10, angularVelocityY: undefined })
      ];

      const metrics = analyzeDriftTelemetry(samples, 35, 10);
      expect(metrics?.yawRateSource).toBe('estimated_unwrapped_yaw');
      // True angular delta is ~0.08318 rad / 0.050 s = 1.66 rad/s = ~95 deg/s (not 7100 deg/s!)
      expect(metrics?.meanYawRateDegPerSec).toBeLessThan(200);
      expect(metrics?.peakYawRateDegPerSec).toBeLessThan(200);
    });
  });

  describe('drift window tolerance, stability variance, and timestamp anomalies', () => {
    it('integrates timestamp deltas only when body beta is within target angle tolerance', () => {
      // Target: 35 deg, Tolerance: 5 deg -> Window: [30, 40]
      const samples = [
        createMockSample({ timestampMS: 1000, velocityY: 14.42, velocityZ: 20.6 }), // 35 deg (in window)
        createMockSample({ timestampMS: 1100, velocityY: 14.42, velocityZ: 20.6 }), // 35 deg (in window, dt=0.1s)
        createMockSample({ timestampMS: 1200, velocityY: 3.0, velocityZ: 20.0 }), // ~8.5 deg (OUT of window, dt=0.1s)
        createMockSample({ timestampMS: 1300, velocityY: 14.42, velocityZ: 20.6 }) // 35 deg (in window, dt=0.1s)
      ];

      const metrics = analyzeDriftTelemetry(samples, 35, 5);
      expect(metrics?.sampleCount).toBe(4);
      expect(metrics?.validSampleCount).toBe(4);
      expect(metrics?.driftSampleCount).toBe(3);
      expect(metrics?.totalDurationSeconds).toBeCloseTo(0.3, 2);
      expect(metrics?.driftDurationSeconds).toBeCloseTo(0.2, 2);
      expect(metrics?.driftRatio).toBeCloseTo(0.2 / 0.3, 2);
    });

    it('computes weighted mean, variance, and high stability score for consistent angle holding', () => {
      // Constant 35 deg angle
      const samples = Array.from({ length: 10 }, (_, i) =>
        createMockSample({
          timestampMS: 1000 + i * 50,
          velocityY: 14.42,
          velocityZ: 20.6 // 35 deg
        })
      );

      const metrics = analyzeDriftTelemetry(samples, 35, 8);
      expect(metrics?.meanBodyBetaDeg).toBeCloseTo(35.0, 1);
      expect(metrics?.varianceBodyBeta).toBeCloseTo(0.0, 2);
      expect(metrics?.stdDevBodyBetaDeg).toBeCloseTo(0.0, 2);
      expect(metrics?.stabilityScore).toBe(100);
    });

    it('computes non-zero variance and reduced stability score for oscillating angle', () => {
      // Oscillating between 30 and 40 deg
      const samples = Array.from({ length: 10 }, (_, i) =>
        createMockSample({
          timestampMS: 1000 + i * 50,
          velocityY: i % 2 === 0 ? 11.9 : 17.3,
          velocityZ: 20.6 // alternating ~30 deg and ~40 deg
        })
      );

      const metrics = analyzeDriftTelemetry(samples, 35, 10);
      expect(metrics?.meanBodyBetaDeg).toBeCloseTo(35.0, 1);
      expect(metrics?.varianceBodyBeta).toBeGreaterThan(15);
      expect(metrics?.stdDevBodyBetaDeg).toBeGreaterThan(4);
      expect(metrics?.stabilityScore).toBeLessThan(80);
    });

    it('filters out low speed samples (< minSpeedMps)', () => {
      const samples = [
        createMockSample({ timestampMS: 1000, speedMps: 1.5, velocityY: 1.0, velocityZ: 1.0 }), // low speed
        createMockSample({ timestampMS: 1050, speedMps: 2.0, velocityY: 1.0, velocityZ: 1.0 }), // low speed
        createMockSample({ timestampMS: 1100, speedMps: 20.0, velocityY: 14.42, velocityZ: 20.6 }) // valid speed
      ];

      const metrics = analyzeDriftTelemetry(samples, 35, 8, 3.0);
      expect(metrics?.sampleCount).toBe(3);
      expect(metrics?.lowSpeedSamplesFiltered).toBe(2);
      expect(metrics?.validSampleCount).toBe(1);
    });

    it('handles zero, duplicate, and out-of-order timestamps without crashing or negative dt', () => {
      const corruptedSamples = [
        createMockSample({ timestampMS: 1000 }),
        createMockSample({ timestampMS: 1000 }), // duplicate (dt = 0)
        createMockSample({ timestampMS: 900 }), // out of order (dt = 0)
        createMockSample({ timestampMS: 1100 }), // valid positive delta (dt = 0.2s)
        createMockSample({ timestampMS: 1150 }) // valid positive delta (dt = 0.05s)
      ];

      const metrics = analyzeDriftTelemetry(corruptedSamples, 35, 8);
      expect(metrics?.droppedOrOutOfOrderTimestamps).toBe(2);
      expect(metrics?.totalDurationSeconds).toBeCloseTo(0.25, 2);
    });

    it('safely handles samples with missing or malformed arrays', () => {
      const brokenSamples = [
        createMockSample({
          timestampMS: 1000,
          tireSlipAngle: undefined as any,
          tireSlipRatio: [] as any,
          tireCombinedSlip: undefined as any
        }),
        createMockSample({
          timestampMS: 1050,
          tireSlipAngle: [0.2], // short array
          tireSlipRatio: undefined as any,
          tireCombinedSlip: [0.1, 0.2, 0.3]
        })
      ];

      expect(() => analyzeDriftTelemetry(brokenSamples, 35, 8)).not.toThrow();
      const metrics = analyzeDriftTelemetry(brokenSamples, 35, 8);
      expect(metrics?.validSampleCount).toBe(2);
    });
  });

  describe('warnings and end-to-end integration', () => {
    it('sets estimated status and attaches metrics when telemetry is provided', () => {
      const samples = [
        createMockSample({ timestampMS: 1000, velocityY: 14.42, velocityZ: 20.6 }),
        createMockSample({ timestampMS: 1050, velocityY: 14.42, velocityZ: 20.6 })
      ];

      const input = createBaseInput({ telemetrySamples: samples });
      const output = calculateDriftProfile(input);

      expect(output.status).toBe('estimated');
      expect(output.source).toBe('estimated');
      expect(output.telemetryMetrics).toBeDefined();
      expect(output.telemetryMetrics?.driftSampleCount).toBe(2);
      expect(output.warnings).toEqual([]);
    });

    it('warns when car is FWD', () => {
      const car = createBaseCar();
      car.drivetrain = 'FWD';
      const input = createBaseInput({ car });
      const output = calculateDriftProfile(input);

      expect(output.warnings.some((w) => w.includes('FWD drivetrain'))).toBe(true);
    });

    it('warns when targetDriftAngleDeg is unusually shallow or extreme', () => {
      const shallowOutput = calculateDriftProfile(createBaseInput({ targetDriftAngleDeg: 10 }));
      expect(shallowOutput.warnings.some((w) => w.includes('unusually shallow'))).toBe(true);

      const extremeOutput = calculateDriftProfile(createBaseInput({ targetDriftAngleDeg: 65 }));
      expect(extremeOutput.warnings.some((w) => w.includes('very extreme'))).toBe(true);
    });

    it('warns when no telemetry samples met target drift angle window', () => {
      const samples = [
        createMockSample({ timestampMS: 1000, velocityY: 1.0, velocityZ: 25.0 }), // ~2.3 deg (outside [27, 43])
        createMockSample({ timestampMS: 1050, velocityY: 1.0, velocityZ: 25.0 })
      ];

      const input = createBaseInput({ targetDriftAngleDeg: 35, angleToleranceDeg: 8, telemetrySamples: samples });
      const output = calculateDriftProfile(input);

      expect(output.warnings.some((w) => w.includes('No telemetry samples met target drift angle'))).toBe(true);
    });

    it('warns when high percentage of timestamps are dropped or out of order', () => {
      const samples = [
        createMockSample({ timestampMS: 1000 }),
        createMockSample({ timestampMS: 1000 }),
        createMockSample({ timestampMS: 950 }),
        createMockSample({ timestampMS: 1050 })
      ];

      const input = createBaseInput({ telemetrySamples: samples });
      const output = calculateDriftProfile(input);

      expect(output.warnings.some((w) => w.includes('High timestamp anomaly count'))).toBe(true);
    });

    it('validates input and returns validation errors for non-finite or out-of-range values', () => {
      const invalidInput: any = {
        profile: 'invalid_drift_mode',
        targetDriftAngleDeg: 120, // out of range
        angleToleranceDeg: -5,
        car: {
          weight: -500,
          weight_distribution: 150
        }
      };

      const errors = validateDriftProfileInput(invalidInput);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes('Invalid profile'))).toBe(true);
      expect(errors.some((e) => e.includes('targetDriftAngleDeg'))).toBe(true);
      expect(errors.some((e) => e.includes('angleToleranceDeg'))).toBe(true);
      expect(errors.some((e) => e.includes('weight'))).toBe(true);
    });
  });
});
