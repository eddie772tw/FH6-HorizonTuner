import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { FrameInterpolator } from '../../../shared/frame-interpolator.js';

const dir = resolve(process.cwd(), '../hud_overlay/stack_st8100');
const scope: any = {};
for (const file of ['stack-model.js', 'stack-monitor.js', 'stack-dot-matrix.js', 'stack-renderer.js']) {
  runInNewContext(readFileSync(resolve(dir, file), 'utf8'), scope);
}
const M = scope.StackModel, Monitor = scope.StackMonitor;
const packet = (overrides: Record<string, unknown> = {}) => ({
  TimestampMS: 10000, IsRaceOn: 1, CarOrdinal: 12, CurrentRaceTime: 70, LapNumber: 1,
  CurrentEngineRpm: 6400, EngineMaxRpm: 8000, SpeedMetersPerSecond: 50, Gear: 4,
  Fuel: .7, Boost: 14.5038, TireTemp: [194, 203, 212, 221], CurrentLap: 12.3, LastLap: 58.45, BestLap: 57.6,
  ...overrides,
});
function feed(s: any, ms = 0, overrides = {}) { return Monitor.ingest(s, packet({ TimestampMS: 10000 + ms, ...overrides }), {}, ms); }
function field(s: any, key: string) { return M.field(key, s, {}); }
function enabled(s: any) {
  Monitor.configure(s, { stackSt8100FuelWarningEnabled: true, stackSt8100TireWarningEnabled: true, stackSt8100BoostWarningEnabled: true });
}

describe('Stack ST8100 telemetry-only display contract', () => {
  it('converts raw sensor units exactly once and exposes two-row LCD field text', () => {
    const s = feed(Monitor.create());
    expect(field(s, 'speed')).toEqual({ label: 'KM/H', value: '180' });
    expect(field(s, 'fuel')).toEqual({ label: 'FUEL %', value: '70' });
    expect(field(s, 'tire_avg')).toEqual({ label: 'TYRE C', value: '98' });
    expect(field(s, 'boost')).toEqual({ label: 'BST BAR', value: '1.00' });
    Monitor.configure(s, { effectiveUnits: { speed: 'mph', boostPressure: 'psi' }, stackSt8100TemperatureUnit: 'f' });
    expect(field(s, 'speed').value).toBe('112');
    expect(field(s, 'boost').value).toBe('14.5');
    expect(field(s, 'tire_avg').value).toBe('208');
    Monitor.configure(s, { effectiveUnits: { boostPressure: 'kpa' } });
    expect(field(s, 'boost').value).toBe('100.0');
  });
  it('keeps negative boost, zero fuel and reverse/neutral truthful', () => {
    const s = feed(Monitor.create(), 0, { Boost: -7.2519, Fuel: 0, Gear: 0 });
    expect(field(s, 'boost').value).toBe('-0.50');
    expect(field(s, 'fuel').value).toBe('0');
    expect(field(s, 'gear').value).toBe('R');
    feed(s, 100, { Gear: 11 }); expect(field(s, 'gear').value).toBe('N');
    feed(s, 200, { Gear: 10 }); expect(field(s, 'gear').value).toBe('10');
    feed(s, 300, { Gear: '2' }); expect(field(s, 'gear').value).toBe('--');
  });
  it('never promotes coordinator fill-zero aliases into measured sensors', () => {
    const d: any = packet();
    for (const key of ['CurrentEngineRpm', 'EngineMaxRpm', 'SpeedMetersPerSecond', 'Gear', 'Boost', 'Fuel', 'TireTemp']) delete d[key];
    Object.assign(d, { rpm: 0, maxRpm: 7000, speed_kmh: 0, gear: 0, boost_bar: 0, fuel_ratio: null, TireTemp: [0,0,0,0], tire_temp_f: [] });
    const s = Monitor.create(); enabled(s); Monitor.ingest(s, d, {}, 0);
    for (const key of ['rpm', 'speed', 'gear', 'boost', 'fuel', 'tire_avg', 'tire_max']) expect(field(s, key).value).toBe('--');
    expect(s.shift).toBe(false); expect(s.warning).toBe(null);
  });
  it.each([null, '100', NaN, Infinity, [], {}])('rejects invalid numeric channel %s despite finite aliases', bad => {
    const s = feed(Monitor.create(), 0, { CurrentEngineRpm: bad, SpeedMetersPerSecond: bad, Boost: bad, Fuel: bad,
      rpm: 5000, speed_kmh: 100, boost_bar: 1, fuel_ratio: .5 });
    for (const key of ['rpm', 'speed', 'boost', 'fuel']) expect(field(s, key).value).toBe('--');
  });
  it.each([[200,200,200], [200, null, 200, 200], ['200',200,200,200], [200, NaN, 200, 200]])('requires all four finite tire readings: %s', tires => {
    const s = feed(Monitor.create(), 0, { tire_temp_f: tires });
    expect(field(s, 'tire_avg').value).toBe('--'); expect(field(s, 'tire_max').value).toBe('--');
  });
  it('uses reported lap channels, not a fabricated timer or estimated lap', () => {
    const s = feed(Monitor.create());
    expect(field(s, 'current_lap').value).toBe('0:12.30');
    expect(field(s, 'last_lap').value).toBe('0:58.45');
    expect(field(s, 'best_lap').value).toBe('0:57.60');
    expect(field(s, 'lap').value).toBe('1');
    feed(s, 100, { CurrentLap: 0, BestLap: 0, LastLap: -2, LapNumber: '2' });
    for (const key of ['current_lap', 'last_lap', 'best_lap']) expect(field(s, key).value).toBe('--:--.--');
    expect(field(s, 'lap').value).toBe('--');
  });
  it('selects documented fixed compressed scales and monotonically maps their working bands', () => {
    const c = M.config({});
    expect(M.dial(c, 8000).max).toBe(8000); expect(M.dial(c, 9000).max).toBe(10000);
    expect(M.dial(c, 12000).max).toBe(13000); expect(M.dial(c, 16000).max).toBe(13000);
    for (const d of Object.values(M.DIALS) as any[]) {
      const low = M.angle(d.knee, d) - M.angle(0, d), high = M.angle(d.max, d) - M.angle(d.knee, d);
      expect(low).toBeLessThan(high); expect(low / (low + high)).toBeCloseTo(.14);
      expect(M.angle(d.knee + 1000, d)).toBeGreaterThan(M.angle(d.knee, d));
      expect(M.angle(d.max + 2000, d)).toBe(M.angle(d.max, d));
      expect(M.dial(M.config({ stackSt8100Dial: d.id }), 16000).id).toBe(d.id);
    }
  });
  it('uses EngineMaxRpm for shift percent, never estimated shared redline', () => {
    const s = feed(Monitor.create(), 0, { CurrentEngineRpm: 7100, redlineRpm: 7000 });
    expect(s.shift).toBe(false);
    feed(s, 100, { CurrentEngineRpm: 7200 }); expect(s.shift).toBe(true);
    feed(s, 200, { CurrentEngineRpm: 7800, EngineMaxRpm: null, maxRpm: 7000 }); expect(s.shift).toBe(false);
    Monitor.configure(s, { stackSt8100ShiftEnabled: false }); feed(s, 300, { CurrentEngineRpm: 8000 }); expect(s.shift).toBe(false);
  });
});

describe('Stack ST8100 warning and session behavior', () => {
  it('has no default vehicle alarms or monitoring advice', () => {
    const s = Monitor.create();
    for (let n = 0; n <= 1000; n += 100) feed(s, n, { Fuel: 0, TireTemp: [400,400,400,400], Boost: 70 });
    expect(s.warning).toBe(null);
  });
  it('requires sustained advancing packets and clears with low-fuel hysteresis', () => {
    const s = Monitor.create(); enabled(s);
    feed(s, 0, { Fuel: .09 }); feed(s, 200, { Fuel: .09 }); feed(s, 400, { Fuel: .09 });
    expect(s.warning).toBe(null);
    feed(s, 500, { Fuel: .09 }); expect(s.warning).toBe('fuel');
    feed(s, 600, { Fuel: .115 }); expect(s.warning).toBe('fuel');
    feed(s, 700, { Fuel: .12 }); expect(s.warning).toBe(null);
  });
  it('ignores short spikes and sampling gaps instead of carrying warning timers across them', () => {
    const s = Monitor.create(); enabled(s);
    feed(s, 0, { Fuel: .05 }); feed(s, 200, { Fuel: .5 }); feed(s, 400, { Fuel: .05 }); feed(s, 1000, { Fuel: .05 });
    expect(s.warning).toBe(null); feed(s, 1200, { Fuel: .05 }); feed(s, 1400, { Fuel: .05 }); feed(s, 1500, { Fuel: .05 });
    expect(s.warning).toBe('fuel');
  });
  it('prioritizes hottest-tire, then boost, then fuel, each with its own hysteresis', () => {
    const s = Monitor.create(); enabled(s);
    const bad = { Fuel: .05, Boost: 29.0076, TireTemp: [300, 200, 200, 200] };
    for (let n = 0; n <= 600; n += 100) feed(s, n, bad);
    expect(s.warning).toBe('tire');
    feed(s, 700, { ...bad, TireTemp: [240,240,240,240] }); expect(s.warning).toBe('tire');
    feed(s, 800, { ...bad, TireTemp: [230,230,230,230] }); expect(s.warning).toBe('boost');
    feed(s, 900, { ...bad, TireTemp: [230,230,230,230], Boost: 21.03051 }); expect(s.warning).toBe('boost');
    feed(s, 1000, { ...bad, TireTemp: [230,230,230,230], Boost: 19 }); expect(s.warning).toBe('fuel');
    feed(s, 1100, { Fuel: null }); expect(s.warning).toBe(null);
  });
  it('unit switches never alter canonical warning setpoints', () => {
    const s = Monitor.create(); enabled(s);
    Monitor.configure(s, { effectiveUnits: { boostPressure: 'psi' }, stackSt8100TemperatureUnit: 'f' });
    expect(s.settings.stackSt8100BoostWarningBar).toBe(1.5); expect(s.settings.stackSt8100TireWarningC).toBe(120);
    for (let n = 0; n <= 600; n += 100) feed(s, n, { Boost: 29.0076 });
    expect(s.warning).toBe('boost');
  });
  it('duplicate interpolated frames cannot sustain warnings or keep stale data live', () => {
    const s = Monitor.create(); enabled(s); feed(s, 0, { Fuel: .01 });
    for (let n = 100; n <= 1800; n += 100) Monitor.ingest(s, packet({ Fuel: .01 }), {}, n);
    expect(s.status).toBe('NO SIGNAL'); expect(s.warning).toBe(null); expect(s.shift).toBe(false);
    expect(field(s, 'speed').value).toBe('--');
    feed(s, 1900); expect(s.status).toBe('LIVE');
  });
  it('does not accept a reordered timestamp or reset peaks for one old frame', () => {
    const s = feed(Monitor.create()); feed(s, 200, { CurrentEngineRpm: 7500 });
    Monitor.ingest(s, packet({ TimestampMS: 10050, CurrentEngineRpm: 2000 }), {}, 300);
    expect(s.latest.rpm).toBe(7500); expect(s.peakRpm).toBe(7500); expect(s.seenAt).toBe(200);
  });
  it('does not accept one old packet merely because its race clock and lap resemble a reset', () => {
    const s = feed(Monitor.create(), 0, { CurrentEngineRpm: 7900 });
    feed(s, 16, { CurrentEngineRpm: 7000 });
    Monitor.ingest(s, packet({ TimestampMS: 500, CurrentRaceTime: .1, LapNumber: 0, CurrentEngineRpm: 1000 }), {}, 32);
    expect(s.timestamp).toBe(10016); expect(s.peakRpm).toBe(7900); expect(s.latest.rpm).toBe(7000);
    feed(s, 48, { CurrentEngineRpm: 6800 }); expect(s.timestamp).toBe(10048); expect(s.peakRpm).toBe(7900);
  });
  it('handles unsigned timestamp wrap without resetting valid tell-tales', () => {
    const s = Monitor.create(); Monitor.ingest(s, packet({ TimestampMS: 0xfffffff0, CurrentEngineRpm: 7900 }), {}, 0);
    Monitor.ingest(s, packet({ TimestampMS: 16, CurrentEngineRpm: 1000 }), {}, 32);
    expect(s.status).toBe('LIVE'); expect(s.latest.rpm).toBe(1000); expect(s.peakRpm).toBe(7900);
  });
  it('clears session tell-tales on a car change or corroborated race restart', () => {
    const s = feed(Monitor.create()); feed(s, 100, { CarOrdinal: 13, CurrentEngineRpm: 2000 });
    expect(s.peakRpm).toBe(2000);
    feed(s, 200, { CarOrdinal: 13, CurrentEngineRpm: 7000 });
    Monitor.ingest(s, packet({ CarOrdinal: 13, TimestampMS: 10, CurrentRaceTime: .01, LapNumber: 0, CurrentEngineRpm: 1500 }), {}, 300);
    expect(s.peakRpm).toBe(7000);
    Monitor.ingest(s, packet({ CarOrdinal: 13, TimestampMS: 26, CurrentRaceTime: .026, LapNumber: 0, CurrentEngineRpm: 1500 }), {}, 316);
    expect(s.status).toBe('LIVE'); expect(s.peakRpm).toBe(1500);
  });
  it('recovers a same-car first-lap restart after pause with a backward timestamp', () => {
    const s = feed(Monitor.create(), 0, { LapNumber: 0 });
    feed(s, 100, { IsRaceOn: 0, LapNumber: 0 });
    expect(s.status).toBe('PAUSED');
    Monitor.ingest(s, packet({ TimestampMS: 5, CurrentRaceTime: .01, LapNumber: 0, CurrentEngineRpm: 1200 }), {}, 200);
    expect(s.status).toBe('PAUSED');
    Monitor.ingest(s, packet({ TimestampMS: 21, CurrentRaceTime: .026, LapNumber: 0, CurrentEngineRpm: 1200 }), {}, 216);
    expect(s.status).toBe('LIVE'); expect(s.peakRpm).toBe(1200);
  });
  it('requires two progressing packets to establish a new timestamp epoch after loss without race metadata', () => {
    const s = feed(Monitor.create(), 0, { LapNumber: null, CurrentRaceTime: null });
    Monitor.tick(s, 1700);
    const fresh = { CurrentRaceTime: null, LapNumber: null, CurrentEngineRpm: 1000 };
    Monitor.ingest(s, packet({ ...fresh, TimestampMS: 5 }), {}, 1800); expect(s.status).toBe('NO SIGNAL');
    Monitor.ingest(s, packet({ ...fresh, TimestampMS: 5 }), {}, 1900); expect(s.status).toBe('NO SIGNAL');
    Monitor.ingest(s, packet({ ...fresh, TimestampMS: 21 }), {}, 1916);
    expect(s.status).toBe('LIVE'); expect(s.peakRpm).toBe(1000);
  });
  it('clears warnings on pause, data errors, missing timestamp and configure; resume needs advancing data', () => {
    const s = Monitor.create(); enabled(s);
    for (let n = 0; n <= 600; n += 100) feed(s, n, { Fuel: .01 });
    expect(s.warning).toBe('fuel');
    Monitor.ingest(s, packet({ TimestampMS: 10600, IsRaceOn: 0 }), {}, 700);
    expect(s.status).toBe('PAUSED'); expect(s.warning).toBe(null);
    Monitor.ingest(s, packet({ TimestampMS: 10600 }), {}, 800); expect(s.status).toBe('PAUSED');
    feed(s, 900); expect(s.status).toBe('LIVE');
    feed(s, 1000, { success: false }); expect(s.status).toBe('DATA ERROR');
    feed(s, 1100, { TimestampMS: undefined }); expect(s.status).toBe('NO DATA');
    feed(s, 1200); expect(s.status).toBe('LIVE');
    Monitor.configure(s, { stackSt8100FuelWarningEnabled: false }); expect(s.warning).toBe(null);
  });
});

describe('Stack source evidence is independent of actual FrameInterpolator output', () => {
  it('keeps extrapolated RPM on the needle only; peaks and shift use the source sample', () => {
    const first = packet({ TimestampMS: 10000, CurrentEngineRpm: 6000 });
    const second = packet({ TimestampMS: 10016, CurrentEngineRpm: 7000 });
    const interpolator = new FrameInterpolator();
    interpolator.pushSample({ ...first, sourceTelemetry: first }, 0);
    interpolator.pushSample({ ...second, sourceTelemetry: second }, 16);
    const frame = interpolator.interpolate(20);
    expect(frame.CurrentEngineRpm).toBe(7250);
    const state = Monitor.create(); Monitor.ingest(state, frame, {}, 20);
    expect(state.visualRpm).toBe(7250); expect(state.latest.rpm).toBe(7000);
    expect(state.peakRpm).toBe(7000); expect(state.shift).toBe(false);
    Monitor.ingest(state, interpolator.interpolate(200), {}, 200);
    expect(state.visualRpm).toBe(7000); expect(state.peakRpm).toBe(7000);
    expect(field(state, 'rpm').value).toBe('7000');
  });
  it('does not trigger fuel, temperature or boost alarms from extrapolation crossing alone', () => {
    const state = Monitor.create(); enabled(state);
    // Every source sample is below high / above low warning thresholds, while
    // the real interpolator can overshoot those thresholds on its first render.
    for (let n = 0; n <= 700; n += 100) {
      const previous = packet({ TimestampMS: 10000 + n, Fuel: .2, Boost: 1.3 * 14.5038, TireTemp: [239,239,239,239] });
      const source = packet({ TimestampMS: 10016 + n, Fuel: .11, Boost: 1.49 * 14.5038, TireTemp: [247,247,247,247] });
      const interpolator = new FrameInterpolator();
      interpolator.pushSample({ ...previous, sourceTelemetry: previous }, n);
      interpolator.pushSample({ ...source, sourceTelemetry: source }, n + 16);
      const frame = interpolator.interpolate(n + 20);
      expect(frame.Fuel).toBeLessThan(.1); expect(frame.Boost / 14.5038).toBeGreaterThan(1.5);
      expect(frame.TireTemp[0]).toBeGreaterThan(248);
      Monitor.ingest(state, frame, {}, n + 20);
    }
    expect(state.warning).toBe(null); expect(state.minFuel).toBe(11);
    expect(state.peakTireC).toBeLessThan(120);
  });
  it('rejects malformed source envelopes rather than trusting derived fallback values', () => {
    for (const sourceTelemetry of [null, [], 'packet', {}]) {
      const state = Monitor.create(); Monitor.ingest(state, { ...packet(), sourceTelemetry }, {}, 0);
      expect(state.status).toBe('NO DATA'); expect(state.peakRpm).toBe(null);
    }
  });
});
