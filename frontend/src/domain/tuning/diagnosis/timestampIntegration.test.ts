import { describe, it, expect } from 'vitest';
import { integrateTimeMetrics } from './timestampIntegration';

describe('integrateTimeMetrics', () => {
  it('should handle empty samples', () => {
    const result = integrateTimeMetrics([]);
    expect(result.totalDurationS).toBe(0);
    expect(result.driftTimeRatio).toBe(0);
    expect(result.airtimeS).toBe(0);
    expect(result.impactWindowS).toBe(0);
    expect(result.isMonotonic).toBe(true);
  });

  it('should handle missing timestamps by returning unknown', () => {
    const result = integrateTimeMetrics([
      { timestamp: 1.0 },
      { sidewaysVelocity: 1.0 }, // missing timestamp
      { timestamp: 2.0 }
    ]);
    expect(result.totalDurationS).toBe('unknown');
    expect(result.driftTimeRatio).toBe('unknown');
    expect(result.airtimeS).toBe('unknown');
    expect(result.impactWindowS).toBe('unknown');
    expect(result.isMonotonic).toBe(true);
  });

  it('should handle non-monotonic timestamps', () => {
    const result = integrateTimeMetrics([
      { timestamp: 1.0 },
      { timestamp: 2.0 },
      { timestamp: 1.5 }, // non-monotonic
      { timestamp: 3.0 }
    ]);
    expect(result.totalDurationS).toBe('unknown');
    expect(result.isMonotonic).toBe(false);
  });

  it('should calculate valid integration metrics', () => {
    const result = integrateTimeMetrics([
      { timestamp: 1.0, sidewaysVelocity: 1.0, suspensionTravel: [0.1, 0.1, 0.1, 0.1], verticalG: 1.0 },
      { timestamp: 1.5, sidewaysVelocity: 6.0, suspensionTravel: [0.5, 0.5, 0.5, 0.5], verticalG: 1.5 }, // dt=0.5, drifting
      { timestamp: 2.0, sidewaysVelocity: 0.0, suspensionTravel: [0.01, 0.01, 0.01, 0.01], verticalG: 0.5 }, // dt=0.5, in air
      { timestamp: 3.0, sidewaysVelocity: 0.0, suspensionTravel: [0.9, 0.9, 0.9, 0.9], verticalG: 4.0 } // dt=1.0, landing, high impact G
    ]);
    expect(result.isMonotonic).toBe(true);
    expect(result.totalDurationS).toBeCloseTo(2.0);
    expect(result.driftTimeRatio).toBeCloseTo(0.5 / 2.0);
    expect(result.airtimeS).toBeCloseTo(0.5);
    expect(result.impactWindowS).toBeCloseTo(1.0);
  });

  it('should handle zero inputs / boundary limits', () => {
    const result = integrateTimeMetrics([
      { timestamp: 0.0, sidewaysVelocity: 0.0, suspensionTravel: [0, 0, 0, 0], verticalG: 0.0 },
      { timestamp: 0.0, sidewaysVelocity: 0.0, suspensionTravel: [0, 0, 0, 0], verticalG: 0.0 }
    ]);
    expect(result.totalDurationS).toBe(0);
    expect(result.driftTimeRatio).toBe(0);
    expect(result.airtimeS).toBe(0); // dt is 0
    expect(result.impactWindowS).toBe(0);
  });
});
