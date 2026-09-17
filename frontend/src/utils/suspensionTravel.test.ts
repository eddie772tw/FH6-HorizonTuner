import { describe, expect, it } from 'vitest';
import { getSuspensionDisplayValue, type SuspensionTravelMode } from './suspensionTravel';

describe('suspension travel display conversion', () => {
  describe('relative mode', () => {
    it('keeps normalized travel unchanged in relative mode for typical values', () => {
      expect(getSuspensionDisplayValue(0.625, 0.142, 'relative')).toBe(0.625);
      expect(getSuspensionDisplayValue(0, 0, 'relative')).toBe(0);
      expect(getSuspensionDisplayValue(1.0, 0.25, 'relative')).toBe(1.0);
    });

    it('handles negative normalized travel values in relative mode', () => {
      expect(getSuspensionDisplayValue(-0.15, 0.05, 'relative')).toBe(-0.15);
    });

    it('returns 0 when normalized travel is non-finite in relative mode', () => {
      expect(getSuspensionDisplayValue(Number.NaN, 0.142, 'relative')).toBe(0);
      expect(getSuspensionDisplayValue(Number.POSITIVE_INFINITY, 0.142, 'relative')).toBe(0);
      expect(getSuspensionDisplayValue(Number.NEGATIVE_INFINITY, 0.142, 'relative')).toBe(0);
    });
  });

  describe('absolute mode', () => {
    it('converts absolute packet meters to millimeters', () => {
      expect(getSuspensionDisplayValue(0.625, 0.142, 'absolute')).toBeCloseTo(142);
      expect(getSuspensionDisplayValue(0, 0, 'absolute')).toBe(0);
      expect(getSuspensionDisplayValue(0.5, 0.0854, 'absolute')).toBeCloseTo(85.4);
    });

    it('handles negative travel meters in absolute mode', () => {
      expect(getSuspensionDisplayValue(0.5, -0.02, 'absolute')).toBeCloseTo(-20);
    });

    it('returns 0 when travel meters is non-finite in absolute mode', () => {
      expect(getSuspensionDisplayValue(0.625, Number.NaN, 'absolute')).toBe(0);
      expect(getSuspensionDisplayValue(0.5, Number.POSITIVE_INFINITY, 'absolute')).toBe(0);
      expect(getSuspensionDisplayValue(0.5, Number.NEGATIVE_INFINITY, 'absolute')).toBe(0);
    });
  });

  describe('unknown/fallback mode', () => {
    it('falls back to normalized travel if mode is unknown or default', () => {
      expect(getSuspensionDisplayValue(0.75, 0.15, 'invalid' as SuspensionTravelMode)).toBe(0.75);
    });
  });
});
