/**
 * Unit Tests for tuningMath.ts
 *
 * 驗證所有懸吊、彈簧、防傾桿、阻尼器、齒輪比等調校公式的正確性。
 * 所有函數皆為純函數 (Pure Functions)，不依賴任何外部狀態。
 *
 * @see AGENTS.md §2 - 車輛物理與調校邏輯 Single Source of Truth
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSprings,
  calculateARBs,
  calculateDampers,
  calculateSpringsByFrequency,
  calculateARBsAdvanced,
  calculateDampersAdvanced,
  calculateDampersCritical,
  getDifferentialBaseline,
  calculateAlignmentSettings,
  calculateTirePressures,
  calculateAEGOGearing,
} from './tuningMath';

// ---------- Helpers ----------

/** Round to N decimal places for comparison */
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ============================================================
// calculateSprings
// ============================================================
describe('calculateSprings', () => {
  it('50/50 weight distribution should return midpoint springs', () => {
    const result = calculateSprings(50, 100, 500);
    // front = (500-100)*0.5 + 100 = 300
    expect(result.front).toBe(300);
    // rear  = (500-100)*0.5 + 100 = 300
    expect(result.rear).toBe(300);
  });

  it('60/40 front bias should produce stiffer front springs', () => {
    const result = calculateSprings(60, 100, 500);
    expect(result.front).toBe(340); // (400)*0.6 + 100
    expect(result.rear).toBe(260);  // (400)*0.4 + 100
    expect(result.front).toBeGreaterThan(result.rear);
  });

  it('0% front bias should return min front / max rear', () => {
    const result = calculateSprings(0, 100, 500);
    expect(result.front).toBe(100);
    expect(result.rear).toBe(500);
  });

  it('100% front bias should return max front / min rear', () => {
    const result = calculateSprings(100, 100, 500);
    expect(result.front).toBe(500);
    expect(result.rear).toBe(100);
  });
});

// ============================================================
// calculateARBs
// ============================================================
describe('calculateARBs', () => {
  it('should use the same formula as calculateSprings with default min/max', () => {
    const result = calculateARBs(55);
    // (65-1)*0.55 + 1 = 36.2
    expect(round(result.front)).toBe(36.2);
    // (65-1)*0.45 + 1 = 29.8
    expect(round(result.rear)).toBe(29.8);
  });

  it('50/50 distribution with custom range gives midpoint', () => {
    const result = calculateARBs(50, 10, 50);
    expect(result.front).toBe(30);
    expect(result.rear).toBe(30);
  });
});

// ============================================================
// calculateDampers
// ============================================================
describe('calculateDampers', () => {
  it('50/50 distribution should produce equal front/rear rebound', () => {
    const result = calculateDampers(50);
    // (20-1)*0.5 + 1 = 10.5
    expect(result.frontRebound).toBe(10.5);
    expect(result.rearRebound).toBe(10.5);
  });

  it('bump should be bumpRatio × rebound', () => {
    const result = calculateDampers(50, 1.0, 20.0, 0.6);
    expect(result.frontBump).toBeCloseTo(10.5 * 0.6, 5);
    expect(result.rearBump).toBeCloseTo(10.5 * 0.6, 5);
  });

  it('custom bumpRatio should be respected', () => {
    const result = calculateDampers(50, 1.0, 20.0, 0.8);
    expect(result.frontBump).toBeCloseTo(10.5 * 0.8, 5);
  });
});

// ============================================================
// calculateSpringsByFrequency
// ============================================================
describe('calculateSpringsByFrequency', () => {
  it('target freq == base freq should behave like standard springs', () => {
    const result = calculateSpringsByFrequency(100, 500, 50, 2.0, 2.0);
    // freqMultiplier = 1.0 → same as calculateSprings
    expect(result.front).toBe(300);
    expect(result.rear).toBe(300);
  });

  it('higher target frequency should produce stiffer springs', () => {
    const baseline = calculateSpringsByFrequency(100, 500, 50, 2.0, 2.0);
    const stiffer = calculateSpringsByFrequency(100, 500, 50, 3.0, 2.0);
    expect(stiffer.front).toBeGreaterThan(baseline.front);
    expect(stiffer.rear).toBeGreaterThan(baseline.rear);
  });

  it('results should be clamped within [min, max]', () => {
    // Very high frequency should still be clamped to max
    const result = calculateSpringsByFrequency(100, 500, 50, 10.0, 2.0);
    expect(result.front).toBeLessThanOrEqual(500);
    expect(result.rear).toBeLessThanOrEqual(500);
    expect(result.front).toBeGreaterThanOrEqual(100);
    expect(result.rear).toBeGreaterThanOrEqual(100);
  });

  it('high HP/weight ratio should stiffen rear springs (anti-squat)', () => {
    // hpWeightRatio = 600 / (1500/1000) = 400, > 200 threshold
    const noHp = calculateSpringsByFrequency(100, 500, 50, 2.0, 2.0, 0, 1500);
    const highHp = calculateSpringsByFrequency(100, 500, 50, 2.0, 2.0, 600, 1500);
    expect(highHp.rear).toBeGreaterThanOrEqual(noHp.rear);
  });
});

// ============================================================
// calculateARBsAdvanced
// ============================================================
describe('calculateARBsAdvanced', () => {
  it('RWD should soften rear ARB by 10%', () => {
    const rwd = calculateARBsAdvanced(50, 'RWD');
    const base = calculateARBs(50);
    // rear should be base.rear * 0.9
    expect(round(rwd.rear)).toBe(round(base.rear * 0.9));
  });

  it('AWD should stiffen rear ARB by 10%', () => {
    const awd = calculateARBsAdvanced(50, 'AWD');
    const base = calculateARBs(50);
    // rear should be base.rear * 1.1 (clamped to max 65)
    expect(round(awd.rear)).toBe(round(Math.min(65, base.rear * 1.1)));
  });

  it('FWD should not modify ARBs from baseline', () => {
    const fwd = calculateARBsAdvanced(50, 'FWD');
    const base = calculateARBs(50);
    expect(round(fwd.front)).toBe(round(base.front));
    expect(round(fwd.rear)).toBe(round(base.rear));
  });

  it('values should always be clamped within [min, max]', () => {
    const result = calculateARBsAdvanced(99, 'AWD', 1, 65);
    expect(result.front).toBeLessThanOrEqual(65);
    expect(result.rear).toBeLessThanOrEqual(65);
    expect(result.front).toBeGreaterThanOrEqual(1);
    expect(result.rear).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// calculateDampersAdvanced
// ============================================================
describe('calculateDampersAdvanced', () => {
  it('should scale rebound proportionally to spring rate (spring / 75)', () => {
    const result = calculateDampersAdvanced(750, 750);
    expect(result.frontRebound).toBe(10);
    expect(result.rearRebound).toBe(10);
  });

  it('bump should be bumpRatio × rebound', () => {
    const result = calculateDampersAdvanced(750, 750, 1, 20, 0.6);
    expect(result.frontBump).toBeCloseTo(10 * 0.6, 5);
    expect(result.rearBump).toBeCloseTo(10 * 0.6, 5);
  });

  it('very low spring rates should clamp rebound to min', () => {
    const result = calculateDampersAdvanced(10, 10);
    // 10/75 ≈ 0.133, clamped to 1.0
    expect(result.frontRebound).toBe(1.0);
    expect(result.rearRebound).toBe(1.0);
  });

  it('very high spring rates should clamp rebound to max', () => {
    const result = calculateDampersAdvanced(5000, 5000);
    // 5000/75 ≈ 66.7, clamped to 20.0
    expect(result.frontRebound).toBe(20.0);
    expect(result.rearRebound).toBe(20.0);
  });
});

// ============================================================
// calculateDampersCritical
// ============================================================
describe('calculateDampersCritical', () => {
  it('should return values within game limits [1.0, 20.0]', () => {
    const result = calculateDampersCritical(400, 350, 3000, 52);
    expect(result.frontRebound).toBeGreaterThanOrEqual(1.0);
    expect(result.frontRebound).toBeLessThanOrEqual(20.0);
    expect(result.rearRebound).toBeGreaterThanOrEqual(1.0);
    expect(result.rearRebound).toBeLessThanOrEqual(20.0);
    expect(result.frontBump).toBeGreaterThanOrEqual(1.0);
    expect(result.frontBump).toBeLessThanOrEqual(20.0);
    expect(result.rearBump).toBeGreaterThanOrEqual(1.0);
    expect(result.rearBump).toBeLessThanOrEqual(20.0);
  });

  it('bump should always be less than rebound (bumpRatio < reboundRatio)', () => {
    const result = calculateDampersCritical(400, 350, 3000, 52, 0.70, 0.50);
    expect(result.frontBump).toBeLessThanOrEqual(result.frontRebound);
    expect(result.rearBump).toBeLessThanOrEqual(result.rearRebound);
  });

  it('heavier front should produce stiffer front dampers', () => {
    // Same spring, same weight, but 70/30 front bias
    const result = calculateDampersCritical(400, 400, 3000, 70);
    // Cc_front uses more weight → larger → stiffer
    expect(result.frontRebound).toBeGreaterThan(result.rearRebound);
  });
});

// ============================================================
// getDifferentialBaseline
// ============================================================
describe('getDifferentialBaseline', () => {
  it('FWD should have zero rear accel/decel', () => {
    const result = getDifferentialBaseline('FWD');
    expect(result.accelR).toBe(0);
    expect(result.decelR).toBe(0);
  });

  it('RWD should have zero front accel/decel', () => {
    const result = getDifferentialBaseline('RWD');
    expect(result.accelF).toBe(0);
    expect(result.decelF).toBe(0);
  });

  it('AWD should have non-zero front & rear accel with center bias', () => {
    const result = getDifferentialBaseline('AWD');
    expect(result.accelF).toBeGreaterThan(0);
    expect(result.accelR).toBeGreaterThan(0);
    expect(result.center).toBe(70);
  });

  it('high torque/weight ratio should increase lock percentages (capped at 100)', () => {
    const low = getDifferentialBaseline('RWD', 0, 200, 1500);
    const high = getDifferentialBaseline('RWD', 0, 800, 1500);
    expect(high.accelR).toBeGreaterThan(low.accelR);
    expect(high.accelR).toBeLessThanOrEqual(100);
  });
});

// ============================================================
// calculateAlignmentSettings
// ============================================================
describe('calculateAlignmentSettings', () => {
  it('Road/RWD should produce negative camber and correct toe-R', () => {
    const result = calculateAlignmentSettings('Road', 'RWD', 300, 300, 100, 500, 30, 30);
    expect(result.camberF).toBeLessThan(0);
    expect(result.camberR).toBeLessThan(0);
    expect(result.toeR).toBe(-0.1); // RWD road → -0.1
  });

  it('Drift should have aggressive front negative camber', () => {
    const result = calculateAlignmentSettings('Drift', 'RWD', 300, 300, 100, 500, 30, 30);
    expect(result.camberF).toBeLessThanOrEqual(-4.0);
    expect(result.caster).toBe(7.0); // Drift caster is fixed at 7.0
  });

  it('Drag should use default/fallback alignment', () => {
    const result = calculateAlignmentSettings('Drag', 'RWD', 300, 300, 100, 500, 30, 30);
    expect(result.camberF).toBe(-1.5);
    expect(result.camberR).toBe(-1.0);
    expect(result.toeF).toBe(0.0);
    expect(result.toeR).toBe(0.0);
    expect(result.caster).toBe(5.0);
  });

  it('Rally should produce less aggressive camber than Drift', () => {
    const rally = calculateAlignmentSettings('Rally', 'AWD', 300, 300, 100, 500, 30, 30);
    const drift = calculateAlignmentSettings('Drift', 'RWD', 300, 300, 100, 500, 30, 30);
    expect(rally.camberF).toBeGreaterThan(drift.camberF);
  });

  it('all values should be rounded to 1 decimal place', () => {
    const result = calculateAlignmentSettings('Road', 'AWD', 250, 350, 100, 500, 20, 40);
    for (const val of [result.camberF, result.camberR, result.toeF, result.toeR, result.caster]) {
      expect(round(val, 1)).toBe(val);
    }
  });
});

// ============================================================
// calculateTirePressures
// ============================================================
describe('calculateTirePressures', () => {
  it('Road/RWD should produce front > rear base pressures', () => {
    const alignment = { camberF: -1.5, camberR: -1.0, toeF: 0.0, toeR: -0.1, caster: 5.5 };
    const result = calculateTirePressures('Road', 'RWD', alignment);
    // Base: F=1.9, R=1.8, with offsets
    expect(result.front).toBeGreaterThan(result.rear);
  });

  it('Rally should have lower base pressures', () => {
    const alignment = { camberF: -1.0, camberR: -0.5, toeF: 0.1, toeR: 0.0, caster: 5.0 };
    const roadResult = calculateTirePressures('Road', 'AWD', alignment);
    const rallyResult = calculateTirePressures('Rally', 'AWD', alignment);
    expect(rallyResult.front).toBeLessThan(roadResult.front);
    expect(rallyResult.rear).toBeLessThan(roadResult.rear);
  });

  it('pressures should be clamped between 1.0 and 4.0', () => {
    const extremeAlignment = { camberF: -5.0, camberR: -5.0, toeF: 1.0, toeR: 1.0, caster: 10.0 };
    const result = calculateTirePressures('Road', 'RWD', extremeAlignment);
    expect(result.front).toBeGreaterThanOrEqual(1.0);
    expect(result.front).toBeLessThanOrEqual(4.0);
    expect(result.rear).toBeGreaterThanOrEqual(1.0);
    expect(result.rear).toBeLessThanOrEqual(4.0);
  });
});

// ============================================================
// calculateAEGOGearing
// ============================================================
describe('calculateAEGOGearing', () => {
  it('should return correct number of gears', () => {
    const result = calculateAEGOGearing('Road', 6, { weight: 1400, weight_distribution: 50, drivetrain: 'RWD', maxHp: 300 }, 7500);
    expect(result.gears).toHaveLength(6);
  });

  it('gear ratios should be monotonically decreasing (g1 > g2 > ... > gN)', () => {
    const result = calculateAEGOGearing('Road', 6, { weight: 1400, weight_distribution: 50, drivetrain: 'RWD', maxHp: 300 }, 7500);
    for (let i = 1; i < result.gears.length; i++) {
      expect(result.gears[i]).toBeLessThan(result.gears[i - 1]);
    }
  });

  it('finalDrive should be clamped within [2.0, 6.5]', () => {
    const result = calculateAEGOGearing('Road', 6, { weight: 1400, weight_distribution: 50, drivetrain: 'RWD', maxHp: 1000 }, 9000);
    expect(result.finalDrive).toBeGreaterThanOrEqual(2.0);
    expect(result.finalDrive).toBeLessThanOrEqual(6.5);
  });

  it('Drift goal should produce different gearing than Road', () => {
    const road = calculateAEGOGearing('Road', 6, { weight: 1400, weight_distribution: 50, drivetrain: 'RWD', maxHp: 400 }, 7500);
    const drift = calculateAEGOGearing('Drift', 6, { weight: 1400, weight_distribution: 50, drivetrain: 'RWD', maxHp: 400 }, 7500);
    // Drift targets lower speed → different FD
    expect(drift.finalDrive).not.toBe(road.finalDrive);
  });

  it('should gracefully handle missing carParams', () => {
    // Uses all default fallbacks
    const result = calculateAEGOGearing('Road', 6, null, 7000);
    expect(result.gears).toHaveLength(6);
    expect(result.finalDrive).toBeGreaterThanOrEqual(2.0);
  });
});
