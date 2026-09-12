import { describe, expect, it } from 'vitest';
import type { TelemetryData } from '../../hooks/useTelemetry';
import {
  advanceTuningMeasurement,
  createTuningMeasurement,
  getTuningMeasurementReadiness,
  retainReadyMeasurementSnapshot,
  TUNING_MEASUREMENT_MIN_ACCEPTED_MS,
} from './tuningMeasurement';

const frame = (timestamp: number, rpm: number, overrides: Partial<TelemetryData> = {}): TelemetryData => ({
  IsRaceOn: 1,
  TimestampMS: timestamp,
  CarOrdinal: 42,
  CarClass: 3,
  CarPerformanceIndex: 750,
  EngineMaxRpm: 8_000,
  EngineIdleRpm: 800,
  CurrentEngineRpm: rpm,
  AccelerationX: 0,
  AccelerationY: 0,
  AccelerationZ: 0,
  VelocityX: 0,
  VelocityY: 0,
  VelocityZ: 0,
  Yaw: 0,
  NormalizedSuspensionTravel: [0, 0, 0, 0],
  TireSlipRatio: [0.02, -0.02, 0.02, -0.02],
  TireSlipAngle: [0, 0, 0, 0],
  AccelInput: 255,
  BrakeInput: 0,
  HandBrakeInput: 0,
  ClutchInput: 0,
  Gear: 4,
  PowerWatts: rpm * 40,
  TorqueNewtons: 500,
  ...overrides,
});

function collectSweep() {
  let state = createTuningMeasurement('42');
  for (let index = 0; index <= 30; index++) {
    state = advanceTuningMeasurement(state, frame(index * 200, 3_000 + index * 140), true, index * 200);
  }
  return state;
}

describe('gear-change measurement quality', () => {
  it('tracks lift-off and neutral shifts before accepting engine output again', () => {
    let state = advanceTuningMeasurement(createTuningMeasurement('42'), frame(0, 3000), true, 0);
    state = advanceTuningMeasurement(state, frame(200, 3200, { Gear: 11, AccelInput: 0 }), true, 200);
    state = advanceTuningMeasurement(state, frame(400, 3400, { Gear: 5, AccelInput: 0 }), true, 400);
    expect(state.guidance).toBe('gear-changing');
    state = advanceTuningMeasurement(state, frame(600, 3500, { Gear: 5, PowerWatts: 999999 }), true, 600);
    expect(state.observedPeakPower!.value).toBeLessThan(999999);
    expect(state.acceptedMs).toBe(0);
  });
  it('excludes shift transients and resumes duration only after the settle window', () => {
    let state = createTuningMeasurement('42');
    state = advanceTuningMeasurement(state, frame(0, 3000), true, 0);
    state = advanceTuningMeasurement(state, frame(200, 3200), true, 200);
    const before = state;
    state = advanceTuningMeasurement(state, frame(400, 4000, { Gear: 5, PowerWatts: 999999 }), true, 400);
    expect(state.guidance).toBe('gear-changing');
    state = advanceTuningMeasurement(state, frame(600, 4100, { Gear: 5, PowerWatts: 999999 }), true, 600);
    expect(state.bins).toEqual(before.bins);
    expect(state.observedPeakPower).toEqual(before.observedPeakPower);
    expect(state.acceptedMs).toBe(before.acceptedMs);
    state = advanceTuningMeasurement(state, frame(1000, 4200, { Gear: 5 }), true, 1000);
    expect(state.acceptedMs).toBe(before.acceptedMs);
    state = advanceTuningMeasurement(state, frame(1200, 4400, { Gear: 5 }), true, 1200);
    expect(state.acceptedMs).toBe(before.acceptedMs + 200);
    expect(state.observedPeakPower!.value).toBeLessThan(999999);
  });
});

describe('tuning measurement state machine', () => {
  it('retains a completed observation after menu/disconnection and incorporates extra valid output', () => {
    const ready = collectSweep();
    expect(getTuningMeasurementReadiness(ready, 6000).ready).toBe(true);
    const snapshot = retainReadyMeasurementSnapshot(undefined, ready, 6000);
    const extra = advanceTuningMeasurement(ready, frame(6200, 7400), true, 6200);
    const extended = retainReadyMeasurementSnapshot(snapshot, extra, 6200);
    expect(extended!.acceptedMs).toBeGreaterThan(ready.acceptedMs);
    expect(extended!.observedPeakPower!.value).toBeGreaterThan(ready.observedPeakPower!.value);
    expect(ready.acceptedMs).toBe(6000);
    const disconnected = advanceTuningMeasurement(extra, null, false, 10000);
    expect(getTuningMeasurementReadiness(disconnected, 10000).ready).toBe(false);
    expect(retainReadyMeasurementSnapshot(extended, disconnected, 10000)).toBe(extended);
    expect(retainReadyMeasurementSnapshot(undefined, disconnected, 10000)).toBeUndefined();
  });

  it('invalidates a retained result on build changes, timestamp reset or a new selected car', () => {
    const ready = collectSweep();
    for (const changed of [
      advanceTuningMeasurement(ready, frame(6200, 7400, { CarPerformanceIndex: 700 }), true, 6200),
      advanceTuningMeasurement(ready, frame(100, 3000), true, 6200),
      createTuningMeasurement('43'),
    ]) {
      expect(retainReadyMeasurementSnapshot(ready, changed, 6200)).toBeUndefined();
    }
  });
  it('requires a new collection after a same-car upgrade changes PI, even if the old sweep was ready', () => {
    const ready = collectSweep();
    const changed = advanceTuningMeasurement(ready, frame(6200, 4000, { CarPerformanceIndex: 700 }), true, 6200);
    expect(getTuningMeasurementReadiness(changed, 6200)).toMatchObject({ ready: false, status: 'blocked', guidance: 'identity-changed' });
    expect(changed.bins).toEqual(ready.bins);
    // Returning to old PI must not silently unlock a mixed-configuration run.
    const returned = advanceTuningMeasurement(changed, frame(6400, 4200), true, 6400);
    expect(returned.guidance).toBe('identity-changed');
    const fresh = advanceTuningMeasurement(createTuningMeasurement('42'), frame(6600, 3000, { CarPerformanceIndex: 700 }), true, 6600);
    expect(fresh.identity?.performanceIndex).toBe(700);
    expect(fresh.acceptedMs).toBe(0);
    expect(getTuningMeasurementReadiness(fresh, 6600).ready).toBe(false);
  });
  it('reports the game engine limit before a full-throttle sample is accepted', () => {
    const state = advanceTuningMeasurement(createTuningMeasurement('42'),
      frame(0, 3000, { AccelInput: 0 }), true, 0);
    expect(state.engineMaxRpm).toBe(8000);
    expect(state.bins).toEqual([]);
    expect(state.guidance).toBe('input-not-wide-open');
    expect(advanceTuningMeasurement(state, frame(200, 3000, { EngineMaxRpm: 8200 }), true, 200)
      .guidance).toBe('identity-changed');
  });
  it('only becomes ready after contiguous WOT coverage, duration, and bins', () => {
    const state = collectSweep();
    const readiness = getTuningMeasurementReadiness(state, 6_000);
    expect(state.acceptedMs).toBe(TUNING_MEASUREMENT_MIN_ACCEPTED_MS);
    expect(readiness).toMatchObject({ ready: true, status: 'ready', guidance: 'ready', lowRpmCoverage: true, highRpmCoverage: true });
    expect(state.bins.length).toBeGreaterThanOrEqual(8);
    expect(state.observedPeakPower).toEqual({ value: 288_000, rpm: 7_200 });
  });

  it('does not count interrupted or stalled time toward readiness', () => {
    let state = createTuningMeasurement('42');
    state = advanceTuningMeasurement(state, frame(0, 3_000), true, 0);
    state = advanceTuningMeasurement(state, frame(200, 3_200), true, 200);
    state = advanceTuningMeasurement(state, frame(400, 3_400, { BrakeInput: 1 }), true, 400);
    state = advanceTuningMeasurement(state, frame(600, 3_600), true, 600);
    expect(state.acceptedMs).toBe(200);
    expect(state.guidance).toBe('duration-insufficient');
    expect(getTuningMeasurementReadiness(state, 2_601).guidance).toBe('timestamp-stalled');
  });

  it('rejects wrong cars and non-race frames but retains slip as engine-output context', () => {
    const initial = createTuningMeasurement('42');
    const mismatch = advanceTuningMeasurement(initial, frame(0, 3_000, { CarOrdinal: 99 }), true, 0);
    expect(mismatch.guidance).toBe('car-mismatch');
    const notRace = advanceTuningMeasurement(initial, frame(0, 3_000, { IsRaceOn: 0 }), true, 0);
    expect(notRace.guidance).toBe('not-in-race');
    const slipped = advanceTuningMeasurement(initial, frame(0, 3_000, { TireSlipRatio: [0, 0, 0.9, 0] }), true, 0);
    expect(slipped.guidance).toBe('duration-insufficient');
    expect(slipped.bins).toHaveLength(1);
    expect(slipped.maxObservedNormalizedSlip).toBe(0.9);
    expect(slipped.acceptedMs).toBe(0);
  });

  it('blocks a changed class or PI after identity is established', () => {
    let state = advanceTuningMeasurement(createTuningMeasurement('42'), frame(0, 3_000), true, 0);
    state = advanceTuningMeasurement(state, frame(200, 3_200, { CarPerformanceIndex: 751 }), true, 200);
    expect(state).toMatchObject({ status: 'blocked', guidance: 'identity-changed', acceptedMs: 0 });
  });

  it('does not accept a timestamp regression', () => {
    let state = advanceTuningMeasurement(createTuningMeasurement('42'), frame(500, 3_000), true, 500);
    state = advanceTuningMeasurement(state, frame(400, 3_200), true, 600);
    expect(getTuningMeasurementReadiness(state, 600)).toMatchObject({ status: 'blocked', guidance: 'timestamp-regressed', ready: false });
  });

  it('keeps malformed engine RPM observations out of the summary', () => {
    const state = advanceTuningMeasurement(createTuningMeasurement('42'), frame(0, 8_100), true, 0);
    expect(state).toMatchObject({ guidance: 'engine-rpm-invalid', acceptedMs: 0, bins: [] });
  });

  it('fails closed after a ready collection loses connection or current-car identity', () => {
    const ready = collectSweep();
    const disconnected = advanceTuningMeasurement(ready, null, false, 6_100);
    expect(getTuningMeasurementReadiness(disconnected, 6_100)).toMatchObject({ ready: false, guidance: 'telemetry-disconnected' });

    const wrongCar = advanceTuningMeasurement(ready, frame(6_200, 7_200, { CarOrdinal: 43 }), true, 6_200);
    expect(getTuningMeasurementReadiness(wrongCar, 6_200)).toMatchObject({ ready: false, guidance: 'car-mismatch' });
  });

  it('keeps a completed, fresh same-car summary ready after the driver lifts off', () => {
    const ready = collectSweep();
    const lifted = advanceTuningMeasurement(ready, frame(6_200, 7_100, { AccelInput: 0 }), true, 6_200);
    expect(lifted.guidance).toBe('input-not-wide-open');
    expect(getTuningMeasurementReadiness(lifted, 6_200)).toMatchObject({ ready: true, guidance: 'ready' });
  });

  it('blocks a changed engine redline and strictly rejects malformed controls and zero output', () => {
    const started = advanceTuningMeasurement(createTuningMeasurement('42'), frame(0, 3_000), true, 0);
    const changedRedline = advanceTuningMeasurement(started, frame(200, 3_200, { EngineMaxRpm: 8_200 }), true, 200);
    expect(changedRedline).toMatchObject({ status: 'blocked', guidance: 'identity-changed' });

    const cases: Array<[Partial<TelemetryData>, string]> = [
      [{ AccelInput: Number.NaN }, 'input-not-wide-open'],
      [{ BrakeInput: undefined }, 'control-input-active'],
      [{ HandBrakeInput: Number.NaN }, 'control-input-active'],
      [{ ClutchInput: undefined }, 'control-input-active'],
      [{ Gear: 1.5 }, 'gear-not-forward'],
      [{ Gear: 11 }, 'gear-not-forward'],
      [{ PowerWatts: 0 }, 'output-unavailable'],
      [{ TorqueNewtons: 0 }, 'output-unavailable'],
    ];
    for (const [override, guidance] of cases) {
      expect(advanceTuningMeasurement(createTuningMeasurement('42'), frame(0, 3_000, override), true, 0).guidance).toBe(guidance);
    }
  });

  it('keeps a prior accepted timestamp across a duplicate snapshot', () => {
    let state = advanceTuningMeasurement(createTuningMeasurement('42'), frame(0, 3_000), true, 0);
    state = advanceTuningMeasurement(state, frame(200, 3_100), true, 200);
    state = advanceTuningMeasurement(state, frame(200, 3_100), true, 250);
    state = advanceTuningMeasurement(state, frame(400, 3_200), true, 400);
    expect(state.acceptedMs).toBe(400);
  });
});
