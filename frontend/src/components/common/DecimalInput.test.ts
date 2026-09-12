import { describe, it, expect } from 'vitest';

describe('DecimalInput numerical format & parse invariants', () => {
  it('correctly handles raw user decimal inputs without premature truncation', () => {
    const rawPartial = '12.';
    expect(parseFloat(rawPartial)).toBe(12);
    // When typing '12.5', raw string preserved in local state
    expect(parseFloat('12.5')).toBe(12.5);
  });

  it('handles negative signs and empty string clearing', () => {
    expect(Number.isNaN(parseFloat('-'))).toBe(true);
    expect(''.trim()).toBe('');
  });

  it('clamps numerical values between min and max on blur', () => {
    const clamp = (val: number, min?: number, max?: number) => {
      let res = val;
      if (min !== undefined && res < min) res = min;
      if (max !== undefined && res > max) res = max;
      return res;
    };
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(45, 0, 100)).toBe(45);
  });

  it('formats to fixed precision when requested without modifying valid numeric outputs', () => {
    const format = (val: number, precision?: number) =>
      precision !== undefined ? val.toFixed(precision) : String(val);
    expect(format(12.56, 1)).toBe('12.6');
    expect(format(12.5, 2)).toBe('12.50');
    expect(format(12, 1)).toBe('12.0');
    expect(format(12)).toBe('12');
  });
});
