import { describe, expect, it } from 'vitest';
import { formatRacePosition, formatTelemetryGear } from './telemetryDisplay';

describe('telemetry display formatting', () => {
  describe('formatTelemetryGear', () => {
    it('formats reverse gear (0)', () => {
      expect(formatTelemetryGear(0)).toBe('R');
    });

    it('formats forward gears (1 to 10)', () => {
      expect(formatTelemetryGear(1)).toBe('1');
      expect(formatTelemetryGear(5)).toBe('5');
      expect(formatTelemetryGear(10)).toBe('10');
    });

    it('formats neutral gear (11)', () => {
      expect(formatTelemetryGear(11)).toBe('N');
    });

    it('handles non-finite values by returning N', () => {
      expect(formatTelemetryGear(undefined)).toBe('N');
      expect(formatTelemetryGear(null as unknown as number)).toBe('N');
      expect(formatTelemetryGear(NaN)).toBe('N');
      expect(formatTelemetryGear(Infinity)).toBe('N');
      expect(formatTelemetryGear(-Infinity)).toBe('N');
    });

    it('handles negative values by returning N', () => {
      expect(formatTelemetryGear(-1)).toBe('N');
      expect(formatTelemetryGear(-5)).toBe('N');
    });

    it('truncates floating point values', () => {
      expect(formatTelemetryGear(3.7)).toBe('3');
      expect(formatTelemetryGear(0.9)).toBe('R');
      expect(formatTelemetryGear(11.4)).toBe('N');
    });
  });

  describe('formatRacePosition', () => {
    it('formats valid race positions', () => {
      expect(formatRacePosition(1)).toBe('P1');
      expect(formatRacePosition(12)).toBe('P12');
    });

    it('truncates floating point positions', () => {
      expect(formatRacePosition(3.8)).toBe('P3');
      expect(formatRacePosition(1.1)).toBe('P1');
    });

    it('returns -- for missing, zero, or negative positions', () => {
      expect(formatRacePosition(undefined)).toBe('--');
      expect(formatRacePosition(null as unknown as number)).toBe('--');
      expect(formatRacePosition(0)).toBe('--');
      expect(formatRacePosition(-1)).toBe('--');
      expect(formatRacePosition(NaN)).toBe('--');
      expect(formatRacePosition(Infinity)).toBe('--');
      expect(formatRacePosition(-Infinity)).toBe('--');
    });
  });
});
