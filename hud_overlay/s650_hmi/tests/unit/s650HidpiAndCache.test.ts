import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const baseFrame = { rpm: 5200, maxRpm: 8000, redlineRpm: 7200, speed_kmh: 140, speed_mph: 87, gear: 4 };
const contract = {
  canvas: { width: 1280, height: 480 }, defaultFrame: baseFrame,
  normalizeFrame: (d: unknown) => d, normalizeConfig: () => ({}),
  finiteNumber: (v: unknown, f: number) => (typeof v === 'number' ? v : f), clamp,
};
const tokens = { grid: { overlay: {} }, paletteFor: () => ({}) };

function loadModule(file: string, key: string, win: Record<string, unknown> = {}) {
  new Function('window', readFileSync(resolve(process.cwd(), '../hud_overlay/s650_hmi/assets', file), 'utf8'))(win);
  return win[key] as { create: (...args: any[]) => any };
}

describe('S650 HiDPI backing store, state isolation, and gradient cache', () => {
  it('scales backing store by DPR * hudScale clamped to [1, 3] without steady-state reallocations', () => {
    const win: Record<string, unknown> = { devicePixelRatio: 2 };
    const factory = loadModule('s650_frame.js', 'S650HmiFrame', win);
    let widthWrites = 0, w = 1280, h = 480;
    const canvas = { get width() { return w; }, set width(v: number) { widthWrites += 1; w = v; }, get height() { return h; }, set height(v: number) { h = v; } };
    const setTransform = vi.fn();
    const frame = factory.create({ canvas, ctx: { setTransform, save: () => {}, restore: () => {} }, container: null, contract, tokens, layouts: { render: () => {} } });

    frame.onFrame(baseFrame);
    frame.onFrame({ ...baseFrame, rpm: 5600 });
    expect([w, h, frame.view.pixelRatio, widthWrites]).toEqual([2560, 960, 2, 1]);
    expect(setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);

    frame.onScale(2);
    expect([w, h, frame.view.pixelRatio]).toEqual([3840, 1440, 3]);
    win.devicePixelRatio = Number.NaN;
    frame.onScale(0.5);
    expect([w, h, frame.view.pixelRatio]).toEqual([1280, 480, 1]);
  });

  it('isolates context state across frame renders and restores on render error', () => {
    const factory = loadModule('s650_frame.js', 'S650HmiFrame', { devicePixelRatio: 1 });
    const save = vi.fn(), restore = vi.fn();
    const ctx = { save, restore, setTransform: vi.fn(), shadowBlur: 18, globalAlpha: 0.4 };
    let seen = { shadowBlur: -1, globalAlpha: -1 };
    const frame = factory.create({
      canvas: { width: 1280, height: 480 }, ctx, container: null, contract, tokens,
      layouts: { render: () => { seen = { shadowBlur: ctx.shadowBlur, globalAlpha: ctx.globalAlpha }; throw new Error('boom'); } },
    });
    expect(() => frame.onFrame(baseFrame)).toThrow('boom');
    expect(seen).toEqual({ shadowBlur: 0, globalAlpha: 1 });
    expect([save.mock.calls.length, restore.mock.calls.length]).toEqual([1, 1]);
  });

  it('caches Heritage dial gradients across frames and scales shadowBlur by pixelRatio', () => {
    const blurs: number[] = [], noop = () => {};
    const makeGrad = () => ({ addColorStop: noop });
    const createLinearGradient = vi.fn(makeGrad), createRadialGradient = vi.fn(makeGrad);
    const ctx: Record<string, unknown> = {
      save: noop, restore: noop, beginPath: noop, arc: noop, fill: noop, stroke: noop,
      moveTo: noop, lineTo: noop, closePath: noop, translate: noop, rotate: noop, scale: noop, fillText: noop,
      createLinearGradient, createRadialGradient,
      set shadowBlur(v: number) { blurs.push(v); }, get shadowBlur() { return blurs[blurs.length - 1] ?? 0; },
    };
    const p = loadModule('s650_primitives.js', 'S650HmiPrimitives').create(ctx, { clamp });
    const pal = { primary: '#56FF72', secondary: '#98A0A8', danger: '#F1373F', warning: '#F5B841' };
    for (let i = 0; i < 3; i += 1) {
      p.drawHeritageDial({ pixelRatio: 2, typography: {} }, pal, 256, 250, 180, 0.5, { max: 80 });
      p.drawHeritageDial({ pixelRatio: 2, typography: {} }, pal, 1024, 250, 180, 0.4, { max: 300 });
    }
    expect([createLinearGradient.mock.calls.length, createRadialGradient.mock.calls.length]).toEqual([2, 2]);
    expect(blurs).toEqual(expect.arrayContaining([28, 10]));
    blurs.length = 0;
    p.drawFoxbodyDial({ pixelRatio: 2, foxbodyNightMode: true, typography: {} }, pal, 256, 250, 180, 0.5, {});
    expect(blurs).toEqual(expect.arrayContaining([28, 14]));
    blurs.length = 0;
    p.drawFoxbodyDial({ pixelRatio: 2, foxbodyNightMode: false, typography: {} }, pal, 256, 250, 180, 0.5, {});
    expect(blurs).not.toContain(14);
  });
});
