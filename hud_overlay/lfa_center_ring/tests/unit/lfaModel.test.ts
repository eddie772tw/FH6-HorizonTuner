import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const path = resolve(process.cwd(), '../hud_overlay/lfa_center_ring');
function load() {
  const scope: any = {};
  for (const file of ['lfa-auxiliary.js', 'lfa-session.js', 'lfa-expansion.js', 'lfa-panel-layout.js', 'lfa-status.js', 'lfa-model.js']) runInNewContext(readFileSync(resolve(path, file), 'utf8'), scope);
  return scope.LfaModel;
}
const sample = { timestamp_ms: 100, rpm: 7200, maxRpm: 9000, redlineRpm: 8000, speed_kmh: 180, speed_mph: 111.85, gear: 4, throttle: .8, brake: 0 };

describe('LFA center-ring canonical display', () => {
  const M = load();
  it('starts with unavailable readings rather than a simulated vehicle', () => {
    expect(M.view(M.newState(), 0)).toMatchObject({ status: 'WAITING', speedText: '—', gear: '—', rpmText: '—', needle: null });
  });
  it('formats canonical reverse, neutral, and all ten forward gears', () => {
    expect(M.gear(0)).toBe('R'); expect(M.gear(11)).toBe('N');
    for (let g = 1; g <= 10; g++) expect(M.gear(g)).toBe(String(g));
    for (const g of [null, undefined, '', '3', NaN, -1, 12, 1.5]) expect(M.gear(g)).toBe('—');
  });
  it('chooses explicit canonical speed units without double conversion', () => {
    expect(M.frame(sample, {}, M.config({}))).toMatchObject({ speed: 180, speedUnit: 'km/h' });
    expect(M.frame(sample, {}, M.config({ isMetric: false }))).toMatchObject({ speed: 111.85, speedUnit: 'mph' });
    expect(M.frame({ ...sample, displayUnits: { speed: 'mph' }, speed: 2 }, {}, M.config({})).speed).toBe(111.85);
  });
  it('only uses ambiguous speed when its canonical display unit is present', () => {
    expect(M.frame({ speed: 100 }, {}, M.config({})).speed).toBeNull();
    expect(M.frame({ speed: 100, displayUnits: { speed: 'mph' } }, {}, M.config({}))).toMatchObject({ speed: 100, speedUnit: 'mph' });
  });
  it('does not convert raw physical fields in the renderer', () => {
    const f = M.frame({ CurrentEngineRpm: 5000, SpeedMetersPerSecond: 30, Gear: 3, AccelInput: 200 }, {}, M.config({}));
    expect(f).toMatchObject({ rpm: null, speed: null, gear: '—', throttle: null, maxRpm: null, redline: null });
  });
  it('rejects invalid values and retains true zero', () => {
    expect(M.frame({ rpm: 0, speed_kmh: 0, gear: 0, throttle: 0, brake: 0 }, {}, M.config({}))).toMatchObject({ rpm: 0, speed: 0, gear: 'R', throttle: 0, brake: 0 });
    expect(M.frame({ rpm: Infinity, speed_kmh: Infinity, maxRpm: NaN, throttle: '', brake: null }, {}, M.config({}))).toMatchObject({ rpm: null, speed: null, maxRpm: null, throttle: null, brake: null });
  });
  it('displays signed reverse speed as magnitude in either canonical unit', () => {
    const reverse = { ...sample, gear: 0, speed_kmh: -18, speed_mph: -11.18 };
    expect(M.frame(reverse, {}, M.config({}))).toMatchObject({ gear: 'R', speed: 18 });
    expect(M.frame(reverse, {}, M.config({ isMetric: false }))).toMatchObject({ gear: 'R', speed: 11.18 });
  });
  it('rejects corrupt speed beyond three-digit display capacity', () => {
    expect(M.frame({ ...sample, speed_kmh: 1e12 }, {}, M.config({})).speed).toBeNull();
    expect(M.frame({ ...sample, speed_mph: -1000 }, {}, M.config({ isMetric: false })).speed).toBeNull();
    expect(M.frame({ ...sample, speed_kmh: 999 }, {}, M.config({})).speed).toBe(999);
  });
  it('accepts supported canonical maximum and pause aliases', () => {
    expect(M.frame({ max_rpm: 6500 }, {}, M.config({})).maxRpm).toBe(6500);
    for (const input of [{ isRaceOn: false }, { is_race_on: 0 }, { IsRaceOn: 0 }]) expect(M.frame(input, {}, M.config({})).raceOn).toBe(false);
    expect(M.frame({ error: 'decoder failure' }, {}, M.config({})).failed).toBe(true);
  });
  it('clamps pedal ratios without inventing unavailable sensor data', () => {
    const f = M.frame({ ...sample, throttle: 3, brake: -1 }, {}, M.config({}));
    expect(f.throttle).toBe(1); expect(f.brake).toBe(0);
    expect(f).not.toHaveProperty('oilPressure'); expect(f).not.toHaveProperty('coolantTemperature');
  });
  it('keeps the 0–10 reference face and correctly relabels high-rev cars', () => {
    expect(M.scale(6000).maximum).toBe(10000);
    const high = M.scale(15000);
    expect(high.maximum).toBeGreaterThanOrEqual(15000);
    expect(high.ticks.at(-1)).toBe(high.maximum);
    const a = M.angle(0, high.maximum), b = M.angle(high.maximum, high.maximum);
    expect((M.angle(high.maximum / 2, high.maximum) - a) / (b - a)).toBeCloseTo(.5);
    expect(M.angle(high.maximum * 2, high.maximum)).toBe(b);
  });
  it('uses the coordinator redline rather than the reference vehicle redline', () => {
    const s = M.newState(); M.ingest(s, sample, { redlineRpm: 7000 }, 0);
    expect(M.view(s, 1)).toMatchObject({ redline: 7000, shift: true });
    M.ingest(s, { ...sample, timestamp_ms: 101, redlineRpm: undefined }, {}, 10);
    expect(M.view(s, 11)).toMatchObject({ redline: null, shift: false });
  });
  it('does not create a redline without a valid engine limit', () => {
    expect(M.frame({ rpm: 6000 }, { redlineRpm: 5000 }, M.config({})).redline).toBeNull();
  });
  it('merges partial configs, clamps glow and keeps safety colors separate', () => {
    const c = M.config({ isMetric: false, glowIntensity: 99, useDefaultColors: false, customColor: '#aabbcc', elements: { showGauge: false } });
    expect(c).toMatchObject({ isMetric: false, glow: 2, accent: '#aabbcc', showGauge: false });
    expect(M.config({ elements: { showGauge: true } }, c)).toMatchObject({ isMetric: false, accent: '#aabbcc', showGauge: true });
    expect(M.config({ useDefaultColors: false, customColor: 'invalid' }, c).accent).toBe('#aabbcc');
    expect(M.config({ useDefaultColors: true }, c).accent).toBe('#edf7fa');
    expect(M.config({ effectiveUnits: { speed: 'kmh' } }, c).isMetric).toBe(true);
  });
  it('accepts only boolean expansion switches, defaults off and preserves omitted settings', () => {
    expect(M.config({})).toMatchObject({ lfaManualExpand: false, lfaAutoExpand: false });
    const manual = M.config({ lfaManualExpand: true, lfaAutoExpand: true });
    expect(M.config({ isMetric: false }, manual)).toMatchObject({ lfaManualExpand: true, lfaAutoExpand: true });
    for (const invalid of [1, 'true', null, []]) expect(M.config({ lfaManualExpand: invalid, lfaAutoExpand: invalid }, manual)).toMatchObject({ lfaManualExpand: false, lfaAutoExpand: false });
  });
});

describe('LFA liveness and absence', () => {
  const M = load();
  it('expires duplicate timestamps even when smoothing keeps emitting frames', () => {
    const s = M.newState(); M.ingest(s, sample, {}, 0);
    M.ingest(s, { ...sample, rpm: 7210 }, {}, 1000);
    expect(M.view(s, 1499).live).toBe(true);
    expect(M.view(s, 1500)).toMatchObject({ status: 'NO SIGNAL', speedText: '—', gear: '—', needle: null, throttle: null, shift: false });
  });
  it('reconnects on advancing or reset timestamps and drops the prior frame', () => {
    const s = M.newState(); M.ingest(s, sample, {}, 0);
    expect(M.view(s, 5000).live).toBe(false);
    M.ingest(s, { ...sample, timestamp_ms: 0, speed_kmh: 0, gear: 11 }, {}, 5100);
    expect(M.view(s, 5101)).toMatchObject({ status: 'LIVE', speedText: '0', gear: 'N' });
  });
  it('clears readings immediately on explicit error, pause, and missing data', () => {
    for (const [patch, status] of [[{ success: false }, 'DATA ERROR'], [{ isRaceOn: 0 }, 'PAUSED']]) {
      const s = M.newState(); M.ingest(s, sample, {}, 0); M.ingest(s, { ...sample, ...patch as object }, {}, 100);
      expect(M.view(s, 101)).toMatchObject({ status, speedText: '—', gear: '—', needle: null });
    }
    const s = M.newState(); M.ingest(s, sample, {}, 0); M.ingest(s, {}, {}, 100);
    expect(M.view(s, 101)).toMatchObject({ status: 'NO DATA', speedText: '—' });
  });
  it('keeps untimestamped launcher standby unavailable', () => {
    const s = M.newState();
    for (const now of [0, 1000, 2000, 9000]) M.ingest(s, { rpm: 0, speed_kmh: 0, gear: 0, maxRpm: 7000 }, {}, now);
    expect(M.view(s, 9001)).toMatchObject({ status: 'WAITING', gear: '—', speedText: '—' });
  });
  it('supports changing synthetic readings but never treats an identical replay as fresh', () => {
    const s = M.newState(); const f = { ...sample, timestamp_ms: undefined };
    M.ingest(s, f, {}, 0); M.ingest(s, f, {}, 1400);
    expect(M.view(s, 1500).live).toBe(false);
    M.ingest(s, { ...f, rpm: 7300 }, {}, 1600);
    expect(M.view(s, 1601).live).toBe(true);
  });
  it('retains unavailable fields rather than carrying values forward from the last packet', () => {
    const s = M.newState(); M.ingest(s, sample, {}, 0);
    M.ingest(s, { timestamp_ms: 200, rpm: 1000 }, {}, 100);
    expect(M.view(s, 101)).toMatchObject({ rpm: 1000, speedText: '—', gear: '—', throttle: null, brake: null });
  });
});

describe('LFA lifecycle through registered HUDCore hooks', () => {
  function controller() {
    let now = 0, nextRaf = 0, hooks: any;
    const listeners = new Map<string, Set<Function>>();
    const pending = new Map<number, Function>();
    const renders: any[] = [];
    const mediaCalls: any[] = []; let mediaView: any = { available: false }, mediaChanged: Function = () => {};
    const window: any = {
      performance: { now: () => now },
      requestAnimationFrame: (fn: Function) => { pending.set(++nextRaf, fn); return nextRaf; },
      cancelAnimationFrame: (id: number) => pending.delete(id),
      addEventListener: (name: string, fn: Function) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
      removeEventListener: (name: string, fn: Function) => listeners.get(name)?.delete(fn),
      HUDCore: { registerStyle: (_id: string, def: any) => { hooks = def; }, init: () => {} },
      LfaCatalog: { create: () => ({ start() {}, destroy() {} }) }, LfaMedia: { create: (options: any) => { mediaChanged = options.onChange; return {
        setEnabled: (enabled: boolean) => mediaCalls.push(['enabled', enabled]), view: () => mediaView,
        accept: (snapshot: any) => { mediaCalls.push(['snapshot', snapshot]); mediaView = snapshot; mediaChanged(); },
        destroy: () => mediaCalls.push(['destroy']),
      }; } },
      LfaRenderer: { create: () => ({ palette: () => {}, resize: () => {}, visibility: () => {}, render: (view: any, check: any, settings: any, motion: any) => renders.push({ view, check, settings, motion: { ...motion } }) }) },
    };
    const scope = { window, document: {} };
    for (const file of ['lfa-auxiliary.js', 'lfa-session.js', 'lfa-expansion.js', 'lfa-panel-layout.js', 'lfa-status.js', 'lfa-model.js']) runInNewContext(readFileSync(resolve(path, file), 'utf8'), scope);
    runInNewContext(readFileSync(resolve(path, 'lfa-controller.js'), 'utf8'), scope);
    return { hooks, renders, pending, listeners, mediaCalls, tick: (time: number) => { now = time; const jobs = [...pending.values()]; pending.clear(); jobs.forEach((fn) => fn(time)); }, event: (type: string, event: any = {}) => listeners.get(type)?.forEach((fn) => fn(event)) };
  }
  it('shows a labelled display check without fabricating telemetry and resumes fresh live data', () => {
    const c = controller(); c.hooks.onAnimate(); c.tick(200);
    expect(c.renders.at(-1).check).not.toBeNull(); expect(c.renders.at(-1).view.speedText).toBe('—');
    c.hooks.onFrame(sample, {}); c.tick(210);
    expect(c.renders.at(-1).check).toBeNull(); expect(c.renders.at(-1).view.speedText).toBe('180');
  });
  it('honors visibility/configuration and bounds repeated animations', () => {
    const c = controller(); c.hooks.onInit({ elements: { showGauge: false } });
    const last = c.renders.at(-1); c.hooks.onFrame(sample, {}); c.tick(100);
    expect(c.renders.at(-1)).toBe(last);
    c.hooks.onElementsChange({ showGauge: true }); c.hooks.onAnimate(); c.hooks.onAnimate(); c.tick(1000);
    expect(c.renders.at(-1).check).toBeNull(); expect(c.pending.size).toBe(1);
  });
  it('starts from persisted manual layout, then animates user toggles without resize resets', () => {
    const c = controller(); c.hooks.onInit({ lfaManualExpand: true, lfaAutoExpand: false });
    expect(c.renders.at(-1).motion).toMatchObject({ progress: 1, settled: true });
    c.hooks.onInit({ lfaManualExpand: false }); c.tick(150);
    const closing = c.renders.at(-1).motion;
    expect(closing.progress).toBeGreaterThan(0); expect(closing.progress).toBeLessThan(1);
    c.hooks.onScale(); expect(c.renders.at(-1).motion.progress).toBe(closing.progress);
    c.hooks.onInit({ lfaManualExpand: true }); expect(c.renders.at(-1).motion.progress).toBe(closing.progress);
    c.tick(1000); expect(c.renders.at(-1).motion).toMatchObject({ progress: 1, settled: true });
  });
  it('gates the media service and gives a confirmed race content priority over live media', () => {
    const c = controller();
    expect(c.mediaCalls.at(-1)).toEqual(['enabled', false]);
    c.hooks.onInit({ lfaAutoExpand: true }); expect(c.mediaCalls.at(-1)).toEqual(['enabled', true]);
    c.hooks.onMedia({ available: true, title: 'Track', status: 'paused' });
    expect(c.renders.at(-1).view.expandedPage).toBe('media'); expect(c.renders.at(-1).motion.target).toBe(true);
    c.hooks.onFrame({ ...sample, CurrentLap: 1 }, {}); c.tick(500);
    c.hooks.onFrame({ ...sample, timestamp_ms: 101, CurrentLap: 1.5 }, {}); c.tick(510);
    expect(c.renders.at(-1).view.expandedPage).toBe('race');
    c.tick(4000); expect(c.renders.at(-1).view.expandedPage).toBe('media');
    c.hooks.onMedia({ available: false }); expect(c.renders.at(-1).view.expandedPage).toBe('telemetry'); expect(c.renders.at(-1).motion.target).toBe(false);
    c.hooks.onInit({ lfaManualExpand: true }); expect(c.renders.at(-1).motion.target).toBe(true);
    c.hooks.onElementsChange({ showGauge: false }); expect(c.mediaCalls.at(-1)).toEqual(['enabled', false]);
    c.event('pagehide'); expect(c.mediaCalls.at(-1)).toEqual(['destroy']);
  });
  it.each(['pagehide', 'hud:destroy'])('releases the render loop and listeners on %s', (event) => {
    const c = controller(); c.hooks.onAnimate();
    c.event(event === 'pagehide' ? event : 'message', { data: { type: event } });
    expect(c.pending.size).toBe(0); expect(c.listeners.get('resize')?.size).toBe(0);
    const last = c.renders.at(-1); c.hooks.onInit({}); c.hooks.onFrame(sample, {}); c.hooks.onAnimate(); c.tick(3000);
    expect(c.renders.at(-1)).toBe(last); expect(c.pending.size).toBe(0);
  });
});
