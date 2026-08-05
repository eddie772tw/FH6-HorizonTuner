/**
 * Unit Tests for tuningMath.ts
 *
 * 驗證 AEGO 齒輪比調校算牌與車輛物理轉換公式之正確性。
 * 所有函數皆為純函數 (Pure Functions)，不依賴任何外部狀態。
 *
 * @see AGENTS.md §2 - 車輛物理與調校邏輯 Single Source of Truth
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAEGOGearing,
  calcGearSpeed,
  calcGearRpm,
  resolveAeroDownforce,
  calculateChassisTuning,
  TuningCarParams
} from './tuningMath';

// ---------- Helpers ----------

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ============================================================
// calcGearSpeed & calcGearRpm
// ============================================================
describe('Speed & RPM Physics Helpers', () => {
  it('calcGearSpeed should calculate correct speed in m/s', () => {
    // 6000 RPM, gear ratio 1.0, FD 3.5, tire radius 0.32m
    // speed = (6000 * 2 * PI * 0.32) / (1.0 * 3.5 * 60) = 12063.7 / 210 = ~57.44 m/s
    const speedMs = calcGearSpeed(6000, 1.0, 3.5, 0.32);
    expect(round(speedMs, 2)).toBe(57.45);
  });

  it('calcGearRpm should calculate correct RPM for given speed', () => {
    const rpm = calcGearRpm(57.446, 1.0, 3.5, 0.32);
    expect(round(rpm, 0)).toBe(6000);
  });

  it('should handle zero or negative edge cases gracefully', () => {
    expect(calcGearSpeed(6000, 0, 3.5)).toBe(0);
    expect(calcGearSpeed(6000, 1.0, 0)).toBe(0);
    expect(calcGearRpm(100, 1.0, 3.5, 0)).toBe(0);
  });
});

// ============================================================
// calculateAEGOGearing
// ============================================================
describe('calculateAEGOGearing', () => {
  const sampleCar: TuningCarParams = {
    weight: 1400,
    weight_distribution: 50,
    drivetrain: 'RWD',
    maxHp: 300,
    maxTorque: 400,
    maxHpRpm: 6500,
    maxTorqueRpm: 4500
  };

  it('should return correct number of gears', () => {
    const result = calculateAEGOGearing('Road', 6, sampleCar, 7500);
    expect(result.gears).toHaveLength(6);
  });

  it('gear ratios should be monotonically decreasing (g1 > g2 > ... > gN)', () => {
    const result = calculateAEGOGearing('Road', 6, sampleCar, 7500);
    for (let i = 1; i < result.gears.length; i++) {
      expect(result.gears[i]).toBeLessThan(result.gears[i - 1]);
    }
  });

  it('finalDrive should be clamped within [2.0, 6.5]', () => {
    const highHpCar: TuningCarParams = { ...sampleCar, maxHp: 1000 };
    const result = calculateAEGOGearing('Road', 6, highHpCar, 9000);
    expect(result.finalDrive).toBeGreaterThanOrEqual(2.0);
    expect(result.finalDrive).toBeLessThanOrEqual(6.5);
  });

  it('Drift goal should produce different gearing than Road', () => {
    const road = calculateAEGOGearing('Road', 6, sampleCar, 7500);
    const drift = calculateAEGOGearing('Drift', 6, sampleCar, 7500);
    expect(drift.finalDrive).not.toBe(road.finalDrive);
  });

  it('should gracefully handle missing carParams', () => {
    const result = calculateAEGOGearing('Road', 6, null, 7000);
    expect(result.gears).toHaveLength(6);
    expect(result.finalDrive).toBeGreaterThanOrEqual(2.0);
  });
});

// ============================================================
// resolveAeroDownforce
// ============================================================
describe('resolveAeroDownforce', () => {
  const baseCar: TuningCarParams = {
    weight: 1500,
    weight_distribution: 52,
    drivetrain: 'RWD',
    maxHp: 400,
    maxTorque: 500,
    maxHpRpm: 6000,
    maxTorqueRpm: 4000
  };

  it('should return explicit non-zero downforce values directly', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 120, aero_downforce_rear: 150 };
    const aero = resolveAeroDownforce(car);
    expect(aero.front).toBe(120);
    expect(aero.rear).toBe(150);
  });

  it('should derive rear downforce when only front downforce is specified', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 100, aero_downforce_rear: 0 };
    const aero = resolveAeroDownforce(car);
    expect(aero.front).toBe(100);
    expect(aero.rear).toBeGreaterThan(0);
  });

  it('should derive front downforce when only rear downforce is specified', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 0, aero_downforce_rear: 150 };
    const aero = resolveAeroDownforce(car);
    expect(aero.rear).toBe(150);
    expect(aero.front).toBeGreaterThan(0);
  });

  it('should derive both front and rear downforce when both are zero/unspecified', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 0, aero_downforce_rear: 0 };
    const aero = resolveAeroDownforce(car);
    expect(aero.front).toBeGreaterThan(0);
    expect(aero.rear).toBeGreaterThan(0);
    // RWD has 0.82 modifier, so rear should have higher proportion
    expect(aero.rear).toBeGreaterThan(aero.front);
  });
});

// ============================================================
// calculateChassisTuning (Step3)
// ============================================================
describe('calculateChassisTuning (Step3)', () => {
  const roadCar: TuningCarParams = {
    weight: 1400,
    weight_distribution: 54,
    drivetrain: 'RWD',
    maxHp: 450,
    maxTorque: 520,
    maxHpRpm: 6800,
    maxTorqueRpm: 4600,
    spring_front_min: 15.0,
    spring_front_max: 150.0,
    spring_rear_min: 15.0,
    spring_rear_max: 150.0,
    height_front_min: 8.0,
    height_front_max: 20.0,
    height_rear_min: 8.0,
    height_rear_max: 20.0
  };

  it('Road race goal should calculate correct ARB, Springs, Damping, and Diff values', () => {
    const res = calculateChassisTuning('Road', roadCar);
    expect(res.arb.front).toBeGreaterThan(0);
    expect(res.arb.rear).toBeGreaterThan(0);
    expect(res.springs.front).toBeGreaterThanOrEqual(15.0);
    expect(res.springs.rear).toBeGreaterThanOrEqual(15.0);
    expect(res.damping.bumpF).toBe(Math.round(res.damping.reboundF * 0.60 * 10) / 10);
    expect(res.diff.accelR).toBeGreaterThan(0);
  });

  it('AWD Road car should apply Meta ARB Strategy and Center Torque Split', () => {
    const awdCar: TuningCarParams = { ...roadCar, drivetrain: 'AWD' };
    const res = calculateChassisTuning('Road', awdCar);
    // Meta ARB strategy: front ARB is kept very low (<= 5.0), rear high (>= 50.0)
    expect(res.arb.front).toBeLessThanOrEqual(5.0);
    expect(res.arb.rear).toBeGreaterThanOrEqual(50.0);
    expect(res.diff.centerRear).toBeGreaterThanOrEqual(60);
  });

  it('Drift goal should set extreme front-soft rear-stiff ARB and symmetric damping', () => {
    const res = calculateChassisTuning('Drift', roadCar);
    expect(res.arb.front).toBe(10.0);
    expect(res.arb.rear).toBe(50.0);
    expect(res.damping.reboundF).toBe(6.0);
    expect(res.damping.reboundR).toBe(6.0);
    expect(res.damping.bumpF).toBe(3.0);
    expect(res.damping.bumpR).toBe(3.0);
    expect(res.diff.accelR).toBe(100);
  });

  it('Rally goal should soften ARBs and springs, and set max ride height', () => {
    const roadRes = calculateChassisTuning('Road', roadCar);
    const rallyRes = calculateChassisTuning('Rally', roadCar);

    expect(rallyRes.arb.front).toBeLessThan(roadRes.arb.front);
    expect(rallyRes.arb.rear).toBeLessThan(roadRes.arb.rear);
    expect(rallyRes.springs.heightF).toBe(roadCar.height_front_max);
    expect(rallyRes.springs.heightR).toBe(roadCar.height_rear_max);
    expect(rallyRes.damping.bumpF).toBe(Math.round(rallyRes.damping.reboundF * 0.40 * 10) / 10);
  });

  it('Drag goal should set unconstrained front ARB and rake angle height', () => {
    const res = calculateChassisTuning('Drag', roadCar);
    expect(res.arb.front).toBe(1.0);
    expect(res.arb.rear).toBe(2.0);
    expect(res.springs.heightF).toBe(roadCar.height_front_max);
    expect(res.springs.heightR).toBe(roadCar.height_rear_min);
    expect(res.damping.reboundF).toBe(1.0);
    expect(res.damping.bumpF).toBe(20.0);
    expect(res.damping.reboundR).toBe(20.0);
    expect(res.damping.bumpR).toBe(1.0);
  });

  it('should enforce safety clamping within user-defined slider limits', () => {
    const extremeCar: TuningCarParams = {
      ...roadCar,
      weight: 3000,
      weight_distribution: 90,
      spring_front_min: 20.0,
      spring_front_max: 50.0
    };
    const res = calculateChassisTuning('Road', extremeCar);
    expect(res.springs.front).toBeLessThanOrEqual(50.0);
    expect(res.springs.front).toBeGreaterThanOrEqual(20.0);
    expect(res.arb.front).toBeLessThanOrEqual(65.0);
    expect(res.arb.rear).toBeLessThanOrEqual(65.0);
  });
});

