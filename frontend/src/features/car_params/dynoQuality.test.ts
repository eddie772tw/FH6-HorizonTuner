import { describe, expect, it } from 'vitest';
import { presentDynoQuality } from './dynoQuality';

describe('presentDynoQuality', () => {
  it('fails closed when the current main-compatible profile has no quality field', () => {
    expect(presentDynoQuality()).toMatchObject({ label: 'Measurement unavailable', tone: 'secondary' });
  });

  it('presents discontinuities as suspected rather than as tuning truth', () => {
    const presentation = presentDynoQuality({
      status: 'suspect', confidence: 0, reasons: ['position-discontinuity'], canCollect: false, segmentId: 1, segmentReset: false
    });
    expect(presentation.tone).toBe('warning');
    expect(presentation.detail).toContain('position-discontinuity');
  });

  it('keeps confidence explicitly qualified for stable telemetry', () => {
    expect(presentDynoQuality({
      status: 'confident', confidence: 1, reasons: [], canCollect: true, segmentId: 0, segmentReset: false
    }).detail).toContain('not a tuning truth claim');
  });
});
