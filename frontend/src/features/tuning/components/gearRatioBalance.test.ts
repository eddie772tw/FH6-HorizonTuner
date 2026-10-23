import { describe, it, expect } from 'vitest';
import { calculateRatioBalanceBounds, applyRatioBalance } from './gearRatioBalance';

describe('gearRatioBalance', () => {
  const baseFd = 3.50;
  const baseGears = [3.20, 2.15, 1.60, 1.25, 1.00, 0.82];

  describe('calculateRatioBalanceBounds', () => {
    it('determines reasonable scale bounds within Forza limits', () => {
      const bounds = calculateRatioBalanceBounds(baseFd, baseGears);
      expect(bounds.minScale).toBeLessThanOrEqual(1.0);
      expect(bounds.maxScale).toBeGreaterThanOrEqual(1.0);
      expect(bounds.minFd).toBeGreaterThanOrEqual(2.20);
      expect(bounds.maxFd).toBeLessThanOrEqual(6.00);
    });

    it('handles zero or empty gears safely', () => {
      const bounds = calculateRatioBalanceBounds(0, []);
      expect(bounds.minScale).toBe(1.0);
      expect(bounds.maxScale).toBe(1.0);
    });
  });

  describe('applyRatioBalance', () => {
    it('returns exact base values at scale 1.0', () => {
      const result = applyRatioBalance(baseFd, baseGears, 1.0);
      expect(result.finalDrive).toBe(baseFd);
      expect(result.gears).toEqual(baseGears);
    });

    it('scales FD and inverse-scales gears while preserving total reduction ratio', () => {
      const scale = 1.25;
      const result = applyRatioBalance(baseFd, baseGears, scale);
      
      // Expected new FD = 3.50 * 1.25 = 4.38
      expect(result.finalDrive).toBe(4.38);

      // Verify each gear's reduction ratio is virtually identical to base reduction ratio
      for (let i = 0; i < baseGears.length; i++) {
        const originalReduction = baseFd * baseGears[i];
        const newReduction = result.finalDrive * result.gears[i];
        // Error due to 2 decimal rounding should be <= 0.03
        expect(Math.abs(newReduction - originalReduction)).toBeLessThanOrEqual(0.03);
      }
    });

    it('handles tall FD (scale < 1.0) while preserving reduction ratio', () => {
      const scale = 0.80;
      const result = applyRatioBalance(baseFd, baseGears, scale);
      
      expect(result.finalDrive).toBe(2.80);

      for (let i = 0; i < baseGears.length; i++) {
        const originalReduction = baseFd * baseGears[i];
        const newReduction = result.finalDrive * result.gears[i];
        expect(Math.abs(newReduction - originalReduction)).toBeLessThanOrEqual(0.03);
      }
    });
  });
});
