import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Standalone browser JS is tested through its runtime contract.
import { FrameInterpolator } from '../../../shared/frame-interpolator.js';
const sandbox: Record<string, any> = {};
for (const file of ['model.js', 'instruments.js']) runInNewContext(readFileSync(resolve(import.meta.dirname, '../../', file), 'utf8'), sandbox);
const M = sandbox.R34Model, I = sandbox.R34Instruments;
const packet = (patch = {}) => ({ TimestampMS: 1000, CarOrdinal: 34, IsRaceOn: 1, CurrentEngineRpm: 6000, EngineMaxRpm: 9000,
  SpeedMetersPerSecond: 50, Gear: 4, Boost: 14.5038, AccelInput: 128, BrakeInput: 0, Fuel: .5,
  PowerWatts: 200000, TorqueNewtons: 400, AccelerationX: 9.80665, AccelerationZ: -4.903325,
  LapNumber: 1, CurrentLap: 30, LastLap: 0, BestLap: 0, CurrentRaceTime: 30, DistanceTraveled: 1234, ...patch });
const accept = (state: any, patch = {}, now = 0) => M.ingest(state, packet(patch), { redlineRpm: 8000 }, now);
describe('BNR34 telemetry truth and units', () => {
  it('starts empty without fake samples, laps, RPM or engine sensor values', () => {
    const state = M.createState(), v = M.snapshot(state, {}, 0);
    expect(v.status).toBe('waiting'); expect(v.boost).toBeNull(); expect(v.rpm).toBeNull(); expect(state.historyCount).toBe(0);
    expect(v.laps).toHaveLength(0); expect(v.coolant).toBeNull(); expect(v.oilPressure).toBeNull();
  });
  it('maps native PSI, m/s, watts, newton-metres and vehicle X/Z, not vertical Y', () => {
    const state = M.createState(); accept(state, { AccelerationY: 900 }); const v = M.snapshot(state, { units: { power: 'kw' } }, 0);
    expect(v.speed).toBe(180); expect(v.boost).toBeCloseTo(1); expect(v.power).toBe(200);
    expect(v.lateralG).toBeCloseTo(-1); expect(v.longitudinalG).toBeCloseTo(-.5); expect(v.throttle).toBeCloseTo(50.1961);
  });
  it('preserves signed boost and zero, with no normalized zero-filled fallback', () => {
    const state = M.createState(); accept(state, { Boost: -7.2519 }); expect(M.snapshot(state, {}, 0).boost).toBeCloseTo(-.5);
    accept(state, { TimestampMS: 1100, Boost: 0 }, 100); expect(M.snapshot(state, {}, 100).boost).toBe(0);
    accept(state, { TimestampMS: 1200, Boost: null, boost_bar: 3 }, 200); expect(M.snapshot(state, {}, 200).boost).toBeNull();
  });
  it.each([undefined, null, '', '2', NaN, Infinity])('rejects malformed readings %s', bad => {
    const state = M.createState(); accept(state, { Boost: bad, CurrentEngineRpm: bad, Fuel: bad }); const v = M.snapshot(state, {}, 0);
    expect(v.boost).toBeNull(); expect(v.rpm).toBeNull(); expect(v.fuel).toBeNull();
  });
  it('honors effective independent units, and keeps numerical overscale readings', () => {
    const state = M.createState(); accept(state, { Boost: 43.5114, SpeedMetersPerSecond: 100 });
    const v = M.snapshot(state, { effectiveUnits: { speed: 'mph', boostPressure: 'kpa', power: 'hp', torque: 'lbft' } }, 0);
    expect(v.speed).toBeCloseTo(223.6936); expect(v.boost).toBeCloseTo(300.000660264, 8); expect(v.boostRatio).toBe(1);
    expect(v.power).toBeCloseTo(268.2044); expect(v.torque).toBeCloseTo(295.0248); expect(v.speedUnit).toBe('mph');
  });
  it('uses the documented nonuniform stock V-spec tach intervals', () => {
    expect(I.tachAngle(3000) - I.tachAngle(2000)).toBe(15);
    expect(I.tachAngle(4000) - I.tachAngle(3000)).toBe(30);
    expect(I.tachAngle(10000)).toBe(I.tachAngle(14000));
  });
  it('keeps stock speed and fuel needles bounded and ordered while numeric readings retain overscale', () => {
    expect(I.speedAngle(0)).toBeLessThan(I.speedAngle(80));
    expect(I.speedAngle(80)).toBeLessThan(I.speedAngle(180));
    expect(I.speedAngle(360)).toBe(I.speedAngle(180));
    expect(I.speedAngle(-10)).toBe(I.speedAngle(0));
    expect(I.fuelAngle(0)).toBeLessThan(I.fuelAngle(50));
    expect(I.fuelAngle(50)).toBeLessThan(I.fuelAngle(100));
    expect(I.fuelAngle(110)).toBe(I.fuelAngle(100));
  });
  it('formats Forza reverse, neutral, missing and valid gear values', () => {
    expect(M.gear(0)).toBe('R'); expect(M.gear(11)).toBe('N'); expect(M.gear(6)).toBe('6'); expect(M.gear(null)).toBe('—');
  });
});
describe('R34 recorder lifetime', () => {
  it('duplicate smoothed frames never revive stale values or add history/peaks', () => {
    const state = M.createState(); accept(state);
    for (let n = 1; n < 200; n++) accept(state, { CurrentEngineRpm: 9500, Boost: 50 }, n * 20);
    expect(state.peakRpm).toBe(6000); expect(state.peakBoostPsi).toBe(14.5038); expect(state.historyCount).toBe(1);
    const v = M.snapshot(state, {}, 2000); expect(v.status).toBe('stale'); expect(v.rpm).toBeNull();
  });
  it('records original sourceTelemetry despite actual interpolator extrapolation', () => {
    const a = packet({ TimestampMS: 10, CurrentEngineRpm: 6000 }), b = packet({ TimestampMS: 20, CurrentEngineRpm: 7000 });
    const interpolator = new FrameInterpolator(); interpolator.pushSample({ ...a, sourceTelemetry: a }, 0); interpolator.pushSample({ ...b, sourceTelemetry: b }, 16);
    const extrapolated = interpolator.interpolate(20); expect(extrapolated.CurrentEngineRpm).toBe(7250);
    const state = M.createState(); M.ingest(state, { ...a, sourceTelemetry: a }, {}, 0); M.ingest(state, extrapolated, {}, 20);
    expect(state.peakRpm).toBe(7000); expect(state.data.CurrentEngineRpm).toBe(7000); expect(b.CurrentEngineRpm).toBe(7000);
  });
  it('paused packets retain history but cannot accumulate peaks or lap records', () => {
    const state = M.createState(); accept(state);
    accept(state, { TimestampMS: 1100, IsRaceOn: 0, CurrentEngineRpm: 9999, LapNumber: 2, LastLap: 45 }, 100);
    expect(M.snapshot(state, {}, 100).status).toBe('paused'); expect(M.snapshot(state, {}, 100).speed).toBeNull();
    expect(state.peakRpm).toBe(6000); expect(state.laps).toHaveLength(0); expect(state.historyCount).toBe(1);
    accept(state, { TimestampMS: 1200, IsRaceOn: 1 }, 200); expect(M.snapshot(state, {}, 200).status).toBe('live');
  });
  it('clears session data on vehicle change and corroborated forward race restart', () => {
    for (const patch of [{ CarOrdinal: 35, TimestampMS: 2000 }, { TimestampMS: 2000, CurrentRaceTime: 0, LapNumber: 0 }]) {
      const state = M.createState(); accept(state); accept(state, { ...patch, CurrentEngineRpm: 900, Boost: 0 }, 200);
      expect(state.session).toBe(1); expect(state.peakRpm).toBe(900); expect(state.historyCount).toBe(1); expect(state.laps).toHaveLength(0);
    }
  });
  it('handles uint32 wrap as progression, and rejects missing timestamps', () => {
    const state = M.createState(); accept(state, { TimestampMS: 4294967280 }); accept(state, { TimestampMS: 32 }, 48);
    expect(state.session).toBe(0); expect(state.elapsed).toBe(48);
    expect(accept(state, { TimestampMS: undefined }, 5000)).toBe(false); expect(M.status(state, 5000)).toBe('unavailable');
  });
  it('keeps a bounded 30-second memory, sampling only unique packets', () => {
    const state = M.createState(); for (let n = 0; n < 5000; n++) accept(state, { TimestampMS: n * 17 }, n * 17);
    expect(state.historyCount).toBeLessThanOrEqual(M.CAPACITY); expect(state.historyHead).toBeLessThan(M.CAPACITY);
  });
  it('observes five actual lap transitions without manufacturing missed laps', () => {
    const state = M.createState(); accept(state, { LastLap: 99 }); expect(state.laps).toHaveLength(0);
    for (let lap = 2; lap <= 8; lap++) accept(state, { TimestampMS: 1000 + lap * 100, LapNumber: lap, LastLap: 80 + lap }, lap * 100);
    expect(state.laps).toHaveLength(5); expect(state.laps[0]).toEqual({ number: 8, seconds: 88 });
    accept(state, { TimestampMS: 2000, LapNumber: 11, LastLap: 95 }, 2000); expect(state.laps[0].number).toBe(8);
    accept(state, { TimestampMS: 2100, LapNumber: 0, CurrentRaceTime: 0 }, 2100); expect(state.laps).toHaveLength(0);
  });
  it('formats timing without rounding into impossible 60-second remainders', () => {
    expect(M.lapTime(59.9998)).toBe("1'00.000"); expect(M.lapTime(0)).toBe("—'——.———"); expect(M.lapTime(NaN)).toBe("—'——.———");
  });
});

describe('R34 defensive source acceptance', () => {
  it('ignores lone reordered samples without erasing or refreshing a session', () => {
    const state = M.createState(); accept(state, { TimestampMS: 10000, CurrentEngineRpm: 8000 });
    accept(state, { TimestampMS: 9900, CurrentEngineRpm: 900 }, 100);
    expect(state.timestamp).toBe(10000); expect(state.receivedAt).toBe(0); expect(state.session).toBe(0); expect(state.peakRpm).toBe(8000);
    accept(state, { TimestampMS: 10100, CurrentEngineRpm: 6500 }, 200); expect(state.peakRpm).toBe(8000);
  });
  it('needs two coherent new-epoch packets after stale before resetting', () => {
    const state = M.createState(); accept(state, { TimestampMS: 10000, CurrentEngineRpm: 8000 });
    accept(state, { TimestampMS: 100, CurrentEngineRpm: 900 }, 2000); expect(state.session).toBe(0);
    accept(state, { TimestampMS: 100, CurrentEngineRpm: 9999 }, 2010); expect(state.session).toBe(0);
    accept(state, { TimestampMS: 150, CurrentEngineRpm: 1100 }, 2050); expect(state.session).toBe(1); expect(state.peakRpm).toBe(1100);
  });
  it('does not treat an isolated old race-reset-looking packet as a real reset', () => {
    const state = M.createState(); accept(state, { TimestampMS: 10000, CurrentRaceTime: 100, LapNumber: 4 });
    accept(state, { TimestampMS: 100, CurrentRaceTime: 0, LapNumber: 0 }, 100); expect(state.session).toBe(0);
    accept(state, { TimestampMS: 10100, CurrentRaceTime: 101, LapNumber: 4 }, 200); expect(state.session).toBe(0);
  });
  it('confirms a fresh backward epoch only with two advancing reset-evidence packets', () => {
    const state = M.createState(); accept(state, { TimestampMS: 10000, CurrentRaceTime: 100, LapNumber: 4 });
    accept(state, { TimestampMS: 100, CurrentRaceTime: 0, LapNumber: 0 }, 100);
    accept(state, { TimestampMS: 150, CurrentRaceTime: .05, LapNumber: 0, CurrentEngineRpm: 1000 }, 150);
    expect(state.session).toBe(1); expect(state.peakRpm).toBe(1000);
  });
  it.each([undefined, null, '1', 2, '', NaN])('never records invalid race-on state %s', race => {
    const state = M.createState(); accept(state, { IsRaceOn: race }); expect(M.snapshot(state, {}, 0).live).toBe(false);
    expect(state.historyCount).toBe(0); expect(state.peakRpm).toBeNull();
  });
  it.each([{ success: false }, { error: 'broken' }, { sourceTelemetry: { ...packet(), success: false } }])('rejects error envelopes and original packets', patch => {
    const state = M.createState(); M.ingest(state, { ...packet(), ...patch }, {}, 0);
    expect(M.snapshot(state, {}, 0).status).toBe('error'); expect(state.historyCount).toBe(0); expect(state.peakRpm).toBeNull();
  });
  it('invalid/error states cannot be revived by replaying the old valid packet', () => {
    const state = M.createState(); accept(state); M.ingest(state, packet(), { success: false }, 100);
    accept(state, {}, 200); expect(M.snapshot(state, {}, 200).status).toBe('error');
    accept(state, { TimestampMS: 1100 }, 300); expect(M.snapshot(state, {}, 300).status).toBe('live');
  });
  it('rejects invalid physical domains without converting them into plausible readings', () => {
    const state = M.createState(); accept(state, { CurrentEngineRpm: -1, Fuel: 1.2, AccelInput: 256, BrakeInput: -1, SpeedMetersPerSecond: -3, DistanceTraveled: -100 });
    const v = M.snapshot(state, {}, 0); for (const key of ['rpm', 'fuel', 'throttle', 'brake', 'speed', 'distance']) expect(v[key]).toBeNull();
    expect(state.peakRpm).toBeNull();
  });
});

describe('R34 restart evidence boundaries', () => {
  it('does not accept an expired or incoherent backward candidate pair', () => {
    for (const second of [{ now: 2700, patch: {} }, { now: 2050, patch: { CarOrdinal: 99 } }, { now: 2050, patch: { CurrentRaceTime: 20 } }]) {
      const state = M.createState(); accept(state, { TimestampMS: 10000, CurrentEngineRpm: 8000 });
      accept(state, { TimestampMS: 100, CurrentEngineRpm: 900 }, 2000);
      accept(state, { TimestampMS: 150, CurrentEngineRpm: 1000, ...second.patch }, second.now);
      expect(state.session).toBe(0); expect(state.peakRpm).toBe(8000);
    }
  });
  it('does not reset on fresh backward progress without separate reset evidence', () => {
    const state = M.createState(); accept(state, { TimestampMS: 10000 });
    accept(state, { TimestampMS: 100 }, 100); accept(state, { TimestampMS: 150 }, 150);
    expect(state.timestamp).toBe(10000); expect(state.session).toBe(0);
  });
  it('does not invent a REV threshold when the source max RPM is missing or invalid', () => {
    const state = M.createState(); accept(state, { EngineMaxRpm: null }); expect(M.snapshot(state, {}, 0).redline).toBeNull();
    M.ingest(state, packet({ TimestampMS: 1100 }), { redlineRpm: -1 }, 100); expect(M.snapshot(state, {}, 100).redline).toBeNull();
  });
});

it('requires a fresh candidate pair after a pause/error interrupted epoch detection', () => {
  const state = M.createState(); accept(state, { TimestampMS: 10000 });
  accept(state, { TimestampMS: 100 }, 2000);
  M.ingest(state, { ...packet(), success: false }, {}, 2010);
  accept(state, { TimestampMS: 150 }, 2050); expect(state.session).toBe(0);
  accept(state, { TimestampMS: 200 }, 2100); expect(state.session).toBe(1);
});

describe('R34 shared direction and official completed-lap semantics', () => {
  it.each([{ x: 9.80665, z: 9.80665, lat: -1, lon: 1 }, { x: -9.80665, z: -9.80665, lat: 1, lon: -1 }])('inverts lateral X while preserving acceleration/brake Z orientation', sample => {
    const state = M.createState(); accept(state, { AccelerationX: sample.x, AccelerationZ: sample.z });
    const v = M.snapshot(state, {}, 0); expect(v.lateralG).toBeCloseTo(sample.lat); expect(v.longitudinalG).toBeCloseTo(sample.lon);
  });
  it('shows current lap one before any completion and labels LastLap with the newly completed lap', () => {
    const state = M.createState(); accept(state, { LapNumber: 0 });
    expect(M.snapshot(state, {}, 0).lap).toBe(1); expect(state.laps).toHaveLength(0);
    accept(state, { TimestampMS: 1100, LapNumber: 1, LastLap: 82.5 }, 100);
    const v = M.snapshot(state, {}, 100); expect(v.completedLaps).toBe(1); expect(v.lap).toBe(2);
    expect(state.laps[0]).toEqual({ number: 1, seconds: 82.5 });
  });
});
