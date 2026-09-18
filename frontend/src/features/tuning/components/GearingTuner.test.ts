import { describe, it, expect } from 'vitest';
import { computeGearingChartData } from './GearingTuner';

describe('computeGearingChartData', () => {
  const dummyConvertSpeed = (ms: number) => ({ value: ms * 3.6, label: 'km/h' });

  it('caps gear line endpoints to cutoffRpm when effectiveRedline is lower than maxRpm', () => {
    const res = computeGearingChartData({
      numGears: 3,
      gears: [3.2, 2.1, 1.5],
      finalDrive: 3.4,
      maxRpm: 8000,
      effectiveRedline: 6200,
      maxHpRpm: 5800,
      tireRadiusM: 0.32,
      speedUnit: 'kmh',
      convertSpeed: dummyConvertSpeed,
    });

    expect(res.cutoffRpm).toBe(6200);
    expect(res.yMax).toBe(8000); // Gauge max is preserved for Y-axis domain
    expect(res.gearRanges).toHaveLength(3);

    const gear1Range = res.gearRanges[0];
    const gear2Range = res.gearRanges[1];

    // Gear 1 starts at 0, Gear 2 starts at Gear 1 endSpeed
    expect(gear1Range.startSpeed).toBe(0);
    expect(gear2Range.startSpeed).toBe(gear1Range.endSpeed);

    // Find the point at Gear 1 endSpeed (shift point)
    const shiftPt = res.chartData.find(pt => Math.abs(pt.speed - gear1Range.endSpeed) < 0.05);
    expect(shiftPt).toBeDefined();
    if (shiftPt) {
      // Gear 1 at shift point reaches cutoffRpm (6200)
      expect(shiftPt.gear1).toBe(6200);
      // Gear 2 at shift point drops to gear2 ratio RPM
      expect(shiftPt.gear2).toBeLessThan(6200);
      expect(shiftPt.gear2).toBeGreaterThan(3800);
    }

    // Ensure no points for any gear exceed cutoffRpm
    for (const pt of res.chartData) {
      if (pt.gear1 !== undefined) expect(pt.gear1).toBeLessThanOrEqual(6200);
      if (pt.gear2 !== undefined) expect(pt.gear2).toBeLessThanOrEqual(6200);
      if (pt.gear3 !== undefined) expect(pt.gear3).toBeLessThanOrEqual(6200);
    }
  });

  it('falls back to maxRpm or maxHpRpm * 1.15 when effectiveRedline is undefined', () => {
    const res = computeGearingChartData({
      numGears: 2,
      gears: [3.0, 2.0],
      finalDrive: 3.5,
      maxRpm: 7500,
      tireRadiusM: 0.32,
      speedUnit: 'kmh',
      convertSpeed: dummyConvertSpeed,
    });

    expect(res.cutoffRpm).toBe(7500);
    expect(res.yMax).toBe(7500);

    const gear1Range = res.gearRanges[0];
    const shiftPt = res.chartData.find(pt => Math.abs(pt.speed - gear1Range.endSpeed) < 0.05);
    expect(shiftPt).toBeDefined();
    if (shiftPt) {
      expect(shiftPt.gear1).toBe(7500);
    }
  });
});
