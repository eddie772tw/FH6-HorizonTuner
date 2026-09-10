import { describe, expect, it } from 'vitest';
import { samplePath, trackPoints } from './analysisChannels';
import type { AnalysisDataPoint } from '../../context/TelemetryRecorderContext';
describe('honest offline chart inputs', () => {
  it('retains raw small controls and breaks paths at missing channels and positions', () => {
    const points = [0, 1, 2, 3].map(i => ({ time: i / 10, PositionX: i, PositionZ: 0, AccelInput: i === 1 ? null : 1 }) as AnalysisDataPoint);
    const result = trackPoints(points, 'throttle');
    expect(result.map(p => p.raw.AccelInput)).toEqual([1, 1, 1]);
    expect(result[1].breakBefore).toBe(true);
    expect(result[2].breakBefore).toBe(false);
    expect(trackPoints([{ ...points[0], PositionX: null }], 'throttle')).toEqual([]);
  });
  it('never joins across unknown sample values', () => {
    const path = samplePath([10, null, 20], 100);
    expect(path.split('M')).toHaveLength(3);
    expect(path).not.toContain('L');
    expect(samplePath([null, null], 100).trim()).toBe('');
  });
});
