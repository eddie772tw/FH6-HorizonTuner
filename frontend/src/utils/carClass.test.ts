import { describe, it, expect } from 'vitest';
import {
  CAR_CLASSES,
  FH6_PI_CLASS_RANGES,
  getCarClassFromPi,
  getCarClassString,
  resolveCarClass,
  getCarClassBadgeText,
} from './carClass';

describe('carClass utility module', () => {
  describe('Constants verification', () => {
    it('should define the 8 standard FH6 car classes in order', () => {
      expect(CAR_CLASSES).toEqual(['D', 'C', 'B', 'A', 'S1', 'S2', 'R', 'X']);
    });

    it('should contain exact FH6 PI class range definitions', () => {
      expect(FH6_PI_CLASS_RANGES).toEqual([
        { min: 100, max: 400, name: 'D' },
        { min: 401, max: 500, name: 'C' },
        { min: 501, max: 600, name: 'B' },
        { min: 601, max: 700, name: 'A' },
        { min: 701, max: 800, name: 'S1' },
        { min: 801, max: 900, name: 'S2' },
        { min: 901, max: 998, name: 'R' },
        { min: 999, max: Infinity, name: 'X' },
      ]);
    });
  });

  describe('getCarClassFromPi', () => {
    it('should correctly classify D-class (PI 100~400)', () => {
      expect(getCarClassFromPi(100)).toBe('D');
      expect(getCarClassFromPi(250)).toBe('D');
      expect(getCarClassFromPi(400)).toBe('D');
    });

    it('should correctly classify C-class (PI 401~500)', () => {
      expect(getCarClassFromPi(401)).toBe('C');
      expect(getCarClassFromPi(450)).toBe('C');
      expect(getCarClassFromPi(500)).toBe('C');
    });

    it('should correctly classify B-class (PI 501~600)', () => {
      expect(getCarClassFromPi(501)).toBe('B');
      expect(getCarClassFromPi(550)).toBe('B');
      expect(getCarClassFromPi(600)).toBe('B');
    });

    it('should correctly classify A-class (PI 601~700)', () => {
      expect(getCarClassFromPi(601)).toBe('A');
      expect(getCarClassFromPi(650)).toBe('A');
      expect(getCarClassFromPi(700)).toBe('A');
    });

    it('should correctly classify S1-class (PI 701~800)', () => {
      expect(getCarClassFromPi(701)).toBe('S1');
      expect(getCarClassFromPi(750)).toBe('S1');
      expect(getCarClassFromPi(800)).toBe('S1');
    });

    it('should correctly classify S2-class (PI 801~900)', () => {
      expect(getCarClassFromPi(801)).toBe('S2');
      expect(getCarClassFromPi(850)).toBe('S2');
      expect(getCarClassFromPi(900)).toBe('S2');
    });

    it('should correctly classify R-class (PI 901~998 in FH6)', () => {
      expect(getCarClassFromPi(901)).toBe('R');
      expect(getCarClassFromPi(950)).toBe('R');
      expect(getCarClassFromPi(998)).toBe('R');
    });

    it('should correctly classify X-class (PI 999+)', () => {
      expect(getCarClassFromPi(999)).toBe('X');
      expect(getCarClassFromPi(1000)).toBe('X');
    });

    it('should return empty string for invalid, zero, or negative PI', () => {
      expect(getCarClassFromPi(0)).toBe('');
      expect(getCarClassFromPi(-50)).toBe('');
      expect(getCarClassFromPi(undefined)).toBe('');
      expect(getCarClassFromPi(null)).toBe('');
      expect(getCarClassFromPi(NaN)).toBe('');
    });
  });

  describe('getCarClassString (UDP Enum Mapping)', () => {
    it('should map 0~7 to D, C, B, A, S1, S2, R, X correctly without E-class offset', () => {
      expect(getCarClassString(0)).toBe('D');
      expect(getCarClassString(1)).toBe('C');
      expect(getCarClassString(2)).toBe('B');
      expect(getCarClassString(3)).toBe('A');
      expect(getCarClassString(4)).toBe('S1');
      expect(getCarClassString(5)).toBe('S2');
      expect(getCarClassString(6)).toBe('R');
      expect(getCarClassString(7)).toBe('X');
    });

    it('should handle out-of-range integer enums gracefully', () => {
      expect(getCarClassString(8)).toBe('Class 8');
      expect(getCarClassString(-1)).toBe('Class -1');
    });

    it('should return empty string for null, undefined, or NaN', () => {
      expect(getCarClassString(undefined)).toBe('');
      expect(getCarClassString(null)).toBe('');
      expect(getCarClassString(NaN)).toBe('');
    });
  });

  describe('resolveCarClass', () => {
    it('should prioritize FH6 PI range when PI > 0', () => {
      // Even if legacy enum passed 3, PI 750 is S1 in FH6
      expect(resolveCarClass(3, 750)).toBe('S1');
      // PI 850 is S2 in FH6
      expect(resolveCarClass(4, 850)).toBe('S2');
      // PI 950 is R in FH6
      expect(resolveCarClass(5, 950)).toBe('R');
      // PI 999 is X
      expect(resolveCarClass(6, 999)).toBe('X');
    });

    it('should fallback to UDP enum when PI is 0 or undefined', () => {
      expect(resolveCarClass(4, 0)).toBe('S1');
      expect(resolveCarClass(4, undefined)).toBe('S1');
      expect(resolveCarClass(5, null)).toBe('S2');
      expect(resolveCarClass(6, undefined)).toBe('R');
    });

    it('should return empty string when neither is valid', () => {
      expect(resolveCarClass(undefined, undefined)).toBe('');
      expect(resolveCarClass(null, 0)).toBe('');
    });
  });

  describe('getCarClassBadgeText', () => {
    it('should format combined Class and PI when both are valid', () => {
      expect(getCarClassBadgeText(4, 750)).toBe('S1 750');
      expect(getCarClassBadgeText(5, 850)).toBe('S2 850');
      expect(getCarClassBadgeText(6, 950)).toBe('R 950');
      expect(getCarClassBadgeText(7, 999)).toBe('X 999');
      expect(getCarClassBadgeText(0, 350)).toBe('D 350');
    });

    it('should format class only when PI is missing or 0', () => {
      expect(getCarClassBadgeText(4, 0)).toBe('S1');
      expect(getCarClassBadgeText(4, undefined)).toBe('S1');
      expect(getCarClassBadgeText(6, null)).toBe('R');
    });

    it('should format class + PI when only PI is provided', () => {
      expect(getCarClassBadgeText(undefined, 750)).toBe('S1 750');
      expect(getCarClassBadgeText(null, 950)).toBe('R 950');
    });

    it('should return empty string when no valid data is available', () => {
      expect(getCarClassBadgeText(undefined, undefined)).toBe('');
      expect(getCarClassBadgeText(null, null)).toBe('');
      expect(getCarClassBadgeText(undefined, 0)).toBe('');
    });
  });
});
