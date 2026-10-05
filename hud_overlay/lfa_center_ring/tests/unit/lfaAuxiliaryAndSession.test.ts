import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const directory = resolve(process.cwd(), '../hud_overlay/lfa_center_ring');
const scope: any = {};
for (const file of ['lfa-auxiliary.js', 'lfa-session.js', 'lfa-model.js']) runInNewContext(readFileSync(resolve(directory, file), 'utf8'), scope);
const M = scope.LfaModel, A = scope.LfaAuxiliary, R = scope.LfaSession;
const base = { timestamp_ms: 100, rpm: 7200, maxRpm: 9000, redlineRpm: 8000, speed_kmh: 180, speed_mph: 111.85, gear: 4, throttle: .8, brake: .2, tire_temp_f: [176, 194, 212, 230], boost_psi: 14.5038 };
function view(patch: any = {}, config: any = {}) { const s = M.newState(); s.settings = M.config(config); M.ingest(s, { ...base, ...patch }, {}, 0); return M.view(s, 1); }
const race = { CurrentLap: 34.21, LastLap: 91, BestLap: 88, lap: 2, race_position: 3, CurrentRaceTime: 210, carOrdinal: 100 };
function session() {
  const state = M.newState(); let stamp = 100;
  return { state, feed(patch: any = {}, now = 0) { M.ingest(state, { ...base, ...race, timestamp_ms: ++stamp, ...patch }, {}, now); return M.view(state, now); } };
}

describe('LFA measured auxiliary gauges', () => {
  it('requires exactly four finite tyre readings and takes their arithmetic mean', () => {
    expect(view().auxiliary).toMatchObject({ tireValue: 95, tireText: '95', temperatureUnit: '°C', tireFraction: .625 });
    const sparse = new Array(4); sparse[0] = 176;
    for (const values of [undefined, [], [176, 194, 212], [176, 194, 212, 230, 240], [176, null, 212, 230], [176, '194', 212, 230], [176, NaN, 212, 230], [176, Infinity, 212, 230], sparse]) expect(view({ tire_temp_f: values }).auxiliary.tireText).toBe('N/A');
    expect(view({ tire_temp_f: undefined, TireTemp: [0, 0, 0, 0] }).auxiliary.tireText).toBe('N/A');
    expect(A.averageTireF([0, 0, 0, 0])).toBe(0);
  });
  it('honors explicit temperature units and documents metric fallback without double conversion', () => {
    expect(view({}, { effectiveUnits: { temperature: 'F' } }).auxiliary).toMatchObject({ tireValue: 203, tireText: '203', temperatureUnit: '°F', temperatureTicks: ['68', '140', '212', '284'] });
    expect(view({}, { isMetric: false }).auxiliary.temperatureUnit).toBe('°F');
    expect(view({}, { isMetric: false, effectiveUnits: { temperature: 'C' } }).auxiliary.temperatureUnit).toBe('°C');
  });
  it('clamps only tyre arc geometry and uses project cold/normal/hot thresholds', () => {
    expect(view({ tire_temp_f: [32, 32, 32, 32] }).auxiliary).toMatchObject({ tireValue: 0, tireFraction: 0, tireBand: 'cold' });
    expect(view({ tire_temp_f: [320, 320, 320, 320] }).auxiliary).toMatchObject({ tireValue: 160, tireFraction: 1, tireBand: 'hot' });
    expect(view().auxiliary.tireBand).toBe('normal');
  });
  it('preserves signed raw PSI and valid zero instead of clamped coordinator aliases', () => {
    expect(view({ Boost: -7.2519, boost_psi: 0, boost_bar: 0 }).auxiliary).toMatchObject({ boostValue: -.5, boostText: '-0.5', boostUnit: 'bar', boostNegative: true });
    expect(view({ Boost: 0 }).auxiliary).toMatchObject({ boostValue: 0, boostText: '0', boostFraction: .35 });
    expect(view({ Boost: 14.5038 }).auxiliary.boostValue).toBeCloseTo(1);
  });
  it('never fabricates boost from default-zero aliases when a raw signal is absent or invalid', () => {
    for (const bad of [undefined, null, '', '14.5', NaN, Infinity]) expect(view({ Boost: bad, boost_bar: 1 }).auxiliary.boostText).toBe('N/A');
    for (const marker of ['TimestampMS', 'CurrentEngineRpm', 'EngineMaxRpm', 'SpeedMetersPerSecond', 'IsRaceOn', 'CarOrdinal']) expect(view({ [marker]: 1, boost_psi: 0, boost_bar: 0 }).auxiliary.boostText).toBe('N/A');
    expect(A.boostPsi({ Boost: 101325 })).toBe(101325); // No magnitude-based Pa guess.
  });
  it('accepts unit-declared canonical-only sources and configured bar/psi/kPa', () => {
    expect(A.boostPsi({ boost_bar: -1 })).toBe(-14.5038);
    expect(A.boostPsi({ boost_kpa: 100 })).toBeCloseTo(14.5038, 4);
    expect(A.boostPsi({ boost: 1, boost_unit: 'BAR' })).toBe(14.5038);
    expect(A.boostPsi({ boost: 1 })).toBeNull();
    expect(A.boostPsi({ boost: 100000, boost_unit: 'Pa', displayUnits: { boostPressure: 'bar' } })).toBeNull();
    expect(view({}, { effectiveUnits: { boostPressure: 'psi' } }).auxiliary.boostText).toBe('14.5');
    expect(view({}, { effectiveUnits: { boostPressure: 'kpa' } }).auxiliary).toMatchObject({ boostText: '100', boostUnit: 'kPa' });
    expect(view({ displayUnits: { boostPressure: 'bar' } }, { effectiveUnits: { boostPressure: 'psi' } }).auxiliary.boostUnit).toBe('bar');
  });
  it('keeps unclamped signed boost text while bounding the −1…2bar arc', () => {
    expect(view({ boost_psi: -29.0076 }).auxiliary).toMatchObject({ boostText: '-2', boostFraction: 0 });
    expect(view({ boost_psi: 72.519 }).auxiliary).toMatchObject({ boostText: '5', boostFraction: 1 });
  });
  it('uses both pedal ratios, retaining genuine zero and clamping valid finite extremes', () => {
    expect(view({ throttle: 0, brake: 0 }).auxiliary).toMatchObject({ throttleText: '0%', brakeText: '0%', throttle: 0, brake: 0 });
    expect(view({ throttle: 2, brake: -.3 }).auxiliary).toMatchObject({ throttleText: '100%', brakeText: '0%' });
    expect(view({ throttle: null, brake: NaN }).auxiliary).toMatchObject({ throttleText: 'N/A', brakeText: 'N/A' });
  });
  it('clears every auxiliary reading on missing/error/pause/stale and restores fresh values', () => {
    const s = M.newState(); M.ingest(s, base, {}, 0);
    expect(M.view(s, 1500).auxiliary).toMatchObject({ tireText: 'N/A', boostText: 'N/A', throttleText: 'N/A', brakeText: 'N/A' });
    for (const patch of [{ success: false }, { isRaceOn: 0 }, { rpm: undefined, speed_kmh: undefined }]) {
      M.ingest(s, { ...base, ...patch }, {}, 1600);
      expect(M.view(s, 1601).auxiliary.tireText).toBe('N/A');
    }
    M.ingest(s, { ...base, timestamp_ms: 200 }, {}, 1700);
    expect(M.view(s, 1701).auxiliary.throttleText).toBe('80%');
  });
});

describe('LFA reported laps and rank', () => {
  it('shows latest reported lap time including zero and bounds formatted width', () => {
    expect(R.formatLap(0)).toBe('0:00.00'); expect(R.formatLap(34.21)).toBe('0:34.21'); expect(R.formatLap(83.456)).toBe('1:23.46');
    expect(R.formatLap(5999.99)).toBe('99:59.99');
    for (const value of [null, undefined, '', NaN, Infinity, -1, 6000]) expect(R.formatLap(value)).toBe('—:—');
  });
  it('accepts only positive integer rank and never celebrates the first snapshot', () => {
    const s = session(); expect(s.feed().centerText).toBe('P3');
    for (const rank of [0, -1, 1.5, null, undefined, 256]) expect(view({ race_position: rank }).centerText).toBe('LIVE');
    expect(view({ RacePosition: 255 }).centerText).toBe('P255');
  });
  it('does not infer lap completion from increasing elapsed time', () => {
    const s = session(); s.feed(); expect(s.feed({ CurrentLap: 59, CurrentRaceTime: 235 }, 1000).centerText).toBe('P3');
  });
  it('shows a single 3-second completion notice then restores rank', () => {
    const s = session(); s.feed(); expect(s.feed({ lap: 3, LastLap: 92 }, 100).centerText).toBe('LAP 3');
    for (const now of [900, 1800, 2700, 3100]) s.feed({ lap: 3, LastLap: 92, CurrentLap: 2, CurrentRaceTime: 212 }, now);
    expect(M.view(s.state, 3100).centerText).toBe('P3');
  });
  it('prioritizes actual best improvement when best and lap update together', () => {
    const s = session(); s.feed(); expect(s.feed({ lap: 3, LastLap: 87, BestLap: 87 }, 100).centerText).toBe('BEST LAP');
    expect(s.feed({ lap: 3, LastLap: 87, BestLap: 87 }, 200).centerText).toBe('BEST LAP');
    expect(s.state.race.notice.until).toBe(3100);
  });
  it('does not celebrate newly populated best time without a completion', () => {
    const s = session(); s.feed({ BestLap: 0 }); expect(s.feed({ BestLap: 88 }, 100).centerText).toBe('P3');
  });
  it('ignores replayed timestamps and out-of-order frames without rewinding the event baseline', () => {
    const s = session(); s.feed();
    expect(s.feed({ timestamp_ms: 101, lap: 3, LastLap: 80, BestLap: 80 }, 100).centerText).toBe('P3');
    expect(s.feed({ timestamp_ms: 90, lap: 1, CurrentRaceTime: 100, LastLap: 100, BestLap: 100 }, 200).centerText).toBe('P3');
    expect(s.feed({}, 300).centerText).toBe('P3');
  });
  it('silently rebaselines after stale smoothing replay and reconnect', () => {
    const s = session(); s.feed(); s.feed({ timestamp_ms: 101 }, 2000);
    expect(M.view(s.state, 2000).centerText).toBe('NO SIGNAL');
    expect(s.feed({ lap: 3, LastLap: 80, BestLap: 80 }, 2100).centerText).toBe('P3');
  });
  it('clears an old notice on corroborated timestamp/race-clock/lap reset', () => {
    const s = session(); s.feed(); expect(s.feed({ lap: 3, LastLap: 87, BestLap: 87 }, 100).centerText).toBe('BEST LAP');
    expect(s.feed({ timestamp_ms: 0, lap: 0, CurrentLap: 0, CurrentRaceTime: 0, LastLap: 0, BestLap: 0 }, 200).centerText).toBe('P3');
    expect(s.feed({ timestamp_ms: 1, lap: 0, CurrentLap: .1, CurrentRaceTime: .1, LastLap: 0, BestLap: 0 }, 300).centerText).toBe('P3');
  });
  it('rebaselines car changes, race restart and skipped completed laps', () => {
    for (const patch of [{ carOrdinal: 200 }, { CurrentRaceTime: 0, lap: 0 }, { lap: 10 }]) {
      const s = session(); s.feed(); expect(s.feed({ LastLap: 80, BestLap: 80, ...patch }, 100).centerText).toBe('P3');
    }
  });
  it('prioritizes SHIFT and inactive/error states over race messages', () => {
    const s = session(); s.feed(); expect(s.feed({ lap: 3, LastLap: 87, BestLap: 87, rpm: 8500 }, 100).centerText).toBe('SHIFT');
    expect(s.feed({ success: false }, 200).centerText).toBe('DATA ERROR');
    expect(s.feed({ isRaceOn: 0 }, 300).centerText).toBe('PAUSED');
    expect(s.feed({ lap: 4, LastLap: 85, BestLap: 85 }, 400).centerText).toBe('P3');
  });
});

describe('LFA auxiliary and session DOM projection', () => {
  it('renders signed/unit values, pedal percentages, lap/rank and clears all active fills when stale', () => {
    const nodes: Record<string, any> = {};
    const element = (id: string) => nodes[id] ||= { textContent: '', dataset: {}, style: { setProperty: () => {} }, attrs: {}, setAttribute(name: string, value: string) { this.attrs[name] = value; }, getContext: () => null };
    const window: any = { getComputedStyle: () => ({ getPropertyValue: () => '#edf7fa' }) };
    runInNewContext(readFileSync(resolve(directory, 'lfa-renderer.js'), 'utf8'), { window });
    const renderer = window.LfaRenderer.create({ getElementById: element }, M), s = session(); renderer.palette(s.state.settings);
    renderer.render(s.feed({ Boost: -7.2519 }), null, s.state.settings);
    expect(nodes.lfaTire.textContent).toBe('95°C'); expect(nodes.lfaBoost.textContent).toBe('-0.5'); expect(nodes.lfaBoostUnit.textContent).toBe('bar');
    expect(nodes.lfaThrottle.textContent).toBe('80%'); expect(nodes.lfaBrake.textContent).toBe('20%'); expect(nodes.lfaLapTime.textContent).toBe('0:34.21'); expect(nodes.lfaStatus.textContent).toBe('P3');
    renderer.render(M.view(s.state, 1600), null, s.state.settings);
    for (const name of ['Tire', 'Boost', 'Throttle', 'Brake']) expect(nodes['lfa' + name + 'Fill'].style.opacity).toBe('0');
    expect(nodes.lfaLapTime.textContent).toBe('—:—'); expect(nodes.lfaStatus.textContent).toBe('NO SIGNAL');
  });
});
