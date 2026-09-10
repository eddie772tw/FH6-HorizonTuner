import { describe, expect, it } from 'vitest';
import { drivenAxles, summarizeNormalizedSlip } from './telemetrySlipMetrics';

describe('summarizeNormalizedSlip', () => {
  it('preserves normalized ANG and RAT values without converting their units', () => {
    const metrics = summarizeNormalizedSlip([0.1, -0.3, 1.2, 0.4], [0.2, -1.1, 0.5, -0.7]);

    expect(metrics.avgNormalizedSlipRatioF).toBeCloseTo(-0.1);
    expect(metrics.avgNormalizedSlipRatioR).toBeCloseTo(0.8);
    expect(metrics.maxNormalizedSlipAngleF).toBe(1.1);
    expect(metrics.normalizedSlipAngleFR).toBe(-1.1);
    expect(metrics.normalizedSlipRatioRL).toBe(1.2);
  });

  it('selects only the driven axles for each drivetrain', () => {
    expect(drivenAxles('FWD')).toEqual(['front']);
    expect(drivenAxles('RWD')).toEqual(['rear']);
    expect(drivenAxles('AWD')).toEqual(['front', 'rear']);
  });

  it('marks incomplete data instead of treating it as zero normalized slip', () => {
    const metrics = summarizeNormalizedSlip([0.2, Number.NaN], [0.1, 0.2, 0.3, 0.4]);

    expect(metrics.hasCompleteNormalizedSlipRatio).toBe(false);
    expect(metrics.hasCompleteNormalizedSlipAngle).toBe(true);
  });
});
