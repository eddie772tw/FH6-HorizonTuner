import { describe, expect, it } from 'vitest';
import { parseGameTime, reasonText } from './roadPresentation';
describe('Road result inputs', () => {
  it('accepts explicit game times and refuses empty, malformed or impossible times', () => {
    expect(parseGameTime('1:23.456')).toBeCloseTo(83.456);
    expect(parseGameTime('1:02:03')).toBe(3723);
    expect(parseGameTime(' 83.456 ')).toBeCloseTo(83.456);
    for (const text of ['', '0', '-1', '1:99', '1:60', 'Infinity', '1:2:3:4', '2 seconds']) expect(parseGameTime(text)).toBeNull();
  });
  it('gives an actionable next step without assuming a missing condition is acceptable', () => {
    expect(reasonText('tires-unknown')).toContain('Confirm unchanged');
    expect(reasonText('recording-start-incomplete')).toContain('before starting');
    expect(reasonText('thermal-start-different')).toContain('starting thermal state');
  });
});
