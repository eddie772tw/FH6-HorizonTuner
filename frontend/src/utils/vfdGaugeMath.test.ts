import { describe, expect, it } from 'vitest';
import {
  calculateVFDNormalizedDynamicValue,
  calculateVFDRpmZones,
  getVFDRpmCellState,
  getVFDRpmLabelColor,
  isVFDUpshiftAlertActive,
} from './vfdGaugeMath';

describe('vfdGaugeMath', () => {
  describe('calculateVFDRpmZones', () => {
    it('uses payloadRedline when provided', () => {
      const { redlineRpm, warnRpm } = calculateVFDRpmZones(8000, 7200);
      expect(redlineRpm).toBe(7200);
      expect(warnRpm).toBe(6200); // 7200 - 1000
    });

    it('falls back to maxRpm * 0.92 when payloadRedline is missing', () => {
      const { redlineRpm, warnRpm } = calculateVFDRpmZones(8000);
      expect(redlineRpm).toBe(7360); // 8000 * 0.92
      expect(warnRpm).toBe(6360); // 7360 - 1000
    });

    it('clamps warnRpm to zero if redline is below 1000', () => {
      const { redlineRpm, warnRpm } = calculateVFDRpmZones(1000, 800);
      expect(redlineRpm).toBe(800);
      expect(warnRpm).toBe(0);
    });
  });

  describe('isVFDUpshiftAlertActive', () => {
    const redlineRpm = 7200;

    it('returns true ONLY when rpm >= redlineRpm AND throttle > 0.5', () => {
      expect(isVFDUpshiftAlertActive(7300, redlineRpm, 0.8)).toBe(true);
      expect(isVFDUpshiftAlertActive(7200, redlineRpm, 0.51)).toBe(true);
    });

    it('returns false when rpm is in redline BUT throttle <= 0.5', () => {
      expect(isVFDUpshiftAlertActive(7500, redlineRpm, 0.5)).toBe(false);
      expect(isVFDUpshiftAlertActive(7500, redlineRpm, 0.2)).toBe(false);
      expect(isVFDUpshiftAlertActive(7500, redlineRpm, 0.0)).toBe(false);
    });

    it('returns false when rpm is below redline regardless of throttle', () => {
      expect(isVFDUpshiftAlertActive(7000, redlineRpm, 1.0)).toBe(false);
    });
  });

  describe('calculateVFDNormalizedDynamicValue', () => {
    it('normalizes value based on default max floor when session max is small', () => {
      // current=50, defaultMaxFloor=100 -> 50 / 100 = 0.5
      expect(calculateVFDNormalizedDynamicValue(50, 0, 100)).toBe(0.5);
    });

    it('dynamically adjusts max when session peak is higher than floor', () => {
      // current=300, sessionMax=600 -> 300 / 600 = 0.5
      expect(calculateVFDNormalizedDynamicValue(300, 600, 100)).toBe(0.5);
    });

    it('clamps normalized result to range [0.0, 1.0]', () => {
      expect(calculateVFDNormalizedDynamicValue(-10, 100, 100)).toBe(0.0);
      expect(calculateVFDNormalizedDynamicValue(800, 500, 100)).toBe(1.0);
    });
  });

  describe('getVFDRpmCellState', () => {
    const totalCells = 54;
    const maxRpm = 8000;
    const redlineRpm = 7200;
    const warnRpm = 6200;

    it('identifies cells in normal zone', () => {
      expect(getVFDRpmCellState(20, totalCells, maxRpm, redlineRpm, warnRpm)).toBe('normal');
    });

    it('identifies cells in warning (yellowline) zone', () => {
      expect(getVFDRpmCellState(43, totalCells, maxRpm, redlineRpm, warnRpm)).toBe('warn');
    });

    it('identifies cells in redline zone', () => {
      expect(getVFDRpmCellState(50, totalCells, maxRpm, redlineRpm, warnRpm)).toBe('redline');
    });
  });

  describe('getVFDRpmLabelColor', () => {
    const palette = { primary: '#primary', amber: '#amber', hot: '#hot' };
    const maxRpm = 8000;
    const redlineRpm = 7200;
    const warnRpm = 6200;

    it('returns primary color for normal label numbers', () => {
      expect(getVFDRpmLabelColor(5, maxRpm, redlineRpm, warnRpm, palette)).toBe('#primary');
    });

    it('returns amber color for yellowline label numbers', () => {
      expect(getVFDRpmLabelColor(8, maxRpm, redlineRpm, warnRpm, palette)).toBe('#amber');
    });

    it('returns hot color for redline label numbers', () => {
      expect(getVFDRpmLabelColor(9, maxRpm, redlineRpm, warnRpm, palette)).toBe('#hot');
      expect(getVFDRpmLabelColor(10, maxRpm, redlineRpm, warnRpm, palette)).toBe('#hot');
    });
  });
});
