import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptCode = [...readFileSync(resolve(process.cwd(), '../hud_overlay/fm4ui/index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1]).find((s) => s.includes("HUDCore.registerStyle('fm4_re'"))!;

function mountFm4(initialDpr = 1, glowIntensity?: number, fontPromise?: Promise<unknown>) {
  let w = 270, h = 270, widthWrites = 0, dialDraws = 0, offscreenCanvases = 0, timerId = 0, rafId = 0, now = 1000, hooks: any;
  const stack: Array<{ shadowBlur: number; globalAlpha: number }> = [], blurs: number[] = [], texts: string[] = [];
  const listeners = new Map<string, Set<Function>>(), rafs = new Map<number, Function>(), timers = new Map<number, Function>(), noop = () => {};
  const makeCtx = (isDial: boolean) => ({
    shadowColor: '', fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic', _shadowBlur: 0, globalAlpha: 1,
    set shadowBlur(v: number) { this._shadowBlur = v; if (!isDial && v > 0) blurs.push(v); }, get shadowBlur() { return this._shadowBlur; },
    save() { stack.push({ shadowBlur: this._shadowBlur, globalAlpha: this.globalAlpha }); },
    restore() { const s = stack.pop(); if (s) { this._shadowBlur = s.shadowBlur; this.globalAlpha = s.globalAlpha; } },
    setTransform: noop, clearRect: isDial ? () => { dialDraws += 1; } : noop, drawImage: noop, fillText: isDial ? noop : (t: string) => texts.push(String(t)),
    beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, arc: noop, fill: noop, stroke: noop, translate: noop, rotate: noop,
  });
  const ctx = makeCtx(false), dialCtx = makeCtx(true);
  const canvas: Record<string, any> = { style: {}, get width() { return w; }, set width(v: number) { widthWrites += 1; w = v; }, get height() { return h; }, set height(v: number) { h = v; }, getContext: () => ctx };
  const doc: Record<string, any> = {
    getElementById: (id: string) => (id === 'fm4_reCanvas' ? canvas : id === 'fm4_reContainer' ? { style: {} } : null),
    createElement: (tag: string) => (tag === 'canvas' ? (offscreenCanvases += 1, { width: 0, height: 0, getContext: () => dialCtx }) : null),
    fonts: fontPromise ? { load: () => fontPromise } : null,
  };
  const win: Record<string, any> = {
    devicePixelRatio: initialDpr, _currentGlowIntensity: glowIntensity, HUDCore: { registerStyle: (_: string, d: any) => { hooks = d; }, init: noop },
    addEventListener: (t: string, fn: Function) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(fn); },
    removeEventListener: (t: string, fn: Function) => listeners.get(t)?.delete(fn),
  };
  class MockImage { complete = true; naturalWidth = 270; onload: (() => void) | null = null; set src(_v: string) { this.onload?.(); } }
  new Function('window', 'document', 'HUDCore', 'Image', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', scriptCode)(
    win, doc, win.HUDCore, MockImage, { now: () => now }, (fn: Function) => (rafs.set(++rafId, fn), rafId), (id: number) => { rafs.delete(id); }, (fn: Function) => (timers.set(++timerId, fn), timerId), (id: number) => { timers.delete(id); },
  );
  return { hooks, ctx, blurs, texts, listeners, rafs, timers, advance: (t: number) => { now = t; const fns = [...rafs.values()]; rafs.clear(); fns.forEach((f) => f(t)); }, metrics: () => ({ w, h, widthWrites, dialDraws, offscreenCanvases, stackDepth: stack.length }) };
}

describe('FM4 UI HiDPI dial cache, smooth sweep, glow scaling, and lifecycle', () => {
  it('clamps HiDPI + zoom backing to [1, 3], avoids steady-state reallocs, and cleans up on destroy', () => {
    const f = mountFm4(2), writesAfterInit = f.metrics().widthWrites;
    for (let i = 0; i < 4; i++) f.hooks.onFrame({ rpm: 2500 + i * 750, max_rpm: 8000, speed_kmh: 90 + i * 10, gear: 3 });
    expect([f.metrics().w, f.metrics().h, f.metrics().widthWrites, f.timers.size]).toEqual([540, 540, writesAfterInit, 0]);
    f.hooks.onScale(2.0); expect([f.metrics().w, f.metrics().h, f.listeners.get('resize')?.size]).toEqual([810, 810, 1]);
    f.hooks.onAnimate(); expect(f.rafs.size).toBe(1);
    f.listeners.get('message')?.forEach((fn) => fn({ data: { type: 'hud:destroy' } }));
    expect([f.listeners.get('resize')?.size, f.rafs.size]).toEqual([0, 0]);
    f.hooks.onScale(1.0); expect(() => f.hooks.onFrame({ rpm: 4000, gear: 4 })).not.toThrow(); expect(f.metrics().w).toBe(810);
  });
  it('reuses offscreen dial cache across live frames and invalidates on band, zoom, or font readiness', async () => {
    let resolveFont!: () => void; const fontReady = new Promise<void>((r) => { resolveFont = r; });
    const f = mountFm4(1, 1, fontReady), initDraws = f.metrics().dialDraws;
    for (let i = 0; i < 6; i++) f.hooks.onFrame({ rpm: 1500 + i * 900, max_rpm: 8500, speed_kmh: 80 + i * 15, gear: 4 });
    expect([f.metrics().offscreenCanvases, f.metrics().dialDraws]).toEqual([1, initDraws]);
    f.hooks.onFrame({ rpm: 14000, max_rpm: 17500, speed_kmh: 260, gear: 6 }); expect(f.metrics().dialDraws).toBe(initDraws + 1);
    f.hooks.onScale(1.5); expect(f.metrics().dialDraws).toBe(initDraws + 2);
    resolveFont(); await fontReady; await Promise.resolve(); expect(f.metrics().dialDraws).toBe(initDraws + 3);
  });
  it('keeps rendering after persisted pagehide, stops on non-persisted pagehide, and scales shadowBlur', () => {
    const f1 = mountFm4(1, 1), f2 = mountFm4(2, 1), f0 = mountFm4(2, 0);
    for (const f of [f1, f2, f0]) { f.blurs.length = 0; f.hooks.onFrame({ rpm: 8200, max_rpm: 8500, speed_kmh: 245, gear: 5 }); }
    expect([Math.max(...f1.blurs), Math.max(...f2.blurs), Math.max(...f0.blurs)]).toEqual([8, 16, 8]);
    f1.listeners.get('pagehide')?.forEach((fn) => fn({ persisted: true })); f1.hooks.onFrame({ rpm: 3200, speed_kmh: 112, gear: 4 });
    expect(f1.texts).toContain('112'); f1.hooks.onAnimate(); expect(f1.rafs.size).toBe(1);
    f1.listeners.get('pagehide')?.forEach((fn) => fn({ persisted: false })); expect(f1.rafs.size).toBe(0);
    f1.hooks.onFrame({ rpm: 4000, speed_kmh: 140, gear: 5 }); expect(f1.texts).not.toContain('140');
  });
  it('handles MPH/zero speed, formats gears, sanitizes inputs, restores live telemetry after sweep, and guards ctx', () => {
    const f = mountFm4(1); f.ctx._shadowBlur = 17; f.ctx.globalAlpha = 0.35;
    f.hooks.onFrame({ rpm: Number.NaN, max_rpm: 0, speed_kmh: 0, speed: 99, gear: 11, displayUnits: { speed: 'mph' } });
    expect([f.texts, f.ctx._shadowBlur, f.ctx.globalAlpha, f.metrics().stackDepth]).toEqual([expect.arrayContaining(['N', '0', 'MPH']), 17, 0.35, 0]);
    f.hooks.onAnimate(); f.advance(1600); f.hooks.onFrame({ rpm: 4500, speed_kmh: 160, speed_mph: 99, gear: 0, displayUnits: { speed: 'mph' } });
    f.advance(2300); expect(f.texts).toEqual(expect.arrayContaining(['R', '99', 'MPH']));
    f.texts.length = 0; f.hooks.onFrame({ rpm: 1000, speed_kmh: Number.POSITIVE_INFINITY, gear: Number.NaN }, { isMetric: true });
    expect(f.texts).toEqual(expect.arrayContaining(['N', '0', 'KM/H']));
    f.ctx.drawImage = () => { throw new Error('simulated blit fault'); };
    expect(() => f.hooks.onFrame({ rpm: 6500, speed_kmh: 180, gear: 4 })).toThrow('simulated blit fault');
    expect([f.ctx._shadowBlur, f.ctx.globalAlpha, f.metrics().stackDepth]).toEqual([17, 0.35, 0]);
  });
});
