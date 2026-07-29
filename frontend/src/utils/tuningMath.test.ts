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

// TODO: 未來重新引入其他調校設定 (Alignment, TirePressure, Springs, ARB, Dampers, Differential) 時，需將對應的單元測試補回。

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
