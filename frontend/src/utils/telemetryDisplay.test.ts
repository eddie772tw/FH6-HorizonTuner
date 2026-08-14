import { describe, expect, it } from 'vitest';
import { formatRacePosition, formatTelemetryGear } from './telemetryDisplay';

describe('telemetry display formatting', () => {
  it('uses the dashboard packet gear encoding', () => {
    expect(formatTelemetryGear(0)).toBe('R');
    expect(formatTelemetryGear(1)).toBe('1');
    expect(formatTelemetryGear(10)).toBe('10');
    expect(formatTelemetryGear(11)).toBe('N');
  });

  it('keeps missing race positions visually neutral', () => {
    expect(formatRacePosition(undefined)).toBe('--');
    expect(formatRacePosition(0)).toBe('--');
    expect(formatRacePosition(3.8)).toBe('P3');
  });
});
