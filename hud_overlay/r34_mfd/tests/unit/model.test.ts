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
    expect(v.tachLcdMode).toBe('unavailable'); expect(v.timerSeconds).toBeNull(); expect(v.speedKmh).toBeNull();
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
    expect(v.speed).toBeCloseTo(223.694); expect(v.speedKmh).toBe(360); expect(v.boost).toBeCloseTo(300.000660264, 8); expect(v.boostRatio).toBe(1);
    expect(v.power).toBeCloseTo(268.2044); expect(v.torque).toBeCloseTo(295.0248); expect(v.speedUnit).toBe('mph');
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


describe('strict four-wheel tire temperature', () => {
  it.each([
    [[32, 32, 32, 32], 0, 32],
    [[0, 0, 0, 0], -160 / 9, 0],
    [[-40, -40, -40, -40], -40, -40],
    [[32, 68, 104, 140], 30, 86],
  ])('averages all four raw Fahrenheit inputs before conversion', (raw, c, f) => {
    expect(M.meanTireTemperatureC(raw)).toBeCloseTo(c);
    const state = M.createState(); accept(state, { TireTemp: raw });
    const metric = M.snapshot(state, { effectiveUnits: { temperature: 'C' } }, 0);
    const imperial = M.snapshot(state, { effectiveUnits: { temperature: 'F' } }, 0);
    expect(metric.tireTemperatureC).toBeCloseTo(c); expect(metric.tireTemperature).toBeCloseTo(c);
    expect(imperial.tireTemperature).toBeCloseTo(f); expect(imperial.tireTemperatureUnit).toBe('°F');
    expect(imperial.tireTemperatureRatio).toBe(metric.tireTemperatureRatio);
  });
  it.each([undefined, null, [], [32, 32, 32], [32, 32, 32, 32, 32], [32, null, 32, 32],
    [32, '32', 32, 32], [32, NaN, 32, 32], [32, Infinity, 32, 32], [32, undefined, 32, 32]])('never substitutes a partial or zero-filled average', raw => {
    expect(M.meanTireTemperatureC(raw)).toBeNull();
    const state = M.createState(); accept(state, { TireTemp: raw });
    expect(M.snapshot(state, {}, 0).tireTemperature).toBeNull();
  });
  it('uses sourceTelemetry rather than interpolated or zero-filled outer tire values', () => {
    const state = M.createState(), source = packet({ TireTemp: [32, 68, 104, 140] });
    M.ingest(state, { ...source, TireTemp: [500, 500, 500, 500], sourceTelemetry: source }, {}, 0);
    expect(M.snapshot(state, {}, 0).tireTemperatureC).toBeCloseTo(30);
    const missing = packet({ TimestampMS: 1100 });
    M.ingest(state, { ...missing, TireTemp: [0, 0, 0, 0], sourceTelemetry: missing }, {}, 100);
    expect(M.snapshot(state, {}, 100).tireTemperatureC).toBeNull();
  });
  it('clears live temperature on stale, pause and session change without manufacturing a value', () => {
    const state = M.createState(); accept(state, { TireTemp: [212, 212, 212, 212] });
    expect(M.snapshot(state, {}, 0).tireTemperature).toBeCloseTo(100);
    expect(M.snapshot(state, {}, 1600).tireTemperature).toBeNull();
    accept(state, { TimestampMS: 1100, IsRaceOn: 0 }, 1601);
    expect(M.snapshot(state, {}, 1601).tireTemperature).toBeNull();
    accept(state, { TimestampMS: 1200, CarOrdinal: 99 }, 1700);
    expect(M.snapshot(state, {}, 1700).tireTemperature).toBeNull();
  });
  it('keeps negative and high numeric temperatures while bounding only geometry', () => {
    const state = M.createState(); accept(state, { TireTemp: [392, 392, 392, 392] });
    const high = M.snapshot(state, {}, 0); expect(high.tireTemperature).toBe(200); expect(high.tireTemperatureRatio).toBe(1);
    accept(state, { TimestampMS: 1100, TireTemp: [-40, -40, -40, -40] }, 100);
    const cold = M.snapshot(state, {}, 100); expect(cold.tireTemperature).toBe(-40); expect(cold.tireTemperatureRatio).toBe(0);
    expect(M.units({ units: { temperature: 'bad' } }, {}).temperature).toBe('C');
  });
});


it('changes digital speed units while preserving raw kmh for the fixed 300 kmh analog face', () => {
  const state = M.createState(); accept(state, { SpeedMetersPerSecond: 90, DistanceTraveled: 12340 });
  const metric = M.snapshot(state, { effectiveUnits: { speed: 'kmh', temperature: 'C' } }, 0);
  const imperial = M.snapshot(state, { effectiveUnits: { speed: 'mph', temperature: 'F' } }, 0);
  expect(metric.speed).toBe(324); expect(metric.speedUnit).toBe('kmh'); expect(imperial.speed).toBeCloseTo(201.3246);
  expect(metric.speedKmh).toBe(324); expect(imperial.speedKmh).toBe(metric.speedKmh);
  expect(I.speedAngle(imperial.speedKmh)).toBe(I.speedAngle(metric.speedKmh));
  expect(I.speedAngle(imperial.speedKmh)).toBe(I.speedAngle(300));
  expect(imperial.speedUnit).toBe('mph'); expect(imperial.distance).toBe(metric.distance);
  expect(imperial.distance).toBeCloseTo(12.34);
  accept(state, { TimestampMS: 1100, SpeedMetersPerSecond: undefined }, 100);
  const missing = M.snapshot(state, { unit: 'mph' }, 100);
  expect(missing.speed).toBeNull(); expect(missing.speedKmh).toBeNull(); expect(missing.speedUnit).toBe('mph');
});

describe('R34 dual-LCD current-lap availability', () => {
  it('selects a positive current-lap timer independently of missing lap counters', () => {
    const state = M.createState(); accept(state, { CurrentLap: 59.9998, LapNumber: undefined });
    const v = M.snapshot(state, {}, 0);
    expect(v.tachLcdMode).toBe('timer'); expect(v.timerSeconds).toBe(59.9998); expect(v.currentLap).toBe(v.timerSeconds);
    expect(M.timerTime(v.timerSeconds)).toBe("1'00.000");
    expect(M.timerTime(0)).toBe("0'00.000"); expect(M.lapTime(0)).toBe("—'——.———");
  });
  it.each([undefined, null, 0, -1, '', '30', NaN, Infinity])('falls back to fresh power for absent/default/invalid current lap %s', value => {
    const state = M.createState(); accept(state, { CurrentLap: value, LastLap: 80, BestLap: 75, current_lap: 45, lap_time: 45 });
    const v = M.snapshot(state, {}, 0);
    expect(v.tachLcdMode).toBe('power'); expect(v.timerSeconds).toBeNull(); expect(v.currentLap).toBeNull();
    expect(v.power).toBeCloseTo(200000 / 745.7); expect(v.torque).toBe(400);
    expect(M.timerTime(v.timerSeconds)).toBe("—'——.———");
  });
  it('accepts an observed rollover zero, retains fresh same-lap zeros, and preserves completed-lap history', () => {
    const state = M.createState(); accept(state, { LapNumber: 0, CurrentLap: 82.5 });
    accept(state, { TimestampMS: 1100, LapNumber: 1, CurrentLap: 0, LastLap: 82.5 }, 100);
    const start = M.snapshot(state, {}, 100);
    expect(start.tachLcdMode).toBe('timer'); expect(start.timerSeconds).toBe(0); expect(start.currentLap).toBe(0);
    expect(start.lap).toBe(2); expect(start.laps[0]).toEqual({ number: 1, seconds: 82.5 });
    accept(state, { TimestampMS: 1200, LapNumber: 1, CurrentLap: 0 }, 200);
    expect(M.snapshot(state, {}, 200).timerSeconds).toBe(0); expect(state.laps).toHaveLength(1);
    accept(state, { TimestampMS: 1300, LapNumber: 1, CurrentLap: .2 }, 300);
    expect(M.snapshot(state, {}, 300).timerSeconds).toBe(.2);
  });
  it.each([0, 1, 3, undefined, null, -1, 1.5])('does not invent a rollover at unchanged, backward, skipped or invalid lap %s', lap => {
    const state = M.createState(); accept(state, { LapNumber: 1, CurrentLap: 50 });
    accept(state, { TimestampMS: 1100, LapNumber: lap, CurrentLap: 0 }, 100);
    expect(M.snapshot(state, {}, 100).tachLcdMode).toBe('power');
  });
  it('does not let initial zero or a missing prior lap counter seed rollover evidence', () => {
    for (const initial of [{ CurrentLap: 0 }, { CurrentLap: 50, LapNumber: undefined }]) {
      const state = M.createState(); accept(state, initial);
      accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: 0 }, 100);
      expect(M.snapshot(state, {}, 100).timerSeconds).toBeNull();
    }
  });
  it.each([undefined, null, -1, NaN, Infinity, '20'])('breaks positive and zero continuity when an accepted timer becomes %s', missing => {
    for (const fromZero of [false, true]) {
      const state = M.createState(); accept(state);
      if (fromZero) accept(state, { TimestampMS: 1050, LapNumber: 2, CurrentLap: 0 }, 50);
      accept(state, { TimestampMS: 1100, LapNumber: fromZero ? 2 : 1, CurrentLap: missing }, 100);
      accept(state, { TimestampMS: 1200, LapNumber: 2, CurrentLap: 0 }, 200);
      expect(M.snapshot(state, {}, 200).tachLcdMode).toBe('power');
    }
  });
  it('requires the same valid lap counter throughout a zero sequence', () => {
    const state = M.createState(); accept(state);
    accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: 0 }, 100);
    accept(state, { TimestampMS: 1200, LapNumber: undefined, CurrentLap: 0 }, 200);
    accept(state, { TimestampMS: 1300, LapNumber: 2, CurrentLap: 0 }, 300);
    expect(M.snapshot(state, {}, 300).timerSeconds).toBeNull();
  });
  it('keeps a genuine rollover continuous across the uint32 source timestamp wrap', () => {
    const state = M.createState(); accept(state, { TimestampMS: 4294967280 });
    accept(state, { TimestampMS: 32, LapNumber: 2, CurrentLap: 0 }, 48);
    expect(state.session).toBe(0); expect(M.snapshot(state, {}, 48).timerSeconds).toBe(0);
  });
  it('expires zero at a fixed three-second deadline despite fresh same-lap packets, then recovers on positive timing', () => {
    const state = M.createState(); accept(state);
    accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: 0 }, 100);
    expect(M.TIMER_ZERO_GRACE_MS).toBe(3000);
    for (const now of [1100, 2100, 3000]) {
      accept(state, { TimestampMS: 1000 + now, LapNumber: 2, CurrentLap: 0 }, now);
      expect(M.snapshot(state, {}, now).timerSeconds).toBe(0);
    }
    expect(M.snapshot(state, {}, 3099).tachLcdMode).toBe('timer');
    const expired = M.snapshot(state, {}, 3100);
    expect(expired.live).toBe(true); expect(expired.timerSeconds).toBeNull(); expect(expired.tachLcdMode).toBe('power');
    accept(state, { TimestampMS: 4100, LapNumber: 2, CurrentLap: 0 }, 3100);
    expect(M.snapshot(state, {}, 3100).tachLcdMode).toBe('power');
    accept(state, { TimestampMS: 4200, LapNumber: 2, CurrentLap: 3.2 }, 3200);
    expect(M.snapshot(state, {}, 3200).timerSeconds).toBe(3.2);
  });
  it.each([
    { now: 1499, timestamp: 1100, valid: true },
    { now: 1500, timestamp: 1100, valid: false },
    { now: 100, timestamp: 2499, valid: true },
    { now: 100, timestamp: 2500, valid: false },
  ])('bounds receive/source continuity at the stale threshold: %o', gap => {
    const state = M.createState(); accept(state);
    accept(state, { TimestampMS: gap.timestamp, LapNumber: 2, CurrentLap: 0 }, gap.now);
    expect(M.snapshot(state, {}, gap.now).timerSeconds).toBe(gap.valid ? 0 : null);
  });
  it('stale snapshots and duplicate smoothing cannot revive a zero timer or power values', () => {
    const state = M.createState(); accept(state);
    accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: 0 }, 100);
    expect(accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: .8 }, 1599)).toBe(false);
    const stale = M.snapshot(state, {}, 1600);
    expect(stale.status).toBe('stale'); expect(stale.tachLcdMode).toBe('unavailable'); expect(stale.timerSeconds).toBeNull();
    expect(stale.power).toBeNull(); expect(stale.torque).toBeNull();
    expect(accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: 2 }, 1650)).toBe(false);
    expect(M.snapshot(state, {}, 1650).tachLcdMode).toBe('unavailable');
    accept(state, { TimestampMS: 1200, LapNumber: 2, CurrentLap: 0 }, 1700);
    expect(M.snapshot(state, {}, 1700).tachLcdMode).toBe('power');
  });
  it.each([
    { patch: { IsRaceOn: 0 }, expected: 'paused' },
    { patch: { success: false }, expected: 'error' },
    { patch: { TimestampMS: undefined }, expected: 'unavailable' },
  ])('breaks zero continuity across $expected and requires fresh positive recovery', ({ patch, expected }) => {
    const state = M.createState(); accept(state);
    accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: 0 }, 100);
    accept(state, { TimestampMS: 1200, ...patch }, 200);
    const blocked = M.snapshot(state, {}, 200);
    expect(blocked.status).toBe(expected); expect(blocked.tachLcdMode).toBe('unavailable'); expect(blocked.timerSeconds).toBeNull();
    expect(blocked.power).toBeNull(); expect(blocked.torque).toBeNull();
    accept(state, { TimestampMS: 1300, LapNumber: 2, CurrentLap: 0 }, 300);
    expect(M.snapshot(state, {}, 300).tachLcdMode).toBe('power');
    accept(state, { TimestampMS: 1400, LapNumber: 2, CurrentLap: .4 }, 400);
    expect(M.snapshot(state, {}, 400).timerSeconds).toBe(.4);
  });
  it('ignores duplicate and reordered timer payloads without erasing accepted evidence or extending grace', () => {
    const state = M.createState(); accept(state);
    expect(accept(state, { CurrentLap: undefined }, 20)).toBe(false);
    expect(accept(state, { TimestampMS: 900, CurrentLap: undefined }, 40)).toBe(false);
    accept(state, { TimestampMS: 1100, LapNumber: 2, CurrentLap: 0 }, 100);
    expect(M.snapshot(state, {}, 100).timerSeconds).toBe(0);
    expect(accept(state, { TimestampMS: 1100, CurrentLap: 99, LapNumber: 1 }, 200)).toBe(false);
    expect(accept(state, { TimestampMS: 1000, CurrentLap: undefined }, 300)).toBe(false);
    for (const now of [1100, 2100, 3000]) accept(state, { TimestampMS: 1000 + now, LapNumber: 2, CurrentLap: 0 }, now);
    expect(accept(state, { TimestampMS: 4000, LapNumber: 3, CurrentLap: 0 }, 3050)).toBe(false);
    expect(M.snapshot(state, {}, 3099).timerSeconds).toBe(0);
    expect(M.snapshot(state, {}, 3100).timerSeconds).toBeNull();
  });
  it.each([
    { CarOrdinal: 99, LapNumber: 2 },
    { CurrentRaceTime: 0, LapNumber: 0 },
  ])('clears zero evidence on a confirmed forward car/session reset: %o', reset => {
    const state = M.createState(); accept(state);
    accept(state, { TimestampMS: 1100, CurrentLap: 0, ...reset }, 100);
    expect(state.session).toBe(1); expect(M.snapshot(state, {}, 100).tachLcdMode).toBe('power');
  });
  it('requires confirmed backward epoch recovery and never carries old timer evidence into it', () => {
    const state = M.createState(); accept(state, { TimestampMS: 10000, LapNumber: 4, CurrentRaceTime: 100 });
    accept(state, { TimestampMS: 100, LapNumber: 0, CurrentRaceTime: 0, CurrentLap: 0 }, 100);
    expect(M.snapshot(state, {}, 100).timerSeconds).toBe(30); expect(state.session).toBe(0);
    accept(state, { TimestampMS: 150, LapNumber: 0, CurrentRaceTime: .05, CurrentLap: 0 }, 150);
    expect(state.session).toBe(1); expect(M.snapshot(state, {}, 150).tachLcdMode).toBe('power');
    accept(state, { TimestampMS: 200, LapNumber: 0, CurrentRaceTime: .1, CurrentLap: .1 }, 200);
    expect(M.snapshot(state, {}, 200).timerSeconds).toBe(.1);
  });
  it('uses raw sourceTelemetry for timing and power even when an outer smoothed frame has plausible aliases', () => {
    const state = M.createState();
    const source = packet({ CurrentLap: undefined, PowerWatts: undefined, TorqueNewtons: undefined });
    M.ingest(state, { ...source, CurrentLap: 20, PowerWatts: 500000, TorqueNewtons: 700, power: 500, torque: 700, sourceTelemetry: source }, {}, 0);
    const v = M.snapshot(state, {}, 0);
    expect(v.tachLcdMode).toBe('power'); expect(v.timerSeconds).toBeNull(); expect(v.power).toBeNull(); expect(v.torque).toBeNull();
    const positive = packet({ TimestampMS: 1100, CurrentLap: .25 });
    M.ingest(state, { ...positive, CurrentLap: 99, sourceTelemetry: positive }, {}, 100);
    expect(M.snapshot(state, {}, 100).timerSeconds).toBe(.25);
  });
});

describe('R34 dual-LCD unit and independent power channels', () => {
  it.each([
    { raw: { PowerWatts: undefined }, power: null, torque: 400 },
    { raw: { TorqueNewtons: undefined }, power: 200, torque: null },
    { raw: { PowerWatts: 0, TorqueNewtons: 0 }, power: 0, torque: 0 },
    { raw: { PowerWatts: -20000, TorqueNewtons: -40 }, power: -20, torque: -40 },
    { raw: { PowerWatts: NaN, TorqueNewtons: Infinity }, power: null, torque: null },
  ])('keeps missing, signed and zero power/torque independent: %o', sample => {
    const state = M.createState(); accept(state, { CurrentLap: undefined, ...sample.raw });
    const v = M.snapshot(state, { effectiveUnits: { power: 'kw', torque: 'nm' } }, 0);
    expect(v.tachLcdMode).toBe('power'); expect(v.power).toBe(sample.power); expect(v.torque).toBe(sample.torque);
    expect(v.powerUnit).toBe('kW'); expect(v.torqueUnit).toBe('N·m');
  });
  it('honors horsepower, PS, kW and torque settings without affecting timer availability', () => {
    const state = M.createState(); accept(state, { CurrentLap: undefined });
    const hp = M.snapshot(state, { units: { power: 'hp', torque: 'nm' } }, 0);
    const ps = M.snapshot(state, { effectiveUnits: { power: 'ps', torque: 'lbft' } }, 0);
    const kw = M.snapshot(state, { effectiveUnits: { power: 'kw', torque: 'nm' } }, 0);
    expect(hp.power).toBeCloseTo(268.2044); expect(hp.powerUnit).toBe('HP');
    expect(ps.power).toBeCloseTo(271.92432); expect(ps.powerUnit).toBe('PS');
    expect(ps.torque).toBeCloseTo(295.0248); expect(ps.torqueUnit).toBe('lb·ft');
    expect(kw.power).toBe(200); expect(kw.powerUnit).toBe('kW');
    expect([hp.tachLcdMode, ps.tachLcdMode, kw.tachLcdMode]).toEqual(['power', 'power', 'power']);
  });
  it('uses selected HUD/app speed preferences before legacy fallback settings', () => {
    expect(M.units({ effectiveUnits: { speed: 'mph' }, units: { speed: 'kmh' } }, {}).speed).toBe('mph');
    expect(M.units({ units: { speed: 'mph' } }, {}).speed).toBe('mph');
    expect(M.units({}, { displayUnits: { speed: 'mph' } }).speed).toBe('mph');
    expect(M.units({ effectiveUnit: 'mph' }, {}).speed).toBe('mph');
    expect(M.units({ unit: 'mph' }, {}).speed).toBe('mph');
    expect(M.units({ effectiveUnits: { speed: 'kmh' }, unit: 'mph' }, {}).speed).toBe('kmh');
    expect(M.units({ units: { speed: 'invalid' } }, {}).speed).toBe('kmh');
  });
});
