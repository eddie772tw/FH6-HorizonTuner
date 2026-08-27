import { describe, expect, it } from 'vitest';
import { getSuspensionDisplayValue } from './suspensionTravel';

describe('suspension travel display conversion', () => {
  it('keeps normalized travel unchanged in relative mode', () => {
    expect(getSuspensionDisplayValue(0.625, 0.142, 'relative')).toBe(0.625);
  });

  it('converts absolute packet meters to millimeters', () => {
    expect(getSuspensionDisplayValue(0.625, 0.142, 'absolute')).toBeCloseTo(142);
  });

  it('guards non-finite packet values', () => {
    expect(getSuspensionDisplayValue(Number.NaN, Number.NaN, 'relative')).toBe(0);
    expect(getSuspensionDisplayValue(0.5, Number.POSITIVE_INFINITY, 'absolute')).toBe(0);
  });
});
