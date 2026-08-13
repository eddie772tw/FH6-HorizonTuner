import { describe, expect, it } from 'vitest';
import {
  emptyQualifiedOutputPeaks,
  isQualifiedOutputSample,
  updateQualifiedOutputPeaks,
} from './qualifiedOutputPeaks';

const qualifiedSample = {
  IsRaceOn: 1,
  AccelInput: 255,
  CurrentEngineRpm: 6200,
  PowerWatts: 350000,
  TorqueNewtons: 620,
  TireSlipRatio: [0.02, -0.03, 0.04, -0.05],
};

describe('qualified output peaks', () => {
  it('accepts full-throttle, non-slipping samples in either timing state', () => {
    expect(isQualifiedOutputSample(qualifiedSample)).toBe(true);
    expect(isQualifiedOutputSample({ ...qualifiedSample, AccelInput: 254 })).toBe(false);
    expect(isQualifiedOutputSample({ ...qualifiedSample, IsRaceOn: 0 })).toBe(true);
    expect(isQualifiedOutputSample({ ...qualifiedSample, TireSlipRatio: [0.02, 0.03, 0.11, 0.04] })).toBe(false);
    expect(isQualifiedOutputSample({ ...qualifiedSample, TireSlipRatio: undefined })).toBe(false);
  });

  it('retains the RPM from each independent maximum', () => {
    const first = updateQualifiedOutputPeaks(emptyQualifiedOutputPeaks(), qualifiedSample);
    const second = updateQualifiedOutputPeaks(first, {
      ...qualifiedSample,
      CurrentEngineRpm: 7100,
      PowerWatts: 360000,
      TorqueNewtons: 600,
    });

    expect(second.power).toEqual({ value: 360000, rpm: 7100 });
    expect(second.torque).toEqual({ value: 620, rpm: 6200 });
  });

  it('does not let an unqualified spike replace an existing peak', () => {
    const first = updateQualifiedOutputPeaks(emptyQualifiedOutputPeaks(), qualifiedSample);
    const result = updateQualifiedOutputPeaks(first, {
      ...qualifiedSample,
      CurrentEngineRpm: 7000,
      PowerWatts: 500000,
      TorqueNewtons: 800,
      TireSlipRatio: [0.2, 0.2, 0.2, 0.2],
    });

    expect(result).toEqual(first);
  });
});
