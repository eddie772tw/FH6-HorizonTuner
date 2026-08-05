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
