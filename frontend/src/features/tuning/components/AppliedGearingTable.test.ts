import { describe, expect, it } from 'vitest';
import { isAppliedGearingValid } from './AppliedGearingTable';

describe('applied gearing confirmation eligibility', () => {
  const actual = { finalDrive: 3.85, gears: [2.12, 1.59, 1.23, 1, 0.83, 0.72] };

  it('accepts actual game ratios independently of the suggested final drive', () => {
    expect(isAppliedGearingValid(actual)).toBe(true);
  });

  it.each([0, -1, NaN, Infinity])('rejects an invalid final drive %s', finalDrive => {
    expect(isAppliedGearingValid({ ...actual, finalDrive })).toBe(false);
  });

  it.each([0, -1, NaN, Infinity])('rejects an incomplete or invalid individual gear %s', ratio => {
    expect(isAppliedGearingValid({ ...actual, gears: [2.12, ratio, 1.23] })).toBe(false);
  });

  it('requires at least one known forward gear', () => {
    expect(isAppliedGearingValid({ ...actual, gears: [] })).toBe(false);
  });
});
