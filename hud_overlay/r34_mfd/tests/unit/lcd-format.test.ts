import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const context: Record<string, any> = {};
for (const name of ['model', 'lcd-format']) runInNewContext(readFileSync(resolve(import.meta.dirname, '../../' + name + '.js'), 'utf8'), context);
const L = context.R34LcdFormat;
describe('bounded single-line LCD display formatting', () => {
  it.each([0, 1, -1, 9999, -9999, 288.3, -10.5])('retains ordinary integer rendering for %s', value => {
    expect(L.number(value)).toBe(value.toFixed(0));
  });
  it.each([10000, -10000, 9999.5, -9999.5, 1234567, -1234567, 1e38, -1e38, 1e300, -1e300])('keeps explicit sign and approximate magnitude for long value %s', value => {
    const text = L.number(value), displayed = Number(text);
    expect(text.length).toBeLessThanOrEqual(6); expect(text).toMatch(/^-?[\d.]+e\d+$/);
    expect(Math.sign(displayed)).toBe(Math.sign(value));
    expect(Math.abs(displayed / value - 1)).toBeLessThan(.06);
  });
  it.each([Number.MAX_VALUE, -Number.MAX_VALUE])('bounds the largest finite input without truncating its exponent', value => {
    expect(L.number(value)).toBe(value < 0 ? '-2e308' : '2e308');
    expect(L.number(value).length).toBeLessThanOrEqual(6);
  });
  it.each([undefined, null, NaN, Infinity, -Infinity, '100'])('shows unavailable %s independently with its unit', value => {
    expect(L.reading(value, 'HP')).toBe('N/A HP');
    expect(L.reading(value, 'lb·ft')).toBe('N/A lb·ft');
  });
  it('retains every selected unit and both signed readings in a bounded simultaneous row', () => {
    for (const power of ['HP', 'PS', 'kW']) for (const torque of ['N·m', 'lb·ft']) {
      const row = L.reading(-1e300, power) + ' ' + L.reading(-1e300, torque);
      expect(row).toContain('-1e300 ' + power); expect(row).toContain('-1e300 ' + torque);
      expect(row.length).toBeLessThanOrEqual(22);
    }
  });
  it('keeps validated zero and long lap timing; only unbounded durations use explicit seconds', () => {
    expect(L.timer(0)).toBe("0'00.000"); expect(L.timer(35999.999)).toBe("599'59.999");
    expect(L.timer(1e300)).toBe('1e300 s'); expect(L.timer(Number.MAX_VALUE)).toBe('2e308 s');
    expect(L.timer(Number.MAX_SAFE_INTEGER / 1000 + 1)).toMatch(/^[\d.]+e\d+ s$/); expect(L.timer(null)).toBe("—'——.———");
  });
});
