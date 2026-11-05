import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Run the checked-in renderer with a controlled clock. Assertions concern the
// displayed readings; no Canvas coordinates or drawing-call counts are contracts.
function renderer() {
  let hooks: any;
  let now = 0;
  let nextId = 0;
  let displayed: string[] = [];
  let canvasDisposed = false;
  const rafs = new Map<number, (time: number) => void>();
  const listeners = new Map<string, Set<(event: any) => void>>();
  const context = new Proxy({}, {
    get: (_target, key) => key === 'fillText' ? (text: unknown) => displayed.push(String(text))
      : key === 'clearRect' ? () => { if (canvasDisposed) throw new Error('Canvas disposed'); displayed = []; }
      : key === 'createLinearGradient' ? () => ({ addColorStop() {} })
      : key === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) })
      : () => {},
    set: () => true,
  });
  const images: any[] = [];
  const classes = new Set<string>();
  const canvas = { getContext: () => context };
  const container = { style: {}, classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) } };
  const scope: any = {
    document: { getElementById: (id: string) => id.endsWith('Canvas') ? canvas : container,
      createElement: () => canvas },
    HUDCore: { registerStyle: (_id: string, value: any) => { hooks = value; }, init() {},
      getAverageTireTemperatureC: () => 80 },
    HUDArtwork: { loadImage: () => {
      const image = { complete: true, naturalWidth: 800, naturalHeight: 300 };
      images.push(image); return image;
    }, watchCanvas: (_canvas: unknown, render: () => void) => render },
    performance: { now: () => now },
    addEventListener: (type: string, callback: (event: any) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(callback);
    },
    removeEventListener: (type: string, callback: (event: any) => void) => listeners.get(type)?.delete(callback),
    requestAnimationFrame: (callback: (time: number) => void) => { rafs.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id: number) => rafs.delete(id),
  };
  scope.window = scope;
  // This file has a single checked-in inline script after its shared script tags.
  const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');
  const start = html.indexOf('<script>') + '<script>'.length;
  const end = html.indexOf('</script>', start);
  if (start < '<script>'.length || end < start) throw new Error('Inline renderer missing');
  const source = html.slice(start, end).replace(/\}\)\(\);\s*$/, 'window.__reading = () => ({ ...telemetry }); })();');
  runInNewContext(readFileSync(resolve(import.meta.dirname, '../../../shared/artwork-effects.js'), 'utf8'), scope);
  runInNewContext(source, scope);
  return { hooks, display: () => [...displayed], state: () => scope.__reading(),
    pendingAnimations: () => rafs.size, classes,
    disposeCanvas: () => { canvasDisposed = true; },
    loadImages: () => { for (const image of images) image.onload?.(); },
    emit: (type: string, event?: any) => { for (const callback of listeners.get(type) || []) callback(event); },
    advance: (time: number) => {
    now = time;
    const callbacks = [...rafs.values()]; rafs.clear();
    for (const callback of callbacks) callback(now);
  } };
}

describe('mclaren_720s display-check lifecycle', () => {
  const frame = (speed: number, rpm = 3100) => ({ speed, speed_kmh: speed, rpm, gear: 4 });

  it('completes the manual sweep under continuous telemetry and restores the newest readings', () => {
    const h = renderer();
    h.hooks.onFrame(frame(77), {});
    h.hooks.onAnimate();
    for (let time = 100; time <= 1200; time += 100) {
      const previousDisplay = h.display();
      h.hooks.onFrame(frame(80 + time / 100), {});
      expect(h.display()).toEqual(previousDisplay); // Incoming live data does not interrupt the demo.
      h.advance(time);
      expect(h.pendingAnimations()).toBe(time < 1200 ? 1 : 0);
      if (time === 600) expect(h.state().rpm).toBeGreaterThan(7000);
    }
    expect(h.display()).toContain('92');
    expect(h.state().rpm).toBe(3100);
    const restored = h.state();
    h.advance(1500);
    expect(h.state()).toEqual(restored);
  });

  it('restarts only one sweep and restores accepted live state without another packet', () => {
    const h = renderer();
    h.hooks.onFrame(frame(77), {});
    const live = h.state();
    h.hooks.onAnimate(); h.advance(300);
    h.hooks.onAnimate(); h.advance(500);
    h.hooks.onAnimate();
    expect(h.pendingAnimations()).toBe(1);
    h.advance(1600);
    expect(h.pendingAnimations()).toBe(1);
    h.advance(1700);
    expect(h.pendingAnimations()).toBe(0);
    expect(h.state()).toEqual(live);
  });

  it.each(['pagehide', 'hud:destroy'])('cancels the sweep on %s and cannot restart after disposal', (event) => {
    const h = renderer();
    h.hooks.onAnimate(); h.advance(300);
    if (event === 'pagehide') h.emit(event);
    else h.emit('message', { data: { type: event } });
    expect(h.pendingAnimations()).toBe(0);
    const stopped = h.display();
    h.disposeCanvas();
    expect(() => h.hooks.onScale()).not.toThrow();
    expect(() => h.loadImages()).not.toThrow();
    h.advance(1500);
    h.hooks.onAnimate();
    h.hooks.onFrame(frame(88), {});
    expect(h.pendingAnimations()).toBe(0);
    expect(h.display()).toEqual(stopped);
  });

  it('preserves normalized live fields across partial packets and repeated sweeps', () => {
    const h = renderer();
    h.hooks.onFrame(frame(77, 2700), {});
    const live = h.state();
    h.hooks.onAnimate(); h.advance(300);
    h.hooks.onFrame({ rpm: 4200 }, {});
    h.hooks.onAnimate(); h.advance(500);
    h.hooks.onFrame({ speed: 88, speed_kmh: 88 }, {});
    h.advance(1500);
    expect(h.state().gear).toBe(live.gear);
    expect(h.state().maxRpm).toBe(live.maxRpm);
    expect(h.state().rpm).toBe(4200);
    expect(h.display()).toContain('88');
  });
  it('restores the initial baseline when no telemetry has arrived', () => {
    const h = renderer();
    const baseline = h.state();
    h.hooks.onAnimate(); h.advance(600); h.advance(1200);
    expect(h.pendingAnimations()).toBe(0);
    expect(h.state()).toEqual(baseline);
  });

  it('uses display state when resized or artwork loads during a sweep', () => {
    const h = renderer();
    h.hooks.onFrame(frame(77), {});
    h.hooks.onAnimate(); h.advance(600);
    const demo = h.display();
    h.hooks.onFrame(frame(88), {});
    h.hooks.onScale();
    expect(h.display()).toEqual(demo);
    h.loadImages();
    expect(h.display()).toEqual(demo);
    h.advance(1200);
    expect(h.display()).toContain('88');
  });

});
