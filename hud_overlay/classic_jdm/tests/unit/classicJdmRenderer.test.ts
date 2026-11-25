import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const hudDir = resolve(process.cwd(), '../hud_overlay/classic_jdm');
const scriptCode = [...readFileSync(resolve(hudDir, 'index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(m => m[1]).find(s => s.includes("HUDCore.registerStyle('classic_jdm'"))!;
const modelCode = readFileSync(resolve(hudDir, 'classic-jdm-model.js'), 'utf8');

function mountCluster(initialDpr = 1) {
  let w = 800, h = 440, widthWrites = 0;
  const stack: Array<{ shadowBlur: number; globalAlpha: number }> = [], blurs: number[] = [], listeners = new Map<string, Set<Function>>(), noop = () => {};
  const grad = () => ({ addColorStop: noop });
  const ctx: Record<string, any> = {
    shadowColor: '', fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic', _shadowBlur: 0, globalAlpha: 1,
    set shadowBlur(v: number) { this._shadowBlur = v; if (v > 0) blurs.push(v); }, get shadowBlur() { return this._shadowBlur; },
    save() { stack.push({ shadowBlur: this._shadowBlur, globalAlpha: this.globalAlpha }); },
    restore() { const s = stack.pop(); if (s) { this._shadowBlur = s.shadowBlur; this.globalAlpha = s.globalAlpha; } },
    setTransform: vi.fn(), clearRect: noop, fillRect: noop, strokeRect: noop, drawImage: noop, fillText: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, arc: noop, fill: noop, stroke: noop,
    translate: noop, rotate: noop, transform: noop, createLinearGradient: grad, createRadialGradient: grad,
  };
  const canvas: Record<string, any> = { style: {}, get width() { return w; }, set width(v: number) { widthWrites += 1; w = v; }, get height() { return h; }, set height(v: number) { h = v; }, getContext: () => ctx, addEventListener: noop };
  const doc = { getElementById: (id: string) => (id === 'classicJdmCanvas' ? canvas : id === 'classicJdmContainer' ? { classList: { add: noop, remove: noop }, style: {} } : null), createElement: () => ({ width: 0, height: 0, getContext: () => ({ ...ctx, setTransform: noop }) }), fonts: null };
  let hooks: any;
  const win: Record<string, any> = {
    devicePixelRatio: initialDpr, _currentHudScale: 1, performance: { now: () => 1000 }, requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    addEventListener: (t: string, fn: Function) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(fn); },
    removeEventListener: (t: string, fn: Function) => listeners.get(t)?.delete(fn),
    HUDCore: { registerStyle: (_: string, d: any) => { hooks = d; }, init: noop },
  };
  new Function('window', 'ClassicJdmModel', modelCode)(win, {});
  new Function('window', 'document', 'HUDCore', 'performance', 'requestAnimationFrame', scriptCode)(win, doc, win.HUDCore, win.performance, win.requestAnimationFrame);
  return { hooks, win, ctx, blurs, listeners, metrics: () => ({ w, h, widthWrites, stackDepth: stack.length }) };
}

describe('Classic JDM Canvas HiDPI, glow scaling, and state isolation', () => {
  it('syncs HiDPI + zoom backing store clamped to [1, 3], avoids steady-state reallocs, and cleans up resize on pagehide', () => {
    const c = mountCluster(2);
    c.hooks.onInit({ classicJdmTachStyle: 'defi', classicJdmShowTriple: true });
    const writesAfterInit = c.metrics().widthWrites;
    for (let i = 0; i < 4; i++) c.hooks.onFrame({ rpm: 6000 + i * 200, max_rpm: 11000, speed_kmh: 120, gear: 10 }, { isMetric: true });
    expect([c.metrics().w, c.metrics().h, c.metrics().widthWrites]).toEqual([1600, 880, writesAfterInit]);

    c.win._currentHudScale = 2.0;
    c.hooks.onScale(2.0);
    expect([c.metrics().w, c.metrics().h]).toEqual([2400, 1320]);
    expect(c.listeners.get('resize')?.size).toBe(1);
    c.listeners.get('pagehide')?.forEach(fn => fn());
    expect(c.listeners.get('resize')?.size).toBe(0);
  });

  it('scales shadowBlur proportionally with DPR across TRD and Defi modes including Shift Pod and 7-segment LED', () => {
    const c1 = mountCluster(1), c2 = mountCluster(2);
    for (const c of [c1, c2]) {
      c.hooks.onInit({ classicJdmTachStyle: 'defi', redlineRpm: 9000 });
      c.blurs.length = 0;
      c.hooks.onFrame({ rpm: 9500, max_rpm: 11000, speed_kmh: 180, gear: 10 }, { isMetric: true });
    }
    expect(Math.max(...c2.blurs)).toBe(Math.max(...c1.blurs) * 2);
    expect(c2.blurs).toEqual(expect.arrayContaining([20, 36, 8, 6, 4]));

    c2.hooks.onInit({ classicJdmTachStyle: 'trd', redlineRpm: 9000 });
    c2.blurs.length = 0;
    c2.hooks.onFrame({ rpm: 9500, max_rpm: 11000, speed_kmh: 140, gear: 'R' }, { isMetric: true });
    expect(c2.blurs).toEqual(expect.arrayContaining([16, 20, 8]));
  });

  it('isolates context state symmetrically and restores on render error', () => {
    const c = mountCluster(1);
    c.ctx._shadowBlur = 17; c.ctx.globalAlpha = 0.35;
    c.hooks.onFrame({ rpm: 4000, max_rpm: 9000, speed_kmh: 90, gear: 11 }, { isMetric: true });
    expect([c.ctx._shadowBlur, c.ctx.globalAlpha, c.metrics().stackDepth]).toEqual([17, 0.35, 0]);
    c.ctx.drawImage = () => { throw new Error('simulated blit fault'); };
    expect(() => c.hooks.onFrame({ rpm: 4500, max_rpm: 9000, speed_kmh: 100, gear: 3 }, { isMetric: true })).toThrow('simulated blit fault');
    expect([c.ctx._shadowBlur, c.ctx.globalAlpha, c.metrics().stackDepth]).toEqual([17, 0.35, 0]);
  });
});
