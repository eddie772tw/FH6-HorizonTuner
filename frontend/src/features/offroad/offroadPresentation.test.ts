import { describe, expect, it } from 'vitest';
import { parseGameTime, reasonText, offroadConclusions } from './offroadPresentation';

describe('Offroad result inputs and presentation', () => {
  it('accepts explicit game times and rejects malformed values', () => {
    expect(parseGameTime('1:23.456')).toBeCloseTo(83.456);
    expect(parseGameTime('2:05.100')).toBeCloseTo(125.1);
    expect(parseGameTime(' 45.200 ')).toBeCloseTo(45.2);
    for (const text of ['', '0', '-1', '1:99', '1:60', 'Infinity', 'abc']) {
      expect(parseGameTime(text)).toBeNull();
    }
  });

  it('provides actionable guidance for offroad comparison reasons', () => {
    expect(reasonText('finish-time-unknown')).toContain('Confirm the full-event time');
    expect(reasonText('recording-start-incomplete')).toContain('Start recording before');
    expect(reasonText('route-insufficient')).toContain('Record position data');
    expect(reasonText('tires-changed')).toContain('Confirm unchanged');
  });

  it('includes descriptive offroad conclusions', () => {
    expect(offroadConclusions['bottoming-reduced']).toContain('severe bottoming');
    expect(offroadConclusions['tradeoff']).toContain('severe bottoming');
    expect(offroadConclusions['provisional-keep']).toContain('Candidate was faster');
  });
});
