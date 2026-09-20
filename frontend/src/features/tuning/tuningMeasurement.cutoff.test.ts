import { describe, expect, it } from 'vitest';
import type { TelemetryData } from '../../hooks/useTelemetry';
import { parseEngineArchive } from './engineMeasurementArchive';
import { advanceTuningMeasurement, createTuningMeasurement, getTuningMeasurementReadiness, type TuningMeasurementState } from './tuningMeasurement';

const frame = (time: number, rpm: number, output = rpm * 40, overrides: Partial<TelemetryData> = {}): TelemetryData => ({
  IsRaceOn: 1, TimestampMS: time, CarOrdinal: 42, CarClass: 3, CarPerformanceIndex: 750,
  EngineMaxRpm: 8000, CurrentEngineRpm: rpm, AccelInput: 255, BrakeInput: 0,
  HandBrakeInput: 0, ClutchInput: 0, Gear: 4, PowerWatts: output, TorqueNewtons: output > 0 ? 500 : output,
  ...overrides,
} as TelemetryData);

function sweep(low = 1800, high = 5200): TuningMeasurementState {
  let state = createTuningMeasurement('42');
  for (let i = 0; i <= 30; i++) {
    const rpm = low + i * ((high - low) / 30);
    state = advanceTuningMeasurement(state, frame(i * 200, rpm), true, i * 200);
  }
  return state;
}

const sampleCount = (state: TuningMeasurementState) => state.bins.reduce((sum, bin) => sum + bin.sampleCount, 0);

describe('low-limit engine cutoff regression (#396)', () => {
  it.each([0, -100])('uses sustained output %s as cutoff evidence without adding engine samples', output => {
    let state = sweep();
    const before = state;
    for (let i = 31; i <= 36; i++) state = advanceTuningMeasurement(state, frame(i * 200, 5200, output), true, i * 200);
    expect(state.cutoffDetected).toBe(true);
    expect(state.effectiveRedline).toBe(5200);
    expect(getTuningMeasurementReadiness(state, 7200).ready).toBe(true);
    expect(state.acceptedMs).toBe(before.acceptedMs);
    expect(sampleCount(state)).toBe(sampleCount(before));
    expect(state.observedPeakPower).toEqual(before.observedPeakPower);
    expect(state.observedPeakTorque).toEqual(before.observedPeakTorque);
    const item = { schema: 'engine-observation/v1', source: 'measured', id: 'cutoff', carId: '42',
      capturedAt: 7200, dependencyKey: 'profile', data: state };
    expect(parseEngineArchive(JSON.stringify([item]))).toHaveLength(1);
  });

  it('rebuckets narrow positive sweeps below 55% of the reported limit without duplicating samples', () => {
    let state = sweep(2500, 3800);
    const before = state;
    expect(before.bins.length).toBeLessThan(6);
    for (let i = 31; i <= 36; i++) state = advanceTuningMeasurement(state, frame(i * 200, 3800, 0), true, i * 200);
    expect(state.effectiveRedline).toBe(3800);
    expect(state.bins.length).toBeGreaterThanOrEqual(6);
    expect(state.bins.length).toBeLessThanOrEqual(16);
    expect(state.rpmEvidenceBins!.length).toBeLessThanOrEqual(64);
    expect(sampleCount(state)).toBe(sampleCount(before));
    expect(state.bins.reduce((sum, bin) => sum + bin.powerWattsSum, 0))
      .toBeCloseTo(before.bins.reduce((sum, bin) => sum + bin.powerWattsSum, 0));
    expect(getTuningMeasurementReadiness(state, 7200).ready).toBe(true);
  });

  it.each([
    { AccelInput: 0 }, { BrakeInput: 1 }, { ClutchInput: 1 }, { IsRaceOn: 0 },
    { PowerWatts: Number.NaN },
  ])('resets pending cutoff evidence after an interrupted frame %j', override => {
    let state = sweep();
    state = advanceTuningMeasurement(state, frame(6200, 5200, 0), true, 6200);
    state = advanceTuningMeasurement(state, frame(6400, 5200, 0, override), true, 6400);
    state = advanceTuningMeasurement(state, frame(6600, 5200, 0), true, 6600);
    state = advanceTuningMeasurement(state, frame(6800, 5200, 0), true, 6800);
    expect(state.cutoffDetected).not.toBe(true);
    expect(getTuningMeasurementReadiness(state, 6800).ready).toBe(false);
  });

  it('does not bridge disconnected telemetry, gear changes, gaps, or repeated timestamps', () => {
    for (const interruption of ['disconnect', 'gear', 'gap', 'duplicate']) {
      let state = sweep();
      state = advanceTuningMeasurement(state, frame(6200, 5200, 0), true, 6200);
      if (interruption === 'disconnect') state = advanceTuningMeasurement(state, null, false, 6300);
      if (interruption === 'gear') state = advanceTuningMeasurement(state, frame(6400, 5200, 0, { Gear: 5 }), true, 6400);
      const time = interruption === 'gap' ? 9000 : interruption === 'duplicate' ? 6200 : 6400;
      state = advanceTuningMeasurement(state, frame(time, 5200, 0), true, time);
      expect(state.cutoffDetected).not.toBe(true);
    }
  });

  it('requires a real positive sweep and clean duration before cutoff can complete collection', () => {
    let state = createTuningMeasurement('42');
    for (let i = 0; i <= 40; i++) state = advanceTuningMeasurement(state, frame(i * 200, 5200, 0), true, i * 200);
    expect(state.cutoffDetected).not.toBe(true);
    expect(state.acceptedMs).toBe(0);
    expect(state.bins).toEqual([]);
    expect(getTuningMeasurementReadiness(state, 8000).ready).toBe(false);
  });

  it('supersedes a tentative low limit when an additional run observes higher RPM', () => {
    let state = sweep();
    for (let i = 31; i <= 33; i++) state = advanceTuningMeasurement(state, frame(i * 200, 5200, 0), true, i * 200);
    expect(state.effectiveRedline).toBe(5200);
    state = advanceTuningMeasurement(state, frame(6800, 5600), true, 6800);
    expect(state.cutoffDetected).toBe(false);
    expect(state.effectiveRedline).toBeUndefined();
  });
});
