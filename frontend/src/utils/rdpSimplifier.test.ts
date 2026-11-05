import { describe, it, expect } from 'vitest';
import { simplifyPathRDP, Point2D } from './rdpSimplifier';

describe('simplifyPathRDP Vector Path Simplification', () => {
  it('should return original array if 2 or fewer points provided', () => {
    const points: Point2D[] = [{ x: 0, z: 0 }, { x: 10, z: 10 }];
    const simplified = simplifyPathRDP(points, 1.0);
    expect(simplified.length).toBe(2);
    expect(simplified).toEqual(points);
  });

  it('should simplify a straight line with intermediate collinear points into start and end points', () => {
    const straightLine: Point2D[] = [
      { x: 0, z: 0 },
      { x: 1, z: 1 },
      { x: 2, z: 2 },
      { x: 3, z: 3 },
      { x: 4, z: 4 },
      { x: 5, z: 5 }
    ];
    const simplified = simplifyPathRDP(straightLine, 0.1);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual({ x: 0, z: 0 });
    expect(simplified[1]).toEqual({ x: 5, z: 5 });
  });

  it('should preserve key corner points in a circuit hairpin track path', () => {
    const hairpinPath: Point2D[] = [
      { x: 0, z: 0 },
      { x: 50, z: 0 },   // Straight
      { x: 100, z: 0 },  // Entry corner
      { x: 120, z: 30 }, // Apex 1
      { x: 100, z: 60 }, // Exit corner
      { x: 0, z: 60 }    // Back straight
    ];
    const simplified = simplifyPathRDP(hairpinPath, 1.0);
    expect(simplified.length).toBeGreaterThanOrEqual(4);
    expect(simplified[0]).toEqual({ x: 0, z: 0 });
    expect(simplified[simplified.length - 1]).toEqual({ x: 0, z: 60 });
  });

  it('should safely simplify dense telemetry datasets without call stack overflow and preserve order', () => {
    const densePoints: Point2D[] = [];
    for (let i = 0; i < 5000; i++) {
      densePoints.push({
        x: i * 0.1,
        z: Math.sin(i * 0.05) * 10,
        customMeta: i
      });
    }

    const simplified = simplifyPathRDP(densePoints, 0.5);
    expect(simplified.length).toBeLessThan(densePoints.length);
    expect(simplified.length).toBeGreaterThan(2);
    expect(simplified[0].customMeta).toBe(0);
    expect(simplified[simplified.length - 1].customMeta).toBe(4999);

    // Verify monotonic index ordering is strictly preserved
    for (let i = 1; i < simplified.length; i++) {
      expect(simplified[i].customMeta).toBeGreaterThan(simplified[i - 1].customMeta);
    }
  });
});
