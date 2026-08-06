import { describe, it, expect } from 'vitest';
import { calculateGPointOffset, calculateRadarDiameter } from './gforceRadarMath';

describe('gforceRadarMath - G-Force Radar Geometry & Offset Logic', () => {
  describe('calculateGPointOffset', () => {
    it('returns zero offset for 0 G-Force', () => {
      const result = calculateGPointOffset(0, 0, 100, 7);
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(0);
      expect(result.dist).toBe(0);
    });

    it('calculates exact offset for 1.0G (should be at 50% radius)', () => {
      const radius = 100;
      const dotRadius = 7;
      // 1.0 Lat G, 0 Lon G -> scaleFactor = 100 * 0.5 = 50
      const result = calculateGPointOffset(1, 0, radius, dotRadius);
      expect(result.dx).toBe(50);
      expect(result.dy).toBe(0);
      expect(result.dist).toBe(50);
    });

    it('clamps offset when G-Force is extremely high (e.g. 4.0G impact)', () => {
      const radius = 100;
      const dotRadius = 7;
      const maxR = radius - dotRadius; // 93
      const result = calculateGPointOffset(4, 3, radius, dotRadius);
      expect(result.dist).toBeCloseTo(maxR, 4);
      expect(result.dx).toBeGreaterThan(0);
      expect(result.dy).toBeGreaterThan(0);
      // Ensure dx^2 + dy^2 equals maxR^2
      expect(Math.sqrt(result.dx ** 2 + result.dy ** 2)).toBeCloseTo(93, 4);
    });

    it('handles zero or negative radius safely', () => {
      const result = calculateGPointOffset(1, 1, 0, 7);
      expect(result.dx).toBe(0);
      expect(result.dy).toBe(0);
      expect(result.dist).toBe(0);
    });

    it('respects custom gScale factor', () => {
      const radius = 100;
      // gScale = 1.5 -> 1.0G produces dx = 50 * 1.5 = 75
      const result = calculateGPointOffset(1, 0, radius, 7, 1.5);
      expect(result.dx).toBe(75);
    });
  });

  describe('calculateRadarDiameter', () => {
    it('calculates optimal square size based on container dimensions', () => {
      // container: 200x300, labelHeight: 40 -> availH = 260, availW = 192 -> min(192, 260) = 192
      const size = calculateRadarDiameter(200, 300, 40, 120, 260);
      expect(size).toBe(192);
    });

    it('clamps to minSize when container is very small', () => {
      const size = calculateRadarDiameter(80, 80, 40, 120, 260);
      expect(size).toBe(120);
    });

    it('clamps to maxSize when container is very large', () => {
      const size = calculateRadarDiameter(500, 500, 40, 120, 260);
      expect(size).toBe(260);
    });
  });
});
