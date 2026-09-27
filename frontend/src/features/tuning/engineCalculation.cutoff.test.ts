import { describe, expect, it } from 'vitest';
import pajero from '../../../../tests/fixtures/aego_pajero_limiter_capture.json';
import type { TuningCaptureFile, TuningCaptureSample } from '../../domain/tuning/telemetryCapture';
import { analyzeEngineCapture, captureToEngineFrame, engineCalculationSummary } from './engineCalculation';
import { advanceTuningMeasurement, createEngineCalculation, getTuningMeasurementReadiness } from './tuningMeasurement';

const capture = (samples: Partial<TuningCaptureSample>[]) => ({ samples }) as TuningCaptureFile;
const replay = (samples: Partial<TuningCaptureSample>[]) => {
  let state = createEngineCalculation('2652');
  for (const sample of samples) {
    const frame = captureToEngineFrame(sample as TuningCaptureSample);
    state = advanceTuningMeasurement(state, frame, true, frame.TimestampMS!);
  }
  return state;
};

function sweep(shape: 'near' | 'flat' | 'rising', cuts = true) {
  const samples: Partial<TuningCaptureSample>[] = [];
  const add = (time: number, rpm: number, cut = false) => {
    const power = cut ? -170000 : shape === 'near' ? 300000 * (1 - 0.2 * ((rpm - 7800) / 7800) ** 2)
      : shape === 'flat' ? 300000 * Math.min(1, rpm / 6500) : 100000 + rpm * 25;
    samples.push({ timestampMS: time, isRaceOn: 1, carOrdinal: 2652, carClass: 2, performanceIndex: 600,
      engineMaxRpm: 9000, rpm, speedMps: 20, gear: 3, accelInput: 255, brakeInput: 0,
      clutchInput: 0, handBrakeInput: 0, powerWatts: power, torqueNewtons: power / (rpm * Math.PI / 30) });
  };
  for (let i = 0; i <= 600; i++) add(i * 20, 1500 + 6500 * i / 600);
  // At 60-ish Hz the first cut sample has ALREADY fallen below 99% of the 8000 RPM upper envelope.
  const cycle = [7888, 7818, 7780, 7888, 7955, 7999];
  for (let i = 0; i < 60; i++) add(12020 + i * 20, cuts ? cycle[i % 6] : 7999, cuts && i % 6 < 3);
  return samples;
}

describe('limiter transitions independent of the power-peak location', () => {
  it('replays the first Pajero loaded limiter encounter without requesting unattainable high RPM', () => {
    const samples = pajero.samples.map(row => Object.fromEntries(pajero.fields.map((key, i) => [key, row[i]])));
    const original = JSON.stringify(samples);
    const live = replay(samples);
    const result = analyzeEngineCapture(pajero.sourceCaptureId, pajero.carId, capture(samples));
    expect(result).toEqual(engineCalculationSummary(live, pajero.sourceCaptureId));
    expect(result.status).toBe('ready');
    expect(result.acceptedMs).toBeGreaterThanOrEqual(6000);
    expect(result.effectiveRedline).toBeGreaterThan(7900);
    expect(result.effectiveRedline).toBeLessThan(8100);
    expect(result.peakPower!.rpm).toBeGreaterThan(6400);
    expect(result.peakPower!.rpm).toBeLessThan(6700);
    expect(live.cutoffDetected).toBe(true);
    expect(live.powerDropoffDetected).toBe(false);
    expect(JSON.stringify(samples)).toBe(original);
  });

  it.each(['near', 'flat', 'rising'] as const)('accepts repeated cutoff with a %s power-band end but no power roll-off', shape => {
    const samples = sweep(shape), state = replay(samples);
    const result = analyzeEngineCapture('band-at-cutoff', '2652', capture(samples));
    expect(result).toEqual(engineCalculationSummary(state, 'band-at-cutoff'));
    expect(result.status).toBe('ready');
    expect(state.cutoffDetected).toBe(true);
    expect(state.powerDropoffDetected).toBe(false);
    expect(result.effectiveRedline).toBe(8000);
    expect(result.peakPower!.rpm).toBeLessThanOrEqual(state.highestRpm!);
    expect(state.powerbandEndRpm).toBe(result.effectiveRedline);
    if (shape !== 'flat') expect(result.peakPower!.rpm * 1.05).toBeGreaterThan(result.effectiveRedline!);
    // The negative cut output is evidence only, never a peak-bin sample or accepted interval.
    expect(state.rpmEvidenceBins!.every(bin => bin.averagePowerWatts > 0)).toBe(true);
    expect(state.acceptedMs).toBeLessThan(replay(sweep(shape, false)).acceptedMs);
  });

  it.each(['near', 'flat', 'rising'] as const)('does not certify the %s curve merely because it looks complete', shape => {
    const state = replay(sweep(shape, false));
    expect(getTuningMeasurementReadiness(state, state.lastProgressedAtMs!)).toMatchObject({
      ready: false, highRpmCoverage: false, guidance: 'rpm-coverage-high',
    });
    expect(state.cutoffDetected).toBe(false);
  });

  it('requires a fresh positive upper-envelope approach, not a historical maximum alone', () => {
    const samples = sweep('flat');
    // Recovery reaches the top, then positive output has already fallen away
    // before the next apparent cut. The old maximum cannot certify this transition.
    const cycle = [7935, 7850, 7780, 7955, 7999, 7800];
    for (let i = 601; i < samples.length; i++) {
      const sample = samples[i];
      sample.rpm = cycle[(i - 601) % cycle.length];
      sample.torqueNewtons = sample.powerWatts! / (sample.rpm * Math.PI / 30);
    }
    const state = replay(samples);
    expect(state.cutoffDetected).toBe(false);
    expect(getTuningMeasurementReadiness(state, state.lastProgressedAtMs!).ready).toBe(false);
  });
});
