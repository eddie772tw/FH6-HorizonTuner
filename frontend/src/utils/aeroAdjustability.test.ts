import { describe, expect, it } from 'vitest';
import { isAeroAxleAdjustable, normalizeAeroAdjustability } from './aeroAdjustability';

describe('aero adjustability', () => {
  it.each([
    ['Adjustable', true, true],
    ['Front Only', true, false],
    ['Rear Only', false, true],
    ['Fixed', false, false],
  ])('maps %s to its adjustable axes', (value, front, rear) => {
    expect(isAeroAxleAdjustable(value, 'front')).toBe(front);
    expect(isAeroAxleAdjustable(value, 'rear')).toBe(rear);
  });

  it('keeps legacy or unknown values compatible with the two-axis workflow', () => {
    expect(normalizeAeroAdjustability(undefined)).toBe('Adjustable');
    expect(isAeroAxleAdjustable('unknown', 'front')).toBe(true);
    expect(isAeroAxleAdjustable('unknown', 'rear')).toBe(true);
  });
});
