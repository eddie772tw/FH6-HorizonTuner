import { describe, expect, it } from 'vitest';
import {
  calculateRallyProfile,
  calculateRallyTireCircumferenceM,
  analyzeRallyTelemetry,
  validateRallyProfileInput,
  type RallyProfileInput
} from './rallyProfile';
import type { TuningCaptureSample } from '../telemetryCapture';

const createBaseCar = (): RallyProfileInput['car'] => ({
  weight: 1350,
  weight_distribution: 54,
  drivetrain: 'AWD',
  maxHp: 450,
  maxHpRpm: 6800,
  maxTorqueRpm: 4000,
  tireType: 'Rally',
  frontTireWidth: 245,
  frontTireAspect: 45,
  frontTireRim: 17,
  rearTireWidth: 245,
  rearTireAspect: 45,
  rearTireRim: 17,
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
  height_front_min: 12,
  height_front_max: 28,
  height_rear_min: 12,
  height_rear_max: 28,
  arb_front_min: 1,
  arb_front_max: 65,
  arb_rear_min: 1,
  arb_rear_max: 65
});

const createBaseInput = (overrides?: Partial<RallyProfileInput>): RallyProfileInput => ({
  profile: 'gravel',
  targetTopSpeedKmh: 240,
  surface: 'gravel',
  car: createBaseCar(),
  ...overrides
});

const createMockSample = (overrides?: Partial<TuningCaptureSample>): TuningCaptureSample => ({
  timestampMS: 1000,
  isRaceOn: 1,
  carOrdinal: 1,
  speedMps: 35,
  rpm: 5500,
  gear: 3,
  accelInput: 1.0,
  brakeInput: 0,
  clutchInput: 0,
  handBrakeInput: 0,
  steerInput: 0.1,
  accelerationX: 2.5,
  accelerationY: -9.8,
  accelerationZ: 3.0,
  velocityX: 1.0,
  velocityY: 0.1,
  velocityZ: 35,
  normalizedSuspensionTravel: [0.35, 0.35, 0.35, 0.35],
  tireSlipRatio: [0.08, 0.08, 0.09, 0.09],
  tireSlipAngle: [0.05, 0.05, 0.06, 0.06],
  tireTemp: [85, 85, 87, 87],
  tireCombinedSlip: [0.10, 0.10, 0.11, 0.11],
  positionX: 10,
  positionY: 5,
  positionZ: 100,
  surfaceRumble: [0.15, 0.15, 0.18, 0.18],
  lapNumber: 1,
  currentRaceTime: 10.5,
  ...overrides
});

describe('rallyProfile solver (tuning-profile/v1)', () => {
  describe('tire circumference and wheel speed geometry', () => {
    it('calculates tire rolling circumference matching 245/45R17 geometry', () => {
      const car = createBaseCar();
      const circumference = calculateRallyTireCircumferenceM(car);

      // rim = 17 * 0.0254 = 0.4318 m
      // sidewall = (245 / 1000) * 0.45 = 0.11025 m
      // diameter = 0.4318 + 2 * 0.11025 = 0.6523 m
      // circumference = pi * 0.6523 = ~2.049 m
      expect(circumference).toBeGreaterThan(2.00);
      expect(circumference).toBeLessThan(2.10);
      expect(circumference).toBeCloseTo(Math.PI * (17 * 0.0254 + 2 * (245 / 1000) * 0.45), 3);
    });
  });

  describe('profile separation: gravel, cross_country, jump', () => {
    it('generates correct schema and tuning targets for gravel profile', () => {
      const input = createBaseInput({ profile: 'gravel', targetTopSpeedKmh: 230 });
      const output = calculateRallyProfile(input);

      expect(output.schemaVersion).toBe('tuning-profile/v1');
      expect(output.profile).toBe('gravel');
      expect(output.status).toBe('empirical-prior');
      expect(output.source).toBe('empirical-prior');

      // Gravel targets balanced compliance
      expect(output.chassis.springs.targetFrequencyFrontHz).toBe(1.70);
      expect(output.chassis.springs.targetFrequencyRearHz).toBe(1.80);
      expect(output.chassis.damping.bumpToReboundRatio).toBe(0.45);
      expect(output.chassis.springs.rideHeightFraction).toBe(0.78);
      expect(output.suspensionTravel.landingImpactCapacityG).toBe(3.5);

      // Tire alignment for gravel turn-in
      expect(output.tireTargets.camberFrontDeg).toBe(-1.2);
      expect(output.tireTargets.camberRearDeg).toBe(-0.7);
      expect(output.tireTargets.targetHotPressurePsi).toBe(27.5);

      // Differential setup for gravel
      expect(output.chassis.differential.centerToRearPercent).toBe(60);
      expect(output.chassis.differential.frontAccelPercent).toBe(45);
      expect(output.chassis.differential.rearDecelPercent).toBe(18);
    });

    it('generates correct schema and soft compliant targets for cross_country profile', () => {
      const input = createBaseInput({ profile: 'cross_country', targetTopSpeedKmh: 200 });
      const output = calculateRallyProfile(input);

      expect(output.profile).toBe('cross_country');

      // Cross-country has softer springs and very high ride height for massive ground clearance
      expect(output.chassis.springs.targetFrequencyFrontHz).toBe(1.40);
      expect(output.chassis.springs.targetFrequencyRearHz).toBe(1.50);
      expect(output.chassis.springs.rideHeightFraction).toBe(0.94);
      expect(output.chassis.damping.bumpToReboundRatio).toBe(0.40);

      // Softer ARBs for maximum independent wheel articulation over rough ruts
      expect(output.chassis.arb.front).toBeLessThan(15);
      expect(output.chassis.arb.rear).toBeLessThan(15);

      // Flatter camber for rugged terrain traction and lower tire pressure
      expect(output.tireTargets.camberFrontDeg).toBe(-0.8);
      expect(output.tireTargets.camberRearDeg).toBe(-0.4);
      expect(output.tireTargets.targetHotPressurePsi).toBe(26.0);

      // Cross country 54% center split for climbing muddy inclines
      expect(output.chassis.differential.centerToRearPercent).toBe(54);
      expect(output.chassis.differential.rearAccelPercent).toBe(80);
      expect(output.chassis.differential.rearDecelPercent).toBe(25);
    });

    it('generates stiffer landing absorption targets for jump profile', () => {
      const input = createBaseInput({ profile: 'jump', targetTopSpeedKmh: 220, jumpSeverity: 'severe' });
      const output = calculateRallyProfile(input);

      expect(output.profile).toBe('jump');

      // Jump profile has stiffer springs and maximum ride height stroke
      expect(output.chassis.springs.targetFrequencyFrontHz).toBeGreaterThanOrEqual(2.00);
      expect(output.chassis.springs.rideHeightFraction).toBe(0.98);
      expect(output.chassis.damping.bumpToReboundRatio).toBeGreaterThan(0.50);

      // High landing impact capacity
      expect(output.suspensionTravel.landingImpactCapacityG).toBe(7.5);
      expect(output.suspensionTravel.antiBottomingDampingRatio).toBeGreaterThanOrEqual(0.85);

      // Higher tire pressure to resist rim strikes
      expect(output.tireTargets.targetHotPressurePsi).toBe(28.5);

      // Jump differential prevents wheel-spin mismatch in mid-air
      expect(output.chassis.differential.centerToRearPercent).toBe(58);
      expect(output.chassis.differential.frontAccelPercent).toBe(40);
      expect(output.chassis.differential.rearDecelPercent).toBe(12);
    });
  });

  describe('roughness monotonicity and rumble analysis', () => {
    it('demonstrates strict monotonicity: higher surface rumble produces higher roughness metrics', () => {
      const lowRumbleSamples: TuningCaptureSample[] = Array.from({ length: 20 }, (_, i) =>
        createMockSample({
          timestampMS: 1000 + i * 16,
          surfaceRumble: [0.05, 0.05, 0.06, 0.06]
        })
      );

      const highRumbleSamples: TuningCaptureSample[] = Array.from({ length: 20 }, (_, i) =>
        createMockSample({
          timestampMS: 1000 + i * 16,
          surfaceRumble: [0.45, 0.48, 0.52, 0.50]
        })
      );

      const lowMetrics = analyzeRallyTelemetry(lowRumbleSamples);
      const highMetrics = analyzeRallyTelemetry(highRumbleSamples);

      expect(lowMetrics).toBeDefined();
      expect(highMetrics).toBeDefined();

      expect(highMetrics!.surfaceRoughnessRms).toBeGreaterThan(lowMetrics!.surfaceRoughnessRms);
      expect(highMetrics!.surfaceRoughnessMeanAbs).toBeGreaterThan(lowMetrics!.surfaceRoughnessMeanAbs);
      expect(highMetrics!.surfaceRoughnessScore).toBeGreaterThan(lowMetrics!.surfaceRoughnessScore);
    });
  });

  describe('timestamp-based airtime and landing impact estimation', () => {
    it('integrates airtime precisely across non-uniform timestamp deltas during airborne state', () => {
      // 10 samples on ground (160ms) -> 10 samples airborne (160ms) -> 10 samples on ground (160ms)
      const samples: TuningCaptureSample[] = [];
      let time = 1000;

      // Ground 1
      for (let i = 0; i < 10; i++) {
        samples.push(
          createMockSample({
            timestampMS: time,
            normalizedSuspensionTravel: [0.35, 0.35, 0.35, 0.35],
            accelerationY: -9.8,
            velocityY: 0
          })
        );
        time += 16;
      }

      // Jump / Airborne: travel near 0 (full extension) and negative acceleration
      for (let i = 0; i < 10; i++) {
        samples.push(
          createMockSample({
            timestampMS: time,
            normalizedSuspensionTravel: [0.02, 0.02, 0.01, 0.01],
            accelerationY: -6.5,
            velocityY: 2.5
          })
        );
        time += 20; // non-uniform delta (20ms instead of 16ms)
      }

      // Landing: high impact accelerationY
      for (let i = 0; i < 10; i++) {
        samples.push(
          createMockSample({
            timestampMS: time,
            normalizedSuspensionTravel: [0.75, 0.78, 0.70, 0.72],
            accelerationY: i === 1 ? 42.0 : -9.8, // 42 m/s^2 landing shock (~4.28 G)
            velocityY: -1.0
          })
        );
        time += 16;
      }

      const metrics = analyzeRallyTelemetry(samples);
      expect(metrics).toBeDefined();
      expect(metrics!.jumpCount).toBe(1);
      expect(metrics!.totalAirtimeSeconds).toBeCloseTo(0.20, 2);
      expect(metrics!.maxSingleAirtimeSeconds).toBeCloseTo(0.20, 2);
      expect(metrics!.maxLandingImpactG).toBeGreaterThan(4.0);
      expect(metrics!.maxLandingImpactG).toBeCloseTo(42.0 / 9.80665, 1);
    });
  });

  describe('missing, invalid, duplicate, and non-uniform telemetry handling', () => {
    it('returns undefined for empty or non-array telemetry', () => {
      expect(analyzeRallyTelemetry([])).toBeUndefined();
      // @ts-expect-error test undefined
      expect(analyzeRallyTelemetry(undefined)).toBeUndefined();
    });

    it('safely handles missing arrays, NaNs, duplicate timestamps and dropped packets', () => {
      const corruptedSamples: TuningCaptureSample[] = [
        createMockSample({
          timestampMS: 1000,
          surfaceRumble: undefined as unknown as number[],
          normalizedSuspensionTravel: undefined as unknown as number[]
        }),
        createMockSample({
          timestampMS: 1000, // duplicate timestamp (dt = 0)
          surfaceRumble: [NaN, Infinity, -0.5, 0.2],
          normalizedSuspensionTravel: [NaN, 1.5, -0.2, 0.5]
        }),
        createMockSample({
          timestampMS: 950, // dropped/out-of-order timestamp (negative dt)
          surfaceRumble: [0.1, 0.1, 0.1, 0.1],
          normalizedSuspensionTravel: [0.4, 0.4, 0.4, 0.4]
        }),
        createMockSample({
          timestampMS: 1100, // valid forward jump
          surfaceRumble: [0.2, 0.2, 0.2, 0.2],
          normalizedSuspensionTravel: [0.4, 0.4, 0.4, 0.4]
        })
      ];

      const metrics = analyzeRallyTelemetry(corruptedSamples);
      expect(metrics).toBeDefined();
      expect(Number.isFinite(metrics!.surfaceRoughnessRms)).toBe(true);
      expect(Number.isFinite(metrics!.totalAirtimeSeconds)).toBe(true);
      expect(metrics!.totalAirtimeSeconds).toBeGreaterThanOrEqual(0);
      expect(metrics!.bottomingRatio).toBeGreaterThanOrEqual(0);
      expect(metrics!.bottomingRatio).toBeLessThanOrEqual(1);
    });
  });

  describe('travel clamping and bottoming ratio', () => {
    it('clamps normalized suspension travel to [0, 1] and calculates bottoming ratio for travel >= 0.95', () => {
      const samples: TuningCaptureSample[] = [
        createMockSample({ timestampMS: 1000, normalizedSuspensionTravel: [0.50, 0.50, 0.50, 0.50] }),
        createMockSample({ timestampMS: 1016, normalizedSuspensionTravel: [0.98, 0.96, 0.40, 0.40] }), // 2 wheels bottomed
        createMockSample({ timestampMS: 1032, normalizedSuspensionTravel: [0.99, 0.99, 0.99, 0.99] }), // 4 wheels bottomed
        createMockSample({ timestampMS: 1048, normalizedSuspensionTravel: [0.50, 0.50, 0.50, 0.50] })
      ];

      // Total wheel samples = 4 * 4 = 16. Bottomed wheel instances = 2 + 4 = 6.
      // Expected bottomingRatio = 6 / 16 = 0.375.
      const metrics = analyzeRallyTelemetry(samples);
      expect(metrics).toBeDefined();
      expect(metrics!.bottomingRatio).toBeCloseTo(0.375, 3);
      expect(metrics!.bottomingSampleCount).toBe(2);
    });
  });

  describe('gearing independence and contract proof', () => {
    it('verifies rally gearing independence, contract proof, and dedicated warning', () => {
      const input = createBaseInput({ targetTopSpeedKmh: 240, gearCount: 6 });
      const output = calculateRallyProfile(input);

      expect(output.gearing.independentRallyRatios).toBe(true);
      expect(output.gearing.contractProof).toBe('independent_rally_gear_ratios_v1');
      expect(output.gearing.gearingStrategy).toBe('rally_independent_acceleration_spacing');
      expect(
        output.warnings.some((w) =>
          w.includes('Rally gearing uses dedicated acceleration-biased ratio curve independent of Road/Circuit')
        )
      ).toBe(true);
    });

    it('guarantees strictly positive monotonic decreasing gear ratios for all gear counts (4 to 10)', () => {
      for (const gearCount of [4, 5, 6, 7, 8, 9, 10]) {
        const input = createBaseInput({ gearCount, targetTopSpeedKmh: 250 });
        const output = calculateRallyProfile(input);

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
  });

  describe('AWD differential ranges and decel lock', () => {
    it('provides range-based AWD differential targets that avoid rigid 25% decel locks', () => {
      const gravelOutput = calculateRallyProfile(createBaseInput({ profile: 'gravel' }));
      const crossCountryOutput = calculateRallyProfile(createBaseInput({ profile: 'cross_country' }));
      const jumpOutput = calculateRallyProfile(createBaseInput({ profile: 'jump' }));

      // Gravel diff
      expect(gravelOutput.chassis.differential.strategy).toBe('rally_range_prior');
      expect(gravelOutput.chassis.differential.rearDecelPercent).toBe(18);
      expect(gravelOutput.chassis.differential.ranges.rearDecel.min).toBe(10);
      expect(gravelOutput.chassis.differential.ranges.rearDecel.max).toBe(25);

      // Cross country diff (higher lock for terrain)
      expect(crossCountryOutput.chassis.differential.rearDecelPercent).toBe(25);
      expect(crossCountryOutput.chassis.differential.ranges.frontAccel.recommended).toBe(55);

      // Jump diff (lower lock for landing smooth absorption)
      expect(jumpOutput.chassis.differential.rearDecelPercent).toBe(12);
      expect(jumpOutput.chassis.differential.frontDecelPercent).toBe(8);

      // Verify decel lock is not universal 25% across all profiles
      expect(gravelOutput.chassis.differential.rearDecelPercent).not.toBe(25);
      expect(jumpOutput.chassis.differential.rearDecelPercent).not.toBe(25);
    });

    it('correctly sets differential targets for FWD and RWD rally cars', () => {
      const fwdInput = createBaseInput({ car: { ...createBaseCar(), drivetrain: 'FWD' } });
      const rwdInput = createBaseInput({ car: { ...createBaseCar(), drivetrain: 'RWD' } });

      const fwdOutput = calculateRallyProfile(fwdInput);
      const rwdOutput = calculateRallyProfile(rwdInput);

      expect(fwdOutput.chassis.differential.frontAccelPercent).toBeGreaterThan(0);
      expect(fwdOutput.chassis.differential.rearAccelPercent).toBe(0);

      expect(rwdOutput.chassis.differential.rearAccelPercent).toBeGreaterThan(0);
      expect(rwdOutput.chassis.differential.frontAccelPercent).toBe(0);
    });
  });

  describe('telemetry feedback integration and warnings', () => {
    it('marks status as estimated and adapts springs when telemetry samples are provided', () => {
      const samplesWithBottoming: TuningCaptureSample[] = Array.from({ length: 25 }, (_, i) =>
        createMockSample({
          timestampMS: 1000 + i * 16,
          normalizedSuspensionTravel: i < 5 ? [0.98, 0.98, 0.98, 0.98] : [0.45, 0.45, 0.45, 0.45]
        })
      );

      const input = createBaseInput({ telemetrySamples: samplesWithBottoming });
      const output = calculateRallyProfile(input);

      expect(output.status).toBe('estimated');
      expect(output.source).toBe('estimated');
      expect(output.telemetryMetrics).toBeDefined();
      expect(output.warnings.some((w) => w.includes('Suspension bottoming detected'))).toBe(true);
    });

    it('marks status as empirical-prior and warns when telemetry samples are omitted', () => {
      const input = createBaseInput({ telemetrySamples: undefined });
      const output = calculateRallyProfile(input);

      expect(output.status).toBe('empirical-prior');
      expect(output.source).toBe('empirical-prior');
      expect(output.telemetryMetrics).toBeUndefined();
      expect(output.warnings.some((w) => w.includes('No telemetry samples provided'))).toBe(true);
    });
  });

  describe('input validation and error handling', () => {
    it('rejects invalid profile names', () => {
      // @ts-expect-error test invalid profile
      expect(() => calculateRallyProfile(createBaseInput({ profile: 'super_rally' }))).toThrowError(/Invalid profile/);
    });

    it('rejects non-finite and out-of-range targetTopSpeedKmh', () => {
      expect(() => calculateRallyProfile(createBaseInput({ targetTopSpeedKmh: -10 }))).toThrowError(/targetTopSpeedKmh/);
      expect(() => calculateRallyProfile(createBaseInput({ targetTopSpeedKmh: 900 }))).toThrowError(/targetTopSpeedKmh/);
    });

    it('rejects invalid jumpSeverity', () => {
      // @ts-expect-error test invalid jump severity
      expect(() => calculateRallyProfile(createBaseInput({ jumpSeverity: 'extreme_danger' }))).toThrowError(
        /jumpSeverity/
      );
    });

    it('validates car weight and drivetrain', () => {
      expect(() => calculateRallyProfile(createBaseInput({ car: { ...createBaseCar(), weight: -50 } }))).toThrowError(
        /car\.weight/
      );
      // @ts-expect-error test bad drivetrain
      expect(() => calculateRallyProfile(createBaseInput({ car: { ...createBaseCar(), drivetrain: '6WD' } }))).toThrowError(
        /car\.drivetrain/
      );
    });
  });
});
