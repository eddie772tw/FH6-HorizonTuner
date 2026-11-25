import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const scriptCode = [...readFileSync(resolve(process.cwd(), '../hud_overlay/gamepad_overlay/index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/gi)]
  .map(m => m[1]).find(s => s.includes("HUDCore.registerStyle('gamepad_overlay'"))!;

function mountGamepad(initialDpr = 1, glowIntensity?: number) {
  let w = 480, h = 380, widthWrites = 0;
  const stack: Array<{ shadowBlur: number; globalAlpha: number }> = [], blurs: number[] = [], texts: string[] = [], grads = new Set<object>(), listeners = new Map<string, Set<Function>>(), noop = () => {};
  const makeGrad = () => { const g = { addColorStop: noop }; grads.add(g); return g; };
  const ctx: Record<string, any> = {
    shadowColor: '', fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic', _shadowBlur: 0, globalAlpha: 1,
    set shadowBlur(v: number) { this._shadowBlur = v; if (v > 0) blurs.push(v); }, get shadowBlur() { return this._shadowBlur; },
    save() { stack.push({ shadowBlur: this._shadowBlur, globalAlpha: this.globalAlpha }); },
    restore() { const s = stack.pop(); if (s) { this._shadowBlur = s.shadowBlur; this.globalAlpha = s.globalAlpha; } },
    setTransform: vi.fn(), clearRect: noop, drawImage: noop, fillText: (t: string) => texts.push(t),
    beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, arc: noop, roundRect: noop, fill: noop, stroke: noop, translate: noop,
    createLinearGradient: makeGrad, createRadialGradient: makeGrad,
  };
  const canvas: Record<string, any> = { style: {}, get width() { return w; }, set width(v: number) { widthWrites += 1; w = v; }, get height() { return h; }, set height(v: number) { h = v; }, getContext: () => ctx, setAttribute: noop };
  const doc = { getElementById: (id: string) => (id === 'gamepadCanvas' ? canvas : id === 'gamepadContainer' ? { style: {}, parentElement: { style: {} } } : null) };
  let hooks: any;
  const win: Record<string, any> = {
    devicePixelRatio: initialDpr, _currentGlowIntensity: glowIntensity, location: { search: '' },
    addEventListener: (t: string, fn: Function) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t)!.add(fn); },
    removeEventListener: (t: string, fn: Function) => listeners.get(t)?.delete(fn),
    HUDCore: { registerStyle: (_: string, d: any) => { hooks = d; }, init: noop },
  };
  class MockImage { complete = true; naturalWidth = 370; }
  new Function('window', 'document', 'HUDCore', 'Image', scriptCode)(win, doc, win.HUDCore, MockImage);
  return { hooks, win, ctx, blurs, texts, grads, listeners, metrics: () => ({ w, h, widthWrites, stackDepth: stack.length }) };
}

describe('Gamepad Overlay HiDPI, gradient caching, glow scaling, and state isolation', () => {
  it('clamps HiDPI + zoom backing to [1, 3], avoids steady-state reallocs, and cleans up on destroy', () => {
    const g = mountGamepad(2), writesAfterInit = g.metrics().widthWrites;
    for (let i = 0; i < 4; i++) g.hooks.onFrame({ steer: i * 20, throttle: 0.5, brake: 0.2, gear: 3 });
    expect([g.metrics().w, g.metrics().h, g.metrics().widthWrites]).toEqual([960, 760, writesAfterInit]);
    g.hooks.onScale(2.0);
    expect([g.metrics().w, g.metrics().h]).toEqual([1440, 1140]);
    expect(g.listeners.get('resize')?.size).toBe(1);
    g.listeners.get('message')?.forEach(fn => fn({ data: { type: 'hud:destroy' } }));
    expect(g.listeners.get('resize')?.size).toBe(0);
    g.hooks.onScale(1.0);
    expect(() => g.hooks.onFrame({ steer: 10, gear: 4 })).not.toThrow();
    expect(g.metrics().w).toBe(1440);
  });
  it('reuses cached stick, trigger, and lightbar gradients with zero per-frame allocations', () => {
    const g = mountGamepad(1);
    g.hooks.onFrame({ steer: 40, throttle: 0.7, brake: 0.5, hand_brake: 200, gear: 3 });
    const xboxGrads = g.grads.size;
    for (let i = 0; i < 5; i++) g.hooks.onFrame({ steer: -60 + i * 30, throttle: i * 0.2, brake: 1 - i * 0.2, hand_brake: 255, gear: 4 });
    expect(g.grads.size).toBe(xboxGrads);
    g.win.switchController(1);
    const dualGrads = g.grads.size;
    expect(dualGrads).toBeGreaterThan(xboxGrads);
    for (let i = 0; i < 5; i++) g.hooks.onFrame({ steer: 50 - i * 25, throttle: 0.9 - i * 0.1, brake: i * 0.15, hand_brake: 255, gear: 0 });
    expect(g.grads.size).toBe(dualGrads);
  });
  it('scales shadowBlur proportionally with DPR * glowIntensity across Xbox and DualSense', () => {
    const g1 = mountGamepad(1, 1), g2 = mountGamepad(2, 1), g0 = mountGamepad(2, 0);
    for (const g of [g1, g2, g0]) { g.win.switchController(1); g.blurs.length = 0; g.hooks.onFrame({ steer: 64, throttle: 0.8, brake: 0.6, hand_brake: 255, gear: 4 }); }
    expect(Math.max(...g2.blurs)).toBe(Math.max(...g1.blurs) * 2);
    expect(g2.blurs).toEqual(expect.arrayContaining([24, 20, 16]));
    expect(g0.blurs).toEqual([]);
  });
  it('formats neutral/reverse gears, sanitizes non-finite inputs, and restores context on error', () => {
    const g = mountGamepad(1);
    g.ctx._shadowBlur = 17; g.ctx.globalAlpha = 0.35;
    g.hooks.onFrame({ steer: Number.NaN, throttle: Number.POSITIVE_INFINITY, brake: 0.2, gear: 11 });
    expect([g.texts.at(-1), g.ctx._shadowBlur, g.ctx.globalAlpha, g.metrics().stackDepth]).toEqual(['STEER: +0.0%  |  GEAR: N', 17, 0.35, 0]);
    g.hooks.onFrame({ steer: -127, gear: 0 });
    expect(g.texts.at(-1)).toBe('STEER: -100.0%  |  GEAR: R');
    g.ctx.drawImage = () => { throw new Error('simulated blit fault'); };
    expect(() => g.hooks.onFrame({ steer: 30, gear: 2 })).toThrow('simulated blit fault');
    expect([g.ctx._shadowBlur, g.ctx.globalAlpha, g.metrics().stackDepth]).toEqual([17, 0.35, 0]);
  });
});
