import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const hud = resolve(import.meta.dirname, '../../..');
const { JSDOM } = createRequire(resolve(hud, '../frontend/package.json'))('jsdom');
function coordinatorFrame(unit: 'kmh' | 'mph', overrides: Record<string, unknown> = {}) {
  const source = readFileSync(resolve(hud, 'shared/coordinator.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const format = new Function('window', 'FrameInterpolator', `${source}\nreturn formatHudTelemetry;`)(
    { isMetric: () => true, _currentHudConfig: { effectiveUnits: { speed: unit } } }, class {},
  );
  return format({ TimestampMS: 1000, IsRaceOn: 1, SpeedMetersPerSecond: 100 / 3.6,
    CurrentEngineRpm: 4000, EngineMaxRpm: 6000, Gear: 3, VelocityX: 10, VelocityZ: 20,
    TireTemp: [212, 212, 212, 212], Fuel: .5, ...overrides });
}
// Parse in an inert fragment with no browsing context or resource loading.
// Only the extracted checked-in inline source runs later in the explicit VM scope.
function inlineScriptSource(html: string) {
  const parsed: DocumentFragment = JSDOM.fragment(html);
  return Array.from(parsed.querySelectorAll('script:not([src])'), script => script.textContent ?? '').join('\n');
}

// Execute the checked-in renderer, not a second copy of its mapping formulas.
// Expose display state and the computed RPM ratio for semantic assertions only;
// no Canvas call-count or pixel-coordinate contracts are asserted here.
function renderer(style: string) {
  let hooks: any;
  let now = 0;
  let nextId = 0;
  const timers = new Map<number, () => void>();
  const rafs = new Map<number, (time: number) => void>();
  const listeners = new Map<string, Set<Function>>();
  const attributes: Record<string, string> = {};
  const classes = new Set<string>();
  const context = new Proxy({}, {
    get: (_target, key) => key === 'measureText' ? () => ({ width: 30 })
      : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {},
    set: () => true,
  });
  const canvas = { width: 800, height: 300, getContext: () => context,
    setAttribute: (key: string, value: string) => { attributes[key] = value; } };
  const container = { style: {}, classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) } };
  const scope: any = {
    console, Uint8ClampedArray,
    document: { getElementById: (name: string) => name.endsWith('Canvas') ? canvas : container, createElement: () => canvas },
    HUDCore: { registerStyle: (_name: string, value: any) => { hooks = value; }, init: () => {}, getAverageTireTemperatureC: (data: any) => (data.tire_temp_f.reduce((a: number, b: number) => a + b, 0) / 4 - 32) * 5 / 9 },
    HUDArtwork: { loadImage: () => ({ complete: true, naturalWidth: 800, naturalHeight: 300 }), watchCanvas: () => () => {} },
    Image: class { complete = false; naturalWidth = 0; naturalHeight = 0; },
    Path2D: class { arc() {} closePath() {} },
    performance: { now: () => now },
    Date: class extends Date { constructor() { super(new Date(2026, 9, 20, 7, 0).getTime() + now); } },
    setInterval: (callback: () => void) => { timers.set(++nextId, callback); return nextId; },
    clearInterval: (id: number) => timers.delete(id),
    requestAnimationFrame: (callback: (time: number) => void) => { rafs.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id: number) => rafs.delete(id),
    addEventListener: (type: string, callback: Function) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    },
    removeEventListener: (type: string, callback: Function) => listeners.get(type)?.delete(callback),
  };
  scope.window = scope;
  if (style === 'ap1_rev_arc') runInNewContext(readFileSync(resolve(hud, style, 'ap1-model.js'), 'utf8'), scope);
  const html = readFileSync(resolve(hud, style, 'index.html'), 'utf8');
  const source = inlineScriptSource(html)
    .replace(/(var rpmRatio = [^;]+;)/g, '$1 window.__rpmRatio = rpmRatio;')
    .replace(/\}\)\(\);\s*$/, 'window.__telemetry = telemetry; })();');
  runInNewContext(source, scope);
  return { hooks, attributes, classes, timers, rafs, state: () => scope.__telemetry,
    ratio: () => scope.__rpmRatio,
    advance: (elapsed: number) => { now = elapsed; for (const callback of timers.values()) callback(); },
    emit: (type: string, event?: any) => { for (const callback of listeners.get(type) || []) callback(event); },
  };
}

describe('renderer inline script parsing', () => {
  it('keeps HTML script order and raw text without executing or loading scripts', () => {
    const first = 'globalThis.__rendererParserExecuted = true;';
    const second = 'const label = "&amp;second";';
    const html = `
      <!-- <script>throw new Error('comment');</script> -->
      <textarea><script>throw new Error('text');</script></textarea>
      <template><script>throw new Error('template');</script></template>
      <ScRiPt data-label="a > b">${first}</sCrIpT \t>
      <SCRIPT SRC="https://example.invalid/never-load.js">throw new Error('external');</SCRIPT>
      <script src="">throw new Error('empty src');</script>
      <SCRIPT>${second}</SCRIPT\n>
    `;
    expect('__rendererParserExecuted' in globalThis).toBe(false);
    expect(inlineScriptSource(html)).toBe(`${first}\n${second}`);
    expect('__rendererParserExecuted' in globalThis).toBe(false);
  });

  it('returns no executable source when the document has no inline scripts', () => {
    expect(inlineScriptSource('<p>No renderer</p><script src="renderer.js"></script>')).toBe('');
  });
});

describe('Toyota native artwork telemetry contracts', () => {
  it.each(['altezza_trd', 'supra_trd', 'soarer_z20'])('keeps %s speed in km/h regardless of preference', style => {
    const h = renderer(style);
    for (const unit of ['mph', 'kmh'] as const) {
      h.hooks.onFrame(coordinatorFrame(unit), { isMetric: false });
      expect(h.state().speed).toBeCloseTo(100);
    }
  });
  it('rescales the Altezza tachometer on vehicle changes and restores the reference scale without engine data', () => {
    const h = renderer('altezza_trd');
    for (const [maximum, ceiling] of [[6250, 7000], [12500, 14000], [3500, 3500]]) {
      h.hooks.onFrame(coordinatorFrame('kmh', { EngineMaxRpm: maximum }), {});
      expect(h.state().ceiling).toBe(ceiling);
      expect(h.state().redline).toBe(maximum - 1000);
    }
    h.hooks.onFrame(coordinatorFrame('kmh', { EngineMaxRpm: undefined }), {});
    expect(h.state()).toMatchObject({ ceiling: 9000, redline: 8000 });
  });
  it('maps boost and four-wheel average/maximum temperatures while preserving missing values', () => {
    const h = renderer('altezza_trd');
    h.hooks.onFrame(coordinatorFrame('mph', { Gear: 0, SpeedMetersPerSecond: 0,
      Boost: 14.5038, TireTemp: [176, 194, 212, 230] }), {});
    expect(h.state()).toMatchObject({ gear: 0, speed: 0, boostBar: 1, averageTireC: 95, hottestTireC: 110 });
    h.hooks.onFrame(coordinatorFrame('mph', { Gear: undefined, SpeedMetersPerSecond: undefined,
      Boost: undefined, TireTemp: [176, null, 212, 230] }), {});
    expect(h.state()).toMatchObject({ gear: null, speed: null, boostBar: null, averageTireC: null, hottestTireC: null });
    h.hooks.onFrame({ boost_psi: -14.5038, tire_temp_f: [32, 32, 32, 32] }, {});
    expect(h.state()).toMatchObject({ boostBar: -1, averageTireC: 0, hottestTireC: 0 });
  });
  it('consumes raw distance once, recovers only after stale packets, and starts each instance full', () => {
    const h = renderer('altezza_trd');
    const frame = (time: number, distance: number, overrides = {}) => coordinatorFrame('kmh',
      { TimestampMS: time, DistanceTraveled: distance, CarOrdinal: 1, ...overrides });
    expect(h.state().fuel).toBe(1);
    h.hooks.onFrame(frame(1000, 50000));
    h.hooks.onFrame({ ...frame(2000, 75000), distance_m: 99000 });
    expect(h.state().fuel).toBeCloseTo(.75);
    h.advance(1000);
    h.hooks.onFrame(frame(2000, 99999)); // replay cannot consume or keep it fresh
    expect(h.state().fuel).toBeCloseTo(.75);
    h.advance(16500);
    expect(h.state().fuel).toBeCloseTo(1);
    h.hooks.onFrame(frame(3000, 150000)); // reconnect gap establishes a baseline
    expect(h.state().fuel).toBe(1);
    h.hooks.onFrame(frame(4000, 200000));
    expect(h.state().fuel).toBeCloseTo(.5);
    h.hooks.onFrame(frame(5000, 0)); // distance reset
    h.hooks.onFrame(frame(6000, 1000, { CarOrdinal: 2 })); // car change
    expect(h.state().fuel).toBeCloseTo(.5);
    h.advance(17000);
    h.hooks.onFrame(frame(7000, 1000, { CarOrdinal: 2 }));
    h.advance(18000);
    h.hooks.onFrame(frame(8000, 1000, { CarOrdinal: 2 }));
    expect(h.state().fuel).toBeCloseTo(.5); // stationary live stream does not refill
    h.emit('message', { data: { type: 'hud:destroy' } });
    expect(h.timers.size).toBe(0);
    expect(renderer('altezza_trd').state().fuel).toBe(1);
  });
  it('handles packet counter wrap and clamps the independent reserve at empty and full', () => {
    const h = renderer('altezza_trd');
    const frame = (time: number, distance: number) => coordinatorFrame('kmh',
      { TimestampMS: time, DistanceTraveled: distance, CarOrdinal: 1 });
    h.hooks.onFrame(frame(4294967200, 0));
    h.hooks.onFrame(frame(100, 100000));
    expect(h.state().fuel).toBe(0);
    h.hooks.onFrame(frame(200, 200000));
    expect(h.state().fuel).toBe(0);
    h.advance(31500);
    expect(h.state().fuel).toBeCloseTo(.5);
    h.advance(61500);
    expect(h.state().fuel).toBe(1);
    h.emit('pagehide');
    expect(h.timers.size).toBe(0);
  });
  it.each(['chaser_jzx100', 'soarer_z20'])('maps %s printed RPM scale independently of car maximum', style => {
    const h = renderer(style);
    for (const maximum of [6000, 8000, 10000]) {
      for (const [rpm, ratio] of [[0, 0], [4000, .5], [6000, .75], [8000, 1], [10000, 1]]) {
        h.hooks.onFrame(coordinatorFrame('mph', { CurrentEngineRpm: rpm, EngineMaxRpm: maximum }), {});
        expect(h.ratio()).toBeCloseTo(ratio);
      }
    }
  });
  it('preserves Chaser switchable speed instead of imposing a native km/h contract', () => {
    const h = renderer('chaser_jzx100');
    const data = coordinatorFrame('mph');
    h.hooks.onFrame(data, {});
    expect(h.state().speed).toBeCloseTo(data.speed_mph);
  });
});
