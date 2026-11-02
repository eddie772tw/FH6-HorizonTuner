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
    HUDCore: { registerStyle: (_name: string, value: any) => { hooks = value; }, init: () => {}, getAverageTireTemperatureC: () => 100 },
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

describe('AP1 native renderer telemetry and lifecycle', () => {
  it('uses native km/h with mph preference', () => {
    const h = renderer('ap1_rev_arc');
    h.hooks.onFrame(coordinatorFrame('mph'), {});
    expect(h.state().speed).toBeCloseTo(100);
    expect(h.attributes['aria-label']).toContain('100 km/h');
  });
  it('clears frozen source timestamps even when frames keep arriving, then recovers', () => {
    const h = renderer('ap1_rev_arc');
    const data = coordinatorFrame('mph');
    h.hooks.onFrame(data, {});
    h.advance(1500);
    h.hooks.onFrame(data, {});
    expect(h.state().status).toBe('SIGNAL LOST');
    expect(h.state().live).toBe(false);
    expect(h.state().rpm).toBe(0);
    expect(h.attributes['aria-label']).not.toContain('4000');
    h.hooks.onFrame(coordinatorFrame('mph', { TimestampMS: 1001 }), {});
    expect(h.state().live).toBe(true);
    expect(h.state().speed).toBeCloseTo(100);
  });
  it('clears values when transport stops without receiving another frame', () => {
    const h = renderer('ap1_rev_arc');
    h.hooks.onFrame(coordinatorFrame('kmh'), {});
    h.advance(2000);
    expect(h.attributes['aria-label']).toContain('SIGNAL LOST');
    expect(h.state().speed).toBe(0);
  });
  it.each([
    [{ IsRaceOn: 0 }, {}, 'SESSION PAUSED'],
    [{ error: 'upstream failure' }, {}, 'DATA ERROR'],
    [{ success: false }, {}, 'DATA ERROR'],
    [{}, { success: false }, 'DATA ERROR'],
  ])('clears paused or erroneous telemetry', (overrides, payload, status) => {
    const h = renderer('ap1_rev_arc');
    h.hooks.onFrame(coordinatorFrame('kmh'), {});
    h.hooks.onFrame(coordinatorFrame('kmh', overrides), payload);
    expect(h.state().status).toBe(status);
    expect(h.state().speed).toBe(0);
    expect(h.state().rpm).toBe(0);
    expect(h.state().live).toBe(false);
  });
  it('advances its clock without a telemetry callback, even while paused', () => {
    const h = renderer('ap1_rev_arc');
    h.hooks.onFrame(coordinatorFrame('kmh', { IsRaceOn: 0 }), {});
    expect(h.state().clockText).toBe('07:00');
    h.advance(120000);
    expect(h.state().clockText).toBe('07:02');
    expect(h.attributes['aria-label']).toContain('07:02');
  });
  it('does not invent startup readings, and tolerates timestamp wraparound', () => {
    const h = renderer('ap1_rev_arc');
    expect(h.state().live).toBe(false);
    expect(h.attributes['aria-label']).toContain('WAITING FOR DATA');
    h.hooks.onFrame(coordinatorFrame('kmh', { TimestampMS: 4294967295 }), {});
    h.advance(1000);
    h.hooks.onFrame(coordinatorFrame('kmh', { TimestampMS: 0 }), {});
    expect(h.state().live).toBe(true);
  });
  it('keeps the display check through live frames but cancels it for invalid telemetry', () => {
    const h = renderer('ap1_rev_arc');
    h.hooks.onFrame(coordinatorFrame('kmh'), {});
    h.hooks.onAnimate();
    h.hooks.onFrame(coordinatorFrame('kmh', { TimestampMS: 1000 }), {});
    expect(h.rafs.size).toBe(1);
    h.hooks.onFrame(coordinatorFrame('kmh', { TimestampMS: 1001 }), {});
    expect(h.rafs.size).toBe(1);
    expect(h.state().status).toBe('DISPLAY CHECK');
    h.hooks.onFrame(coordinatorFrame('kmh', { TimestampMS: 1002, IsRaceOn: 0 }), {});
    expect(h.rafs.size).toBe(0);
    expect(h.state().status).toBe('SESSION PAUSED');
  });
  it.each(['pagehide', 'hud:destroy'])('releases timer and animation on %s', type => {
    const h = renderer('ap1_rev_arc');
    h.hooks.onAnimate();
    if (type === 'pagehide') h.emit(type);
    else h.emit('message', { data: { type } });
    expect(h.timers.size).toBe(0);
    expect(h.rafs.size).toBe(0);
    const before = { ...h.state() };
    h.hooks.onFrame(coordinatorFrame('kmh'), {});
    h.hooks.onAnimate();
    expect(h.state()).toEqual(before);
  });
});
