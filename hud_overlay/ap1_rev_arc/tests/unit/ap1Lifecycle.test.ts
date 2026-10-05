import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Standalone HUD modules are browser JavaScript.
import { createState } from '../../model.js';

function harness() {
  const source = readFileSync(resolve(process.cwd(), '../hud_overlay/ap1_rev_arc/controller.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');
  const listeners = new Map<string, (event?: any) => void>();
  const render = vi.fn();
  let hooks: any;
  let now = 0;
  const scheduled = new Map<number, (time: number) => void>();
  let id = 0;
  const container = { style: { setProperty: vi.fn(), display: '' }, classList: { add: vi.fn() }, querySelector: () => ({ complete: true, naturalWidth: 1440, addEventListener: vi.fn() }) };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: (type: string, cb: any) => listeners.set(type, cb),
    removeEventListener: (type: string) => listeners.delete(type),
    HUDCore: { registerStyle: (_id: string, next: any) => { hooks = next; }, init: vi.fn() },
  };
  let watchdog: (() => void) | null = null;
  new Function('window', 'document', 'createState', 'createRenderer', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval', source)(
    window, { getElementById: () => container }, createState, () => ({ render }), { now: () => now },
    (cb: (time: number) => void) => { scheduled.set(++id, cb); return id; }, (key: number) => scheduled.delete(key),
    (cb: () => void) => { watchdog = cb; return 1; }, () => { watchdog = null; },
  );
  return { hooks, render, container, listeners, scheduled, advance: (time: number) => { now = time; watchdog?.(); }, hasWatchdog: () => watchdog !== null };
}

describe('AP1 controller lifecycle', () => {
  it('clears live values after silence and restores advancing samples', () => {
    const h = harness();
    h.hooks.onFrame({ timestamp_ms: 1, speed_kmh: 150, rpm: 5000, maxRpm: 9000, gear: 4 }, {});
    expect(h.render.mock.lastCall?.[0].speedText).toBe('150');
    h.advance(2000);
    expect(h.render.mock.lastCall?.[0].status).toBe('SIGNAL LOST');
    h.hooks.onFrame({ timestamp_ms: 2, speed_kmh: 120, rpm: 4000, maxRpm: 9000, gear: 3 }, {});
    expect(h.render.mock.lastCall?.[0].speedText).toBe('120');
  });
  it('honors config and elements visibility with no invented startup data', () => {
    const h = harness();
    h.hooks.onInit({ elements: { showGauge: false }, effectiveUnits: { speed: 'mph' } });
    expect(h.container.style.display).toBe('none');
    expect(h.render.mock.lastCall?.[0].speedText).toBe('---');
    h.hooks.onElementsChange({ showGauge: true });
    expect(h.container.style.display).toBe('block');
  });
  it('cancels decorative animation and watchdog on destroy and ignores later frames', () => {
    const h = harness();
    h.hooks.onAnimate();
    expect(h.scheduled.size).toBeGreaterThan(0);
    h.listeners.get('message')?.({ data: { type: 'hud:destroy' } });
    expect(h.scheduled.size).toBe(0);
    expect(h.hasWatchdog()).toBe(false);
    const output = h.render.mock.lastCall?.[0];
    h.hooks.onFrame({ timestamp_ms: 3, speed_kmh: 150 }, {});
    h.hooks.onAnimate();
    expect(h.render.mock.lastCall?.[0]).toBe(output);
    expect(h.listeners.size).toBe(0);
  });
  it('does not let timestamp-less launcher standby abort the segment check', () => {
    const h = harness();
    h.hooks.onAnimate();
    h.hooks.onFrame({ speed_kmh: 0, rpm: 0, gear: 0 }, {});
    expect(h.scheduled.size).toBeGreaterThan(0);
    h.hooks.onFrame({ timestamp_ms: 1, speed_kmh: 0, rpm: 950, maxRpm: 9000, gear: 11 }, {});
    expect(h.scheduled.size).toBe(0);
    expect(h.render.mock.lastCall?.[0].gear).toBe('N');
  });
});
