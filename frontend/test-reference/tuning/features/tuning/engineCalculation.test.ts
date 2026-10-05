import { describe, expect, it } from 'vitest';
import fixture from "../../../../../tests/fixtures/aego_beetle_engine_captures.json";
import limiterFixture from "../../../../../tests/fixtures/aego_beetle_limiter_capture.json";
import type { TuningCaptureFile, TuningCaptureSample } from "../../../../src/domain/tuning/telemetryCapture";
import { analyzeEngineCapture, captureToEngineFrame, engineCalculationSummary } from "./engineCalculation";
import { advanceTuningMeasurement, createEngineCalculation, qualifiedEnginePeaks, getTuningMeasurementReadiness, type EngineMeasurementFrame } from "./tuningMeasurement";

const capture = (samples: Partial<TuningCaptureSample>[]) => ({ samples }) as TuningCaptureFile;
const frame = (time: number, rpm = 2000, extra: Partial<EngineMeasurementFrame> = {}): EngineMeasurementFrame => ({
  TimestampMS: time, IsRaceOn: 1, CarOrdinal: 1435, CarClass: 0, CarPerformanceIndex: 400,
  EngineMaxRpm: 6000, CurrentEngineRpm: rpm, SpeedMetersPerSecond: 10, Gear: 2,
  PowerWatts: 40000, TorqueNewtons: 150, AccelInput: 255, BrakeInput: 0,
  ClutchInput: 0, HandBrakeInput: 0, ...extra,
});

describe('versioned loaded-sweep engine analysis', () => {
  it.each(['broad', 'narrow'])('qualifies a complete %s curve using the same live and replay path', shape => {
    let live = createEngineCalculation('1435');
    const samples: Partial<TuningCaptureSample>[] = [];
    for (let i = 0; i <= 600; i++) {
      const rpm = 1800 + i * 6.5, time = i * 20;
      const power = shape === 'broad' ? 55000 - 0.004 * (rpm - 4000) ** 2
        : 1000 + 52000 * Math.exp(-(((rpm - 4700) / 1000) ** 2));
      const f = frame(time, rpm, { PowerWatts: power, TorqueNewtons: power / (rpm * Math.PI / 30) });
      live = advanceTuningMeasurement(live, f, true, time);
      samples.push({ timestampMS: time, isRaceOn: 1, carOrdinal: 1435, performanceIndex: 400,
        carClass: 0, engineMaxRpm: 6000, rpm, speedMps: 10, gear: 2, accelInput: 255,
        brakeInput: 0, clutchInput: 0, handBrakeInput: 0, powerWatts: power, torqueNewtons: f.TorqueNewtons });
    }
    const replay = analyzeEngineCapture('synthetic', '1435', capture(samples));
    expect(replay).toEqual(engineCalculationSummary(live, 'synthetic'));
    expect(replay.status).toBe('ready');
    expect(replay.peakPower!.rpm).toBeGreaterThan(shape === 'broad' ? 3900 : 4600);
    expect(replay.peakPower!.rpm).toBeLessThan(shape === 'broad' ? 4100 : 4800);
    expect(analyzeEngineCapture('synthetic', '1435', capture(samples), {
      ...live, identity: { ordinal: 1435, performanceIndex: 500, carClass: 0 },
    })).toMatchObject({ status: 'unavailable', reason: 'identity-changed' });
    const resetClock = capture([...samples, { ...samples[0], timestampMS: 0 }]);
    expect(analyzeEngineCapture('synthetic', '1435', resetClock)).toMatchObject({ status: 'collecting', reason: 'timestamp-regressed' });
  });
  it.each(fixture.captures)('replays real launch-contaminated capture $observationId without editing it', c => {
    const samples = c.samples.map(row => Object.fromEntries(fixture.fields.map((key, i) => [key, row[i]])));
    const original = JSON.stringify(samples);
    const analyzed = analyzeEngineCapture(c.observationId, c.carId, capture(samples));
    expect(analyzed.peakPower!.rpm).toBeGreaterThan(3900);
    expect(analyzed.peakPower!.rpm).toBeLessThan(4050);
    expect(analyzed.peakPower!.value).toBeLessThan(c.originalPeak.value);
    expect(analyzed.peakTorque!.value).toBeGreaterThan(150);
    expect(analyzed.analysisVersion).toBe('engine-loaded-sweep/v4');
    expect(analyzed.observationId).toBe(c.observationId);
    expect(JSON.stringify(samples)).toBe(original);
    // New filters cannot inherit the old summary's six-second qualification.
    if (c.observationId.startsWith('a97')) {
      expect(analyzed.acceptedMs).toBeLessThan(6000);
      expect(analyzed.status).toBe('collecting');
      expect(analyzed.reason).toBe('duration-insufficient');
    } else {
      // Real cut/recovery cycles prove the ~5250 RPM limit despite the game's 6000 RPM field.
      expect(analyzed.status).toBe('ready');
      expect(analyzed.acceptedMs).toBeGreaterThan(6000);
      expect(analyzed.effectiveRedline).toBeGreaterThan(5200);
      expect(analyzed.effectiveRedline).toBeLessThan(5300);
    }
  });
  it('rejects parked launch, missing speed and unconfirmed controls even when clutch reads zero', () => {
    for (const extra of [{ SpeedMetersPerSecond: 0.2 }, { SpeedMetersPerSecond: undefined }, { ClutchInput: 1 }, { BrakeInput: undefined }]) {
      let state = createEngineCalculation('1435');
      for (let i = 0; i < 60; i++) state = advanceTuningMeasurement(state, frame(i * 200, 2000, extra), true, i * 200);
      expect(state.acceptedMs).toBe(0);
      expect(state.rpmEvidenceBins).toBeUndefined();
    }
  });
  it('excludes all settling time and resets settling on a gap, throttle interruption or gear change', () => {
    for (const interruption of [{ AccelInput: 0 }, { Gear: 3 }, { SpeedMetersPerSecond: 0 }, { TimestampMS: NaN }]) {
      let state = createEngineCalculation('1435');
      for (const t of [0, 200, 400]) state = advanceTuningMeasurement(state, frame(t), true, t);
      expect(state.acceptedMs).toBe(0);
      state = advanceTuningMeasurement(state, frame(450, 2000, interruption), true, 450);
      state = advanceTuningMeasurement(state, frame(550), true, 550);
      expect(state.acceptedMs).toBe(0);
      state = advanceTuningMeasurement(state, frame(2000), true, 2000);
      expect(state.guidance).toBe('sampling-gap');
      expect(state.loadedSinceMs).toBeUndefined();
    }
  });
  it('requires supported adjacent bins rather than a lone power spike; ties select lower RPM', () => {
    const bin = (index: number, sampleCount: number, rpm: number, power: number) => ({
      index, sampleCount, averageRpm: rpm, averagePowerWatts: power, averageTorqueNewtons: 150,
      rpmSum: rpm * sampleCount, powerWattsSum: power * sampleCount, torqueNewtonsSum: 150 * sampleCount,
    });
    expect(qualifiedEnginePeaks([bin(10, 10, 1000, 100000)]).power).toBeUndefined();
    const peaks = qualifiedEnginePeaks([bin(30, 1, 2900, 100000), bin(40, 4, 3800, 53000), bin(41, 4, 3900, 53000)]);
    expect(peaks.power).toEqual({ value: 53000, rpm: 3800 });
  });
  it('uses one 500 ms qualification window after a gear change, excluding its duration', () => {
    let state = createEngineCalculation('1435');
    for (const t of [0, 250, 500, 750]) state = advanceTuningMeasurement(state, frame(t), true, t);
    expect(state.acceptedMs).toBe(250);
    for (const t of [1000, 1250, 1500]) state = advanceTuningMeasurement(state, frame(t, 2000, { Gear: 3 }), true, t);
    expect(state.acceptedMs).toBe(250);
    expect(state.lastAcceptedTimestampMs).toBe(1500);
    state = advanceTuningMeasurement(state, frame(1750, 2100, { Gear: 3 }), true, 1750);
    expect(state.acceptedMs).toBe(500);
  });
  it('live and capture inputs advance the identical reducer, including missing channel evidence', () => {
    const f = frame(0);
    const s = { timestampMS: 0, isRaceOn: 1, carOrdinal: 1435, carClass: 0, performanceIndex: 400,
      engineMaxRpm: 6000, rpm: 2000, speedMps: 10, gear: 2, accelInput: 255,
      brakeInput: 0, clutchInput: 0, handBrakeInput: 0, powerWatts: 40000, torqueNewtons: 150 } as TuningCaptureSample;
    expect(advanceTuningMeasurement(createEngineCalculation('1435'), captureToEngineFrame(s), true, 0))
      .toEqual(advanceTuningMeasurement(createEngineCalculation('1435'), f, true, 0));
    expect(captureToEngineFrame({ ...s, missingChannels: ['SpeedMetersPerSecond'] }).SpeedMetersPerSecond).toBeNaN();
  });
  it('keeps a missing capture or legacy summary unavailable instead of trusting its peak', () => {
    expect(analyzeEngineCapture('old', '1435').status).toBe('unavailable');
    const legacy = { ...createEngineCalculation('1435'), analysisVersion: undefined, observedPeakPower: { rpm: 3365, value: 56000 } };
    expect(engineCalculationSummary(legacy, 'old')).toMatchObject({ status: 'unavailable', reason: 'capture-unavailable' });
    expect(engineCalculationSummary({ ...legacy, analysisVersion: 'engine-loaded-sweep/v2' }, 'v2').status).toBe('unavailable');
    expect(engineCalculationSummary({ ...legacy, analysisVersion: 'engine-loaded-sweep/v3' }, 'v3').status).toBe('unavailable');
  });
});

describe('loaded limiter cut/recovery cycles', () => {
  const run = (change: (f: EngineMeasurementFrame, index: number) => EngineMeasurementFrame = f => f) => {
    let state = createEngineCalculation('1435');
    for (let i = 0; i <= 500; i++) {
      state = advanceTuningMeasurement(state, frame(i * 20, 1800 + i * 6.8, { PowerWatts: 55000 }), true, i * 20);
    }
    const rpms = [5240, 5160, 5100, 5120, 5210, 5240];
    for (let i = 0; i < 120; i++) {
      const cut = i % 6 < 3;
      const f = change(frame(10020 + i * 20, rpms[i % 6], {
        PowerWatts: cut ? -23000 : 55000, TorqueNewtons: cut ? -43 : 130,
      }), i);
      state = advanceTuningMeasurement(state, f, true, f.TimestampMS);
    }
    return state;
  };
  it('recognizes repeated sawtooth cycles without sampling their negative output as peaks', () => {
    const state = run();
    expect(state.cutoffDetected).toBe(true);
    expect(state.effectiveRedline).toBeGreaterThan(5200);
    expect(state.effectiveRedline).toBeLessThan(5300);
    expect(getTuningMeasurementReadiness(state, state.lastProgressedAtMs!).ready).toBe(true);
    expect(state.rpmEvidenceBins!.every(bin => bin.averagePowerWatts === 55000)).toBe(true);
    expect(state.acceptedMs).toBeLessThan(11900); // Cut intervals remain excluded from accepted duration.
  });
  it.each(['positive plateau', 'sustained cut', 'one cycle', 'sign noise', 'wide RPM drop', 'mixed output signs'])(
    'does not mistake %s for repeated limiter cycles', mode => {
      const state = run((f, i) => {
        if (mode === 'positive plateau' || (mode === 'one cycle' && i >= 6))
          return { ...f, CurrentEngineRpm: 5240, PowerWatts: 55000, TorqueNewtons: 130 };
        if (mode === 'sustained cut') return { ...f, PowerWatts: -23000, TorqueNewtons: -43 };
        if (mode === 'sign noise') return { ...f, CurrentEngineRpm: 5240,
          PowerWatts: i % 2 ? 55000 : -23000, TorqueNewtons: i % 2 ? 130 : -43 };
        if (mode === 'wide RPM drop' && i % 6 === 2) return { ...f, CurrentEngineRpm: 4700 };
        if (mode === 'mixed output signs') return { ...f, TorqueNewtons: 130 };
        return f;
      });
      expect(state.cutoffDetected).toBe(false);
      expect(getTuningMeasurementReadiness(state, state.lastProgressedAtMs!).highRpmCoverage).toBe(false);
    });
  it.each(['throttle', 'brake', 'clutch', 'handbrake', 'gear', 'speed', 'gap', 'missing output'])(
    'clears pending cycle evidence on %s interruption', interruption => {
      const state = run((f, i) => {
        const adjusted = interruption === 'gap' ? { ...f, TimestampMS: f.TimestampMS! + Math.floor(i / 12) * 1200 } : f;
        if (i % 12 !== 11) return adjusted;
        return { ...adjusted, ...({ throttle: { AccelInput: 0 }, brake: { BrakeInput: 1 },
          clutch: { ClutchInput: 1 }, handbrake: { HandBrakeInput: 1 }, gear: { Gear: 3 },
          speed: { SpeedMetersPerSecond: 0 }, gap: {}, 'missing output': { PowerWatts: NaN } }[interruption]) };
      });
      expect(state.cutoffDetected).toBe(false);
    });
  it('supersedes a tentative limiter when the loaded sweep continues above it', () => {
    const state = run();
    const time = state.lastTimestampMs! + 20;
    const next = advanceTuningMeasurement(state, frame(time, 5350, { PowerWatts: 55000 }), true, time);
    expect(next.cutoffDetected).toBe(false);
    expect(next.effectiveRedline).toBeUndefined();
  });
  it('replays the first real Beetle limiter encounter, not the later lucky flat dwell', () => {
    const samples = limiterFixture.samples.map(row => Object.fromEntries(limiterFixture.fields.map((key, i) => [key, row[i]])));
    const original = JSON.stringify(samples);
    const result = analyzeEngineCapture(limiterFixture.sourceObservationId, '1435', capture(samples));
    expect(result).toMatchObject({ analysisVersion: 'engine-loaded-sweep/v4', status: 'ready', reason: 'ready' });
    expect(result.acceptedMs).toBeGreaterThanOrEqual(6000);
    expect(result.effectiveRedline).toBeGreaterThan(5200);
    expect(result.effectiveRedline).toBeLessThan(5300);
    expect(result.peakPower!.rpm).toBeGreaterThan(3900);
    expect(result.peakPower!.rpm).toBeLessThan(4050);
    expect(JSON.stringify(samples)).toBe(original);
  });
});
