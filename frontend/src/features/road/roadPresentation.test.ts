import { describe, expect, it } from 'vitest';
import { candidateParameters, candidateParameterUnits, parseGameTime, reasonText } from './roadPresentation';
describe('Road result inputs', () => {
  it('offers only saved adjustable controls and preserves alignment and gearing units', () => {
    const keys = ['pressure.front', 'diff.rear.acceleration', 'camber.front', 'gearing.gear1'];
    expect(candidateParameters(keys)).toEqual(keys);
    expect(candidateParameters(keys)).not.toContain('diff.front.acceleration');
    expect(candidateParameterUnits('camber.front')).toEqual(['deg']);
    expect(candidateParameterUnits('gearing.gear1')).toEqual(['ratio']);
    expect(candidateParameters([])).toContain('pressure.front');
  });
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
