import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPowerTorque } from '../../telemetry-cards/power-torque.js';

function createSurface(width = 550, height = 80, opts: { throwOnFill?: boolean } = {}) {
    let depth = 0;
    const state = { globalAlpha: 1, shadowBlur: 0, shadowColor: 'transparent', lineWidth: 1, fillStyle: '#000', strokeStyle: '#000' };
    const stack: Array<typeof state> = [];
    const noop = () => {};
    const ctx = Object.assign(state, {
        save: () => { depth++; stack.push({ ...state }); },
        restore: () => { depth--; Object.assign(state, stack.pop() || {}); },
        clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop,
        fillRect: (x: number, y: number, w: number, h: number) => {
            if (![x, y, w, h].every(Number.isFinite)) throw new Error('non-finite fillRect');
            if (opts.throwOnFill) throw new Error('render fault');
        },
        arc: (x: number, y: number, r: number) => {
            if (![x, y, r].every(Number.isFinite)) throw new Error('non-finite arc');
        },
        fill: noop,
    });
    const canvas = { width, height, clientWidth: width, clientHeight: height, getContext: () => ctx };
    return { canvas, ctx, getDepth: () => depth };
}

afterEach(() => vi.unstubAllGlobals());

describe('Power & Torque scatter renderer', () => {
    it('scales backing dimensions by DPR and preserves balanced canvas state', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const { canvas, ctx, getDepth } = createSurface(550, 80);
        const wrapper = { style: { getPropertyValue: (k: string) => (k === '--card-contrast' ? '#ff3366' : '') } } as any;
        const hist: any[] = [];

        renderPowerTorque({ rpm: 5252, power: 380, torque: 380, maxRpm: 8000, sessionMaxima: { maxHP: 420, maxTQ: 400 } }, hist, 100, { ptCanvas: canvas, wrapper });

        expect(canvas.width).toBe(1100);
        expect(canvas.height).toBe(160);
        expect(wrapper._cachedContrastColor).toBe('#ff3366');
        expect(getDepth()).toBe(0);
        expect(ctx.globalAlpha).toBe(1);
        expect(ctx.shadowBlur).toBe(0);
    });

    it('restores canvas state via try/finally even when a draw call throws', () => {
        vi.stubGlobal('window', { devicePixelRatio: 1 });
        const { canvas, ctx, getDepth } = createSurface(550, 80, { throwOnFill: true });
        expect(() => renderPowerTorque({ rpm: 4000, power: 200, torque: 260 }, [], 10, { ptCanvas: canvas })).toThrow('render fault');
        expect(getDepth()).toBe(0);
        expect(ctx.globalAlpha).toBe(1);
    });

    it('reuses 300-slot ring buffer in-place without growing or allocating past capacity', () => {
        vi.stubGlobal('window', { devicePixelRatio: 1 });
        const { canvas } = createSurface(550, 80);
        const hist: any[] = [];
        for (let i = 0; i < 300; i++) renderPowerTorque({ rpm: 3000 + i * 10, power: 250, torque: 300 }, hist, i, { ptCanvas: canvas });
        const firstSlotRef = hist[0];

        renderPowerTorque({ rpm: 7500, power: 480, torque: 410, maxRpm: 8500 }, hist, 301, { ptCanvas: canvas });
        expect(hist.length).toBe(300);
        expect(hist[0]).toBe(firstSlotRef);
        expect(hist[0].rpm).toBe(7500);
    });

    it('guards against non-finite telemetry, zero maxRpm, and missing canvas contexts', () => {
        vi.stubGlobal('window', { devicePixelRatio: 1.5 });
        const { canvas } = createSurface(550, 80);
        const hist: any[] = [];
        expect(() => renderPowerTorque({ rpm: NaN, power: -20, torque: Infinity, maxRpm: 0, sessionMaxima: { maxHP: NaN, maxTQ: -5 } }, hist, 1, { ptCanvas: canvas })).not.toThrow();
        expect(hist[0]).toEqual({ rpm: 0, power: 0, torque: 0, time: 1 });
        expect(() => renderPowerTorque(null as any, [], 2, { ptCanvas: { clientWidth: 0, clientHeight: 0, getContext: () => null } })).not.toThrow();
    });
});
