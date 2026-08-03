import { describe, expect, it } from 'vitest';
import { getTireCoefficient, tireGripCoefficients } from './tireCoefficients';

describe('tireCoefficients', () => {
  describe('getTireCoefficient', () => {
    it('should return the default coefficient when tireType is undefined', () => {
      expect(getTireCoefficient()).toBe(1.0);
    });

    it('should return the default coefficient when tireType is unknown', () => {
      expect(getTireCoefficient('UnknownTireType')).toBe(1.0);
    });

    it('should return the correct coefficient for known tire types', () => {
      expect(getTireCoefficient('Stock')).toBe(0.85);
      expect(getTireCoefficient('Street')).toBe(0.95);
      expect(getTireCoefficient('Sport')).toBe(1.05);
      expect(getTireCoefficient('Semi-Slick')).toBe(1.15);
      expect(getTireCoefficient('Slick')).toBe(1.15);
      expect(getTireCoefficient('Rally')).toBe(1.05);
      expect(getTireCoefficient('Off-Road')).toBe(1.05);
      expect(getTireCoefficient('Snow')).toBe(1.05);
      expect(getTireCoefficient('Drag')).toBe(1.40);
      expect(getTireCoefficient('Drift')).toBe(1.05);
    });
  });

  describe('tireGripCoefficients', () => {
    it('should contain the expected default value', () => {
      expect(tireGripCoefficients['Default']).toBe(1.0);
    });
  });
});
