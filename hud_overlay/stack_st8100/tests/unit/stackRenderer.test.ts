import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const dir = resolve(process.cwd(), '../hud_overlay/stack_st8100');
function context() {
  const scope: any = {};
  for (const name of ['stack-config.js', 'stack-model.js', 'stack-schedule.js', 'stack-monitor.js', 'stack-dot-matrix.js', 'stack-renderer.js']) runInNewContext(readFileSync(resolve(dir, name), 'utf8'), scope);
  return scope;
}
function canvas() {
  const attributes: Record<string, string> = {};
  const ctx = new Proxy({}, { get: (_target, key) => key === 'measureText' ? () => ({ width: 50 }) : () => undefined, set: () => true });
  return { width: 0, height: 0, dataset: {} as Record<string, string>, getContext: () => ctx,
    setAttribute: (key: string, value: string) => { attributes[key] = value; }, getAttribute: (key: string) => attributes[key] };
}
const raw = { TimestampMS: 1000, IsRaceOn: 1, CurrentEngineRpm: 6200, EngineMaxRpm: 8000, SpeedMetersPerSecond: 40,
  Gear: 4, Fuel: .5, Boost: 0, TireTemp: [212,212,212,212] };
const colors = { getPropertyValue: () => '#222222' };

describe('Stack renderer semantic outputs, not Canvas call counts or pixels', () => {
  it('draws all availability, unit, page and warning states and labels its actual LCD accessibly', () => {
    const { StackMonitor: S, StackRenderer: R } = context(), target = canvas();
    const renderer = R.create(target, { createElement: canvas }, R.palette(colors));
    const state = S.create(); R.resize(renderer, 2);
    expect(() => R.draw(renderer, state, 0, null)).not.toThrow(); expect(target.dataset.status).toBe('WAITING');
    S.ingest(state, raw, {}, 100); R.draw(renderer, state, 100, null);
    expect(target.dataset.lcd1).toBe('KM/H 144 | GEAR 4'); expect(target.getAttribute('aria-label')).toContain('TYRE C 100');
    S.configure(state, { stackSt8100Page: 'peaks' }); R.draw(renderer, state, 200, null);
    expect(target.dataset.lcd1).toBe('MAX RPM 6200 | MAX SPD 144');
    S.configure(state, { stackSt8100Alarms: [{enabled:true,metric:'boost',threshold:1.5}] });
    for (let n = 0; n <= 600; n += 100) S.ingest(state, { ...raw, TimestampMS: 2000 + n, Boost: 29.0076 }, {}, 300 + n);
    R.draw(renderer, state, 900, null); expect(target.dataset.lcd1).toBe('HIGH BOOST'); expect(target.dataset.warning).toBe('alarm');
    S.tick(state, 2500); R.draw(renderer, state, 2500, null); expect(target.dataset.status).toBe('NO SIGNAL');
    expect(target.getAttribute('aria-label')).not.toContain('6200'); expect(target.dataset.shift).toBe('false');
  });
  it('draws supported high-RPM faces, overflow and self-test without mutating sensors or tell-tales', () => {
    const { StackMonitor: S, StackRenderer: R } = context(), target = canvas();
    const renderer = R.create(target, { createElement: canvas }, R.palette(colors)); const state = S.create();
    R.resize(renderer, 0); R.draw(renderer, state, 0, .5);
    expect(target.dataset.lcd1).toBe('DISPLAY CHECK'); expect(state.peakRpm).toBe(null); expect(state.warning).toBe(null);
    S.ingest(state, { ...raw, CurrentEngineRpm: 16000, EngineMaxRpm: 18000 }, {}, 100);
    expect(() => R.draw(renderer, state, 100, null)).not.toThrow(); expect(target.dataset.dial).toBe('0-6-13'); expect(target.dataset.rpm).toBe('16000');
  });
  it('supports no drawing context without throwing or leaking', () => {
    const { StackMonitor: S, StackRenderer: R } = context();
    const target = { getContext: () => null };
    const renderer = R.create(target, { createElement: () => target }, R.palette(colors));
    expect(() => { R.resize(renderer, NaN); R.draw(renderer, S.create(), 0, null); }).not.toThrow();
  });
  it('cleans timers and self-test RAF on host destroy and pagehide; config visibility works', () => {
    const scope = context(), target = canvas(), container = { style: {}, dataset: {} }, callbacks = new Map<string, Function[]>();
    const timers = new Set<number>(), rafs = new Set<number>(); let id = 0, definition: any;
    const root: any = {
      ...scope, devicePixelRatio: 2,
      HUDCore: { registerStyle: (_id: string, def: any) => { definition = def; }, init: () => {} },
      addEventListener: (key: string, fn: Function) => callbacks.set(key, [...(callbacks.get(key) || []), fn]),
      removeEventListener: (key: string, fn: Function) => callbacks.set(key, (callbacks.get(key) || []).filter(cb => cb !== fn)),
    };
    const sandbox = { window: root, document: { documentElement: {}, getElementById: (key: string) => key === 'stackCanvas' ? target : container, createElement: canvas },
      getComputedStyle: () => colors, performance: { now: () => 10 },
      setInterval: () => { timers.add(++id); return id; }, clearInterval: (key: number) => timers.delete(key),
      requestAnimationFrame: () => { rafs.add(++id); return id; }, cancelAnimationFrame: (key: number) => rafs.delete(key) };
    runInNewContext(readFileSync(resolve(dir, 'stack-controller.js'), 'utf8'), sandbox);
    definition.onInit({ elements: { showGauge: false } }); expect(container.style).toEqual({ display: 'none' });
    definition.onElementsChange({ showGauge: true }); expect(container.style).toEqual({ display: 'block' });
    definition.onAnimate();
    for (let i = 0; i < 30; i++) {
      definition.onFrame({ ...raw, IsRaceOn: 0, TimestampMS: 1000 + i }, {});
      definition.onInit({ elements: { showGauge: true } });
    }
    // One animation owner is a resource contract, not a Canvas call-count assertion.
    expect(timers.size).toBe(1); expect(rafs.size).toBe(1);
    for (const cb of callbacks.get('message') || []) cb({ data: { type: 'hud:destroy' } });
    expect(timers.size).toBe(0); expect(rafs.size).toBe(0);
    for (const cb of callbacks.get('pagehide') || []) cb();
    expect(timers.size).toBe(0); expect(callbacks.get('message')).toEqual([]);
  });
});
