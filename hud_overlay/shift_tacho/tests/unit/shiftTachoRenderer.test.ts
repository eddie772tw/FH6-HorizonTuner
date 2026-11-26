import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const scriptCode = [...readFileSync(resolve(process.cwd(), '../hud_overlay/shift_tacho/index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/gi)]
  .map(m => m[1]).find(s => s.includes("HUDCore.registerStyle('shift_tacho'"))!;

function mountShiftTacho(initialDpr = 1, glowIntensity?: number) {
  let w = 440, h = 280, widthWrites = 0, rafId = 0;
  const stack: Array<{ shadowBlur: number; globalAlpha: number }> = [], blurs: number[] = [], grads = new Set<object>(), noop = () => {};
  const draws: Array<{ text: string; x: number; y: number; align: string }> = [], listeners = new Map<string, Set<Function>>(), rafs = new Map<number, Function>();
  const ctx: Record<string, any> = {
    shadowColor: '', fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic', _shadowBlur: 0, globalAlpha: 1,
    set shadowBlur(v: number) { this._shadowBlur = v; if (v > 0) blurs.push(v); }, get shadowBlur() { return this._shadowBlur; },
    save() { stack.push({ shadowBlur: this._shadowBlur, globalAlpha: this.globalAlpha }); },
    restore() { const s = stack.pop(); if (s) { this._shadowBlur = s.shadowBlur; this.globalAlpha = s.globalAlpha; } },
    setTransform: vi.fn(), clearRect: noop, fillRect: noop, strokeRect: noop, drawImage: noop, beginPath: noop, arc: noop, fill: noop,
    fillText(t: string, x: number, y: number) { draws.push({ text: String(t), x, y, align: this.textAlign }); },
    createLinearGradient: () => { const g = { addColorStop: noop }; grads.add(g); return g; },
  };
  const canvas: Record<string, any> = { style: {}, get width() { return w; }, set width(v: number) { widthWrites += 1; w = v; }, get height() { return h; }, set height(v: number) { h = v; }, getContext: () => ctx };
  const doc = { getElementById: (id: string) => (id === 'shiftCanvas' ? canvas : id === 'shiftTachoContainer' ? { style: {} } : null), fonts: null };
  let hooks: any;
  const win: Record<string, any> = {
    devicePixelRatio: initialDpr, _currentGlowIntensity: glowIntensity,
    addEventListener: (t: string, fn: Function) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(fn); },
    removeEventListener: (t: string, fn: Function) => listeners.get(t)?.delete(fn),
    HUDCore: { registerStyle: (_: string, d: any) => { hooks = d; }, init: noop },
  };
  class MockImage { naturalWidth = 32; onload: (() => void) | null = null; set src(_v: string) { this.onload?.(); } }
  new Function('window', 'document', 'HUDCore', 'Image', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', scriptCode)(
    win, doc, win.HUDCore, MockImage, { now: () => 1000 }, (fn: Function) => (rafs.set(++rafId, fn), rafId), (id: number) => { rafs.delete(id); },
  );
  return { hooks, ctx, blurs, draws, grads, listeners, rafs, metrics: () => ({ w, h, widthWrites, stackDepth: stack.length }) };
}

describe('Shift Tacho HiDPI, gradient caching, glow scaling, alignment, and lifecycle', () => {
  it('clamps HiDPI + zoom backing to [1, 3], avoids steady-state reallocs, and cleans up on destroy', () => {
    const s = mountShiftTacho(2), writesAfterInit = s.metrics().widthWrites;
    for (let i = 0; i < 4; i++) s.hooks.onFrame({ rpm: 3000 + i * 500, max_rpm: 8000, speed_kmh: 90 + i * 10, gear: 3 });
    expect([s.metrics().w, s.metrics().h, s.metrics().widthWrites]).toEqual([880, 560, writesAfterInit]);
    s.hooks.onScale(2.0); expect([s.metrics().w, s.metrics().h, s.listeners.get('resize')?.size]).toEqual([1320, 840, 1]);
    s.listeners.get('message')?.forEach(fn => fn({ data: { type: 'hud:destroy' } })); expect(s.listeners.get('resize')?.size).toBe(0);
    s.hooks.onScale(1.0); expect(() => s.hooks.onFrame({ rpm: 4000, gear: 4 })).not.toThrow(); expect(s.metrics().w).toBe(1320);
  });
  it('keeps rendering after a persisted pagehide and cancels sweep on non-persisted pagehide', () => {
    const s = mountShiftTacho(1);
    s.listeners.get('pagehide')?.forEach(fn => fn({ persisted: true }));
    s.hooks.onFrame({ rpm: 2500, speed_kmh: 88, gear: 4 }); expect(s.draws.map(d => d.text)).toContain('88');
    s.hooks.onAnimate(); expect(s.rafs.size).toBe(1);
    s.listeners.get('pagehide')?.forEach(fn => fn({ persisted: false })); expect(s.rafs.size).toBe(0);
    s.hooks.onFrame({ rpm: 3000, speed_kmh: 105, gear: 5 }); expect(s.draws.map(d => d.text)).not.toContain('105');
  });
  it('reuses cached gear-box gradient and scales shadowBlur with DPR * glowIntensity', () => {
    const s1 = mountShiftTacho(1, 1), s2 = mountShiftTacho(2, 1), s0 = mountShiftTacho(2, 0);
    for (let i = 0; i < 5; i++) s1.hooks.onFrame({ rpm: 3000 + i * 700, max_rpm: 8000, speed_kmh: 100 + i * 20, gear: 4 });
    expect(s1.grads.size).toBe(1);
    for (const s of [s1, s2, s0]) { s.blurs.length = 0; s.hooks.onFrame({ rpm: 7600, max_rpm: 8000, speed_kmh: 240, gear: 5 }); }
    expect(Math.max(...s2.blurs)).toBe(Math.max(...s1.blurs) * 2);
    expect([s2.blurs, s0.blurs]).toEqual([expect.arrayContaining([8, 16]), []]);
  });
  it('separates speed/unit alignments, formats gears/units, sanitizes inputs, and restores context on error', () => {
    const s = mountShiftTacho(1);
    s.ctx._shadowBlur = 17; s.ctx.globalAlpha = 0.35;
    s.hooks.onFrame({ rpm: Number.NaN, max_rpm: 0, speed_kmh: 238, speed_mph: 148, gear: 11, displayUnits: { speed: 'mph' } });
    const speedD = s.draws.find(d => d.text === '148')!, unitD = s.draws.find(d => d.text === 'MPH')!;
    expect([speedD.align, unitD.align, unitD.x > speedD.x, s.draws.some(d => d.text === 'N')]).toEqual(['right', 'left', true, true]);
    expect([s.ctx._shadowBlur, s.ctx.globalAlpha, s.metrics().stackDepth]).toEqual([17, 0.35, 0]);
    s.draws.length = 0; s.hooks.onFrame({ rpm: 1000, speed_kmh: Number.POSITIVE_INFINITY, gear: 0 }, { isMetric: true });
    expect(s.draws.map(d => d.text)).toEqual(expect.arrayContaining(['R', '0', 'KM/H']));
    s.ctx.drawImage = () => { throw new Error('simulated blit fault'); };
    expect(() => s.hooks.onFrame({ rpm: 6500, speed_kmh: 180, gear: 4 })).toThrow('simulated blit fault');
    expect([s.ctx._shadowBlur, s.ctx.globalAlpha, s.metrics().stackDepth]).toEqual([17, 0.35, 0]);
  });
});
