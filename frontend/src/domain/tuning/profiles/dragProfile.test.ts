import { describe, expect, it } from 'vitest';
import {
  calculateDragProfile,
  calculateDragTireCircumferenceM,
  calculateDragTractionAndLoadTransfer,
  calculateDragGearing,
  simulateDragDistance,
  calculateDragChassis,
  calculateDragDifferential,
  calculateDragTires,
  validateDragProfileInput,
  type DragProfileInput,
  type PowerCurvePoint
} from './dragProfile';

const createBaseCar = (overrides?: Partial<DragProfileInput['car']>): DragProfileInput['car'] => ({
  weight: 1450,
  weight_distribution: 52,
  drivetrain: 'RWD',
  maxHp: 750,
  maxHpRpm: 7200,
  maxTorqueRpm: 4800,
  tireType: 'Drag',
  frontTireWidth: 245,
  frontTireAspect: 40,
  frontTireRim: 18,
  rearTireWidth: 315,
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
  arb_rear_max: 65,
  ...overrides
});

const createBaseInput = (overrides?: Partial<DragProfileInput>): DragProfileInput => ({
  profile: 'quarter_mile',
  targetStripLengthM: 402.336,
  targetTopSpeedKmh: 320,
  car: createBaseCar(),
  ...overrides
});

const createSamplePowerCurve = (): PowerCurvePoint[] => [
  { rpm: 2000, torqueNm: 500, powerHp: 140 },
  { rpm: 3000, torqueNm: 680, powerHp: 287 },
  { rpm: 4500, torqueNm: 850, powerHp: 537 },
  { rpm: 6000, torqueNm: 820, powerHp: 692 },
  { rpm: 7200, torqueNm: 740, powerHp: 750 },
  { rpm: 8000, torqueNm: 580, powerHp: 652 }
];

describe('dragProfile solver (tuning-profile/v1)', () => {
  describe('schema and baseline solver output', () => {
    it('outputs valid schemaVersion tuning-profile/v1 with estimated status', () => {
      const input = createBaseInput();
      const output = calculateDragProfile(input);

      expect(output.schemaVersion).toBe('tuning-profile/v1');
      expect(output.profile).toBe('quarter_mile');
      expect(output.status).toBe('estimated');
      expect(output.source).toBe('estimated');
      expect(output.targetStripLengthM).toBeCloseTo(402.336, 2);
      expect(output.targetTopSpeedKmh).toBe(320);
      expect(output.simulation.simulated).toBe(true);
    });

    it('calculates tire rolling circumference matching rear 315/35R18 geometry for RWD', () => {
      const car = createBaseCar();
      const circumference = calculateDragTireCircumferenceM(car, 'RWD');

      // rim = 18 * 0.0254 = 0.4572 m
      // sidewall = 0.315 * 0.35 = 0.11025 m
      // outer diameter = 0.4572 + 2 * 0.11025 = 0.6777 m
      // circumference = pi * 0.6777 = ~2.129 m
      expect(circumference).toBeGreaterThan(2.05);
      expect(circumference).toBeLessThan(2.20);
      expect(circumference).toBeCloseTo(Math.PI * (18 * 0.0254 + 2 * (315 / 1000) * 0.35), 2);
    });
  });

  describe('longitudinal load transfer sign and physics', () => {
    it('transfers load rearward (deltaFz > 0) under forward acceleration', () => {
      const traction = calculateDragTractionAndLoadTransfer({
        massKg: 1500,
        weightDistributionFrontPct: 52,
        wheelbaseM: 2.65,
        cgHeightM: 0.48,
        drivetrain: 'RWD',
        muLongitudinal: 1.40,
        engineLaunchTorqueNm: 800,
        firstGearRatio: 3.2,
        finalDriveRatio: 3.5,
        tireRadiusM: 0.33,
        drivetrainEfficiency: 0.88
      });

      expect(traction.loadTransferDirection).toBe('rearward');
      expect(traction.longitudinalLoadTransferLaunchN).toBeGreaterThan(0);
      expect(traction.dynamicLaunchNormalLoadRearN).toBeGreaterThan(traction.staticNormalLoadRearN);
      expect(traction.dynamicLaunchNormalLoadFrontN).toBeLessThan(traction.staticNormalLoadFrontN);
      expect(traction.dynamicLaunchNormalLoadFrontN + traction.dynamicLaunchNormalLoadRearN).toBeCloseTo(
        traction.totalStaticNormalLoadN,
        0
      );
    });

    it('confirms positive sign convention: deltaFz = m * a * hCG / L', () => {
      const mass = 1200;
      const L = 2.5;
      const hCG = 0.5;
      const g = 9.80665;
      const Wf = 0.50;

      const traction = calculateDragTractionAndLoadTransfer({
        massKg: mass,
        weightDistributionFrontPct: Wf * 100,
        wheelbaseM: L,
        cgHeightM: hCG,
        drivetrain: 'RWD',
        muLongitudinal: 1.2,
        engineLaunchTorqueNm: 600,
        firstGearRatio: 3.0,
        finalDriveRatio: 3.2,
        tireRadiusM: 0.32,
        drivetrainEfficiency: 0.90,
        gravityMPerS2: g
      });

      const expectedDeltaFz = (mass * traction.launchAccelerationMps2 * hCG) / L;
      expect(traction.longitudinalLoadTransferLaunchN).toBeCloseTo(expectedDeltaFz, 1);
    });
  });

  describe('drivetrain traction allocation (FWD vs RWD vs AWD)', () => {
    it('shows FWD launch traction decreases under squat load transfer', () => {
      const fwdTraction = calculateDragTractionAndLoadTransfer({
        massKg: 1400,
        weightDistributionFrontPct: 60,
        wheelbaseM: 2.60,
        cgHeightM: 0.50,
        drivetrain: 'FWD',
        muLongitudinal: 1.30,
        engineLaunchTorqueNm: 750,
        firstGearRatio: 3.2,
        finalDriveRatio: 3.5,
        tireRadiusM: 0.32,
        drivetrainEfficiency: 0.88
      });

      // FWD dynamic normal load is less than static
      expect(fwdTraction.dynamicLaunchNormalLoadFrontN).toBeLessThan(fwdTraction.staticNormalLoadFrontN);
      expect(fwdTraction.maxTractionForceLaunchN).toBeCloseTo(
        1.30 * fwdTraction.dynamicLaunchNormalLoadFrontN,
        1
      );
    });

    it('shows RWD launch traction increases under squat load transfer', () => {
      const rwdTraction = calculateDragTractionAndLoadTransfer({
        massKg: 1400,
        weightDistributionFrontPct: 50,
        wheelbaseM: 2.60,
        cgHeightM: 0.50,
        drivetrain: 'RWD',
        muLongitudinal: 1.30,
        engineLaunchTorqueNm: 750,
        firstGearRatio: 3.2,
        finalDriveRatio: 3.5,
        tireRadiusM: 0.32,
        drivetrainEfficiency: 0.88
      });

      // RWD dynamic normal load is greater than static
      expect(rwdTraction.dynamicLaunchNormalLoadRearN).toBeGreaterThan(rwdTraction.staticNormalLoadRearN);
      expect(rwdTraction.maxTractionForceLaunchN).toBeCloseTo(
        1.30 * rwdTraction.dynamicLaunchNormalLoadRearN,
        1
      );
    });

    it('shows AWD achieves full vehicle mass normal force traction capacity', () => {
      const awdTraction = calculateDragTractionAndLoadTransfer({
        massKg: 1400,
        weightDistributionFrontPct: 55,
        wheelbaseM: 2.60,
        cgHeightM: 0.50,
        drivetrain: 'AWD',
        muLongitudinal: 1.30,
        engineLaunchTorqueNm: 750,
        firstGearRatio: 3.2,
        finalDriveRatio: 3.5,
        tireRadiusM: 0.32,
        drivetrainEfficiency: 0.84,
        awdFrontSplitPct: 35
      });

      const totalMassN = 1400 * 9.80665;
      expect(awdTraction.maxTractionForceLaunchN).toBeGreaterThan(0);
      expect(awdTraction.maxTractionForceLaunchN).toBeLessThanOrEqual(1.30 * totalMassN + 1);
    });

    it('ranks launch acceleration: AWD > RWD > FWD for identical high power car', () => {
      const baseCar = createBaseCar({ maxHp: 800, maxTorqueRpm: 4500 });
      const fwdOutput = calculateDragProfile(createBaseInput({ car: { ...baseCar, drivetrain: 'FWD' } }));
      const rwdOutput = calculateDragProfile(createBaseInput({ car: { ...baseCar, drivetrain: 'RWD' } }));
      const awdOutput = calculateDragProfile(createBaseInput({ car: { ...baseCar, drivetrain: 'AWD' } }));

      expect(awdOutput.launchTraction.launchAccelerationMps2).toBeGreaterThan(
        rwdOutput.launchTraction.launchAccelerationMps2
      );
      expect(rwdOutput.launchTraction.launchAccelerationMps2).toBeGreaterThan(
        fwdOutput.launchTraction.launchAccelerationMps2
      );

      // AWD achieves fastest 60-ft time
      expect(awdOutput.simulation.sixtyFootTimeSeconds).toBeLessThan(
        rwdOutput.simulation.sixtyFootTimeSeconds
      );
      expect(rwdOutput.simulation.sixtyFootTimeSeconds).toBeLessThan(
        fwdOutput.simulation.sixtyFootTimeSeconds
      );
    });
  });

  describe('zero and invalid geometry fallbacks and warnings', () => {
    it('handles zero or negative mass gracefully with warning', () => {
      const input = createBaseInput({
        geometry: { massKg: 0 }
      });
      const output = calculateDragProfile(input);

      expect(output.warnings.some((w) => w.includes('mass') && w.includes('defaulting'))).toBe(true);
      expect(output.launchTraction.totalStaticNormalLoadN).toBeGreaterThan(0);
    });

    it('handles zero or negative wheelbase and cgHeight with assumptions/warnings', () => {
      const input = createBaseInput({
        geometry: { wheelbaseM: -1, cgHeightM: 0 }
      });
      const output = calculateDragProfile(input);

      expect(output.assumptions.some((a) => a.includes('wheelbase') || a.includes('CG height'))).toBe(true);
      expect(output.launchTraction.longitudinalLoadTransferLaunchN).toBeGreaterThan(0);
    });

    it('clamps extreme front weight distribution (<10% or >90%) with warning', () => {
      const input = createBaseInput({
        geometry: { weightDistributionFrontPct: 98 }
      });
      const output = calculateDragProfile(input);

      expect(output.warnings.some((w) => w.includes('Weight distribution'))).toBe(true);
    });

    it('records explicit assumption when powerCurve is not provided', () => {
      const input = createBaseInput();
      const output = calculateDragProfile(input);

      expect(output.assumptions.some((a) => a.includes('Power curve not provided'))).toBe(true);
    });

    it('records explicit assumption when aero priors (CdA, Crr) are defaulted', () => {
      const input = createBaseInput();
      const output = calculateDragProfile(input);

      expect(output.assumptions.some((a) => a.includes('CdA') || a.includes('Aerodynamic'))).toBe(true);
      expect(output.assumptions.some((a) => a.includes('Crr') || a.includes('Rolling resistance'))).toBe(true);
    });
  });

  describe('dynamic gearing: no hardcoded 4th gear 1.00 & gear count flexibility', () => {
    it('supports 4 to 10 gears and maintains strictly monotonic decreasing ratios', () => {
      for (const count of [4, 5, 6, 7, 8, 9, 10]) {
        const gearing = calculateDragGearing({
          car: createBaseCar(),
          drivetrain: 'RWD',
          gearCount: count,
          targetStripLengthM: 402.336,
          targetTopSpeedKmh: 320,
          drivetrainEfficiency: 0.88
        });

        expect(gearing.gearCount).toBe(count);
        expect(gearing.gears.length).toBe(count);

        for (let i = 1; i < gearing.gears.length; i++) {
          expect(gearing.gears[i]).toBeLessThan(gearing.gears[i - 1]);
        }
      }
    });

    it('does NOT hardcode 4th gear 1.00 universally across different gear counts and strip lengths', () => {
      // 8-gear setup
      const gearing8 = calculateDragGearing({
        car: createBaseCar(),
        drivetrain: 'RWD',
        gearCount: 8,
        targetStripLengthM: 402.336,
        targetTopSpeedKmh: 340,
        drivetrainEfficiency: 0.88
      });

      // In an 8-gear drag setup, 4th gear is in the intermediate range (> 1.20), not 1.00
      expect(gearing8.gears[3]).toBeGreaterThan(1.20);
      expect(gearing8.gears[3]).not.toBe(1.00);

      // 4-gear setup on 1/8 mile
      const gearing4 = calculateDragGearing({
        car: createBaseCar(),
        drivetrain: 'RWD',
        gearCount: 4,
        targetStripLengthM: 201.168,
        targetTopSpeedKmh: 240,
        drivetrainEfficiency: 0.88
      });

      // In 4-gear 1/8 mile setup, 4th gear is ~1.15
      expect(gearing4.gears[3]).toBeCloseTo(1.15, 1);
    });

    it('adapts active top gear and ratios based on strip length (1/8 mi vs 1/4 mi vs 1/2 mi)', () => {
      const car = createBaseCar();
      const eighthGearing = calculateDragGearing({
        car,
        drivetrain: 'RWD',
        gearCount: 6,
        targetStripLengthM: 201.168,
        targetTopSpeedKmh: 260,
        drivetrainEfficiency: 0.88
      });

      const quarterGearing = calculateDragGearing({
        car,
        drivetrain: 'RWD',
        gearCount: 6,
        targetStripLengthM: 402.336,
        targetTopSpeedKmh: 320,
        drivetrainEfficiency: 0.88
      });

      const halfGearing = calculateDragGearing({
        car,
        drivetrain: 'RWD',
        gearCount: 6,
        targetStripLengthM: 804.672,
        targetTopSpeedKmh: 360,
        drivetrainEfficiency: 0.88
      });

      expect(eighthGearing.finalDrive).not.toBe(quarterGearing.finalDrive);
      expect(quarterGearing.finalDrive).not.toBe(halfGearing.finalDrive);
      expect(eighthGearing.activeTopGear).toBeLessThanOrEqual(quarterGearing.activeTopGear);
    });
  });

  describe('power curve shift behavior and advice', () => {
    it('provides wheel force crossover shift advice when power curve is supplied', () => {
      const powerCurve = createSamplePowerCurve();
      const output = calculateDragProfile(createBaseInput({ powerCurve }));

      expect(output.gearing.shiftAdvice.length).toBe(output.gearing.gearCount - 1);
      const firstShift = output.gearing.shiftAdvice[0];
      expect(firstShift.shiftRpm).toBeGreaterThan(5000);
      expect(firstShift.postShiftRpm).toBeLessThan(firstShift.shiftRpm);
      expect(firstShift.shiftSpeedKmh).toBeGreaterThan(50);
      expect(['wheel_force_crossover', 'redline_optimal']).toContain(firstShift.reason);
    });

    it('uses estimated peak HP prior shift reason when power curve is omitted', () => {
      const output = calculateDragProfile(createBaseInput());

      const firstShift = output.gearing.shiftAdvice[0];
      expect(firstShift.reason).toBe('estimated_peak_hp_prior');
      expect(firstShift.shiftRpm).toBeGreaterThan(6500);
    });
  });

  describe('distance milestones, simulation and wheelspin', () => {
    it('simulates 60-ft, 100-m, 1/8-mile, and 1/4-mile milestone times in ascending order', () => {
      const output = calculateDragProfile(createBaseInput({ targetStripLengthM: 402.336 }));
      const sim = output.simulation;

      expect(sim.sixtyFootTimeSeconds).toBeGreaterThan(1.0);
      expect(sim.hundredMeterTimeSeconds).toBeGreaterThan(sim.sixtyFootTimeSeconds);
      expect(sim.eighthMileTimeSeconds).toBeGreaterThan(sim.hundredMeterTimeSeconds);
      expect(sim.quarterMileTimeSeconds).toBeGreaterThan(sim.eighthMileTimeSeconds);
      expect(sim.stripTimeSeconds).toBeCloseTo(sim.quarterMileTimeSeconds, 2);

      expect(sim.sixtyFootSpeedKmh).toBeGreaterThan(40);
      expect(sim.eighthMileSpeedKmh).toBeGreaterThan(sim.sixtyFootSpeedKmh);
      expect(sim.quarterMileSpeedKmh).toBeGreaterThan(sim.eighthMileSpeedKmh);
      expect(sim.terminalSpeedKmh).toBeCloseTo(sim.quarterMileSpeedKmh, 1);
    });

    it('detects wheelspin duration during high-torque traction-limited launch', () => {
      const highTorqueCar = createBaseCar({ maxHp: 1000, weight: 1200 });
      const output = calculateDragProfile(createBaseInput({ car: highTorqueCar }));

      expect(output.launchTraction.isTractionLimited).toBe(true);
      expect(output.launchTraction.hasWheelspin).toBe(true);
      expect(output.simulation.wheelspinDurationSeconds).toBeGreaterThan(0);
    });

    it('includes milestone entries in milestones array with reached flags', () => {
      const output = calculateDragProfile(createBaseInput({ targetStripLengthM: 402.336 }));
      const milestones = output.simulation.milestones;

      expect(milestones.length).toBeGreaterThanOrEqual(4);
      const sixty = milestones.find((m) => m.label === '60-ft');
      expect(sixty?.reached).toBe(true);
      expect(sixty?.timeSeconds).toBeGreaterThan(0);
      expect(sixty?.speedKmh).toBeGreaterThan(0);
    });
  });

  describe('drag chassis and differential targets', () => {
    it('sets drag-specific differential lockup (100% accel for RWD)', () => {
      const car = createBaseCar({ drivetrain: 'RWD' });
      const diff = calculateDragDifferential(car, 'RWD');

      expect(diff.strategy).toBe('drag_spool_high_lock_prior');
      expect(diff.rearAccelPercent).toBe(100);
      expect(diff.rearDecelPercent).toBeLessThanOrEqual(10);
      expect(diff.centerToRearPercent).toBe(100);
    });

    it('sets drag-specific differential lockup (100% front/rear, 75% rear center for AWD)', () => {
      const car = createBaseCar({ drivetrain: 'AWD' });
      const diff = calculateDragDifferential(car, 'AWD');

      expect(diff.frontAccelPercent).toBe(100);
      expect(diff.rearAccelPercent).toBe(100);
      expect(diff.centerToRearPercent).toBe(75);
    });

    it('configures soft front ARB (2.0) and stiff rear ARB (58.0) to counteract torque twist', () => {
      const car = createBaseCar();
      const chassis = calculateDragChassis(car, 'RWD');

      expect(chassis.arb.front).toBeLessThanOrEqual(5.0);
      expect(chassis.arb.rear).toBeGreaterThanOrEqual(50.0);
      expect(chassis.arb.mode).toBe('drag_launch_anti_roll_stiff_rear');
    });

    it('configures zero camber and zero toe alignment for perpendicular flat launch contact', () => {
      const car = createBaseCar();
      const tires = calculateDragTires(car, 'dragStrip', 'Drag', 1500, 50);

      expect(tires.alignment.frontCamberDeg).toBe(0.0);
      expect(tires.alignment.rearCamberDeg).toBe(-0.1);
      expect(tires.alignment.frontToeDeg).toBe(0.0);
      expect(tires.alignment.rearToeDeg).toBe(0.0);
      expect(tires.pressures.coldRearPsi).toBeLessThan(25.0);
      expect(tires.pressures.coldFrontPsi).toBeGreaterThan(35.0);
    });
  });
});
