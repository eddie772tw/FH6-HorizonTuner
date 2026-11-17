import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCorners } from '../../telemetry-cards/corner-card.js';

function createSurface(width = 130, height = 90) {
    const stack: Record<string, unknown>[] = [];
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, arcDrawn: false };
    const track = (x: number, y: number) => {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
    };
    const ctx: Record<string, any> = {
        shadowBlur: 3, shadowColor: '#abcdef', strokeStyle: '#123456', fillStyle: '#654321',
        lineWidth: 5, lineCap: 'square', lineJoin: 'bevel',
        save() { stack.push({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, lineJoin: ctx.lineJoin }); },
        restore() { Object.assign(ctx, stack.pop() || {}); },
        clearRect: () => {}, fillRect: () => {}, beginPath: () => {}, stroke: () => {}, fill: () => {},
        moveTo: (x: number, y: number) => track(x, y),
        lineTo: (x: number, y: number) => track(x, y),
        arc: (x: number, y: number, r: number) => { bounds.arcDrawn = true; track(x - r, y - r); track(x + r, y + r); },
    };
    const snapshot = () => ({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, lineJoin: ctx.lineJoin });
    const canvas = { width, height, clientWidth: width, clientHeight: height, getContext: () => ctx };
    return { canvas, ctx, bounds, snapshot, stackDepth: () => stack.length };
}

function makeDomCache(wCanvas: any, primaryColor = '#33ddff') {
    const wrapper = { style: { getPropertyValue: (k: string) => (k === '--card-primary' ? primaryColor : '') } } as any;
    return { wrapper, corners: { FL: { wCanvas }, FR: {}, RL: {}, RR: {} } };
}

const emptyMinMax = () => [{ min: null, max: null }, { min: null, max: null }, { min: null, max: null }, { min: null, max: null }];

afterEach(() => vi.unstubAllGlobals());

describe('Corner suspension waveform renderer', () => {
    it('scales by DPR, caches primary color, draws single-sample pulse, and restores state on fault', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(130, 90);
        const initial = s.snapshot();
        const domCache = makeDomCache(s.canvas, '#ffaa00');
        const suspHist: any[][] = [[], [], [], []];

        renderCorners({ susp_fl: 0.96 }, true, false, false, [[], [], [], []], suspHist, emptyMinMax(), 16, domCache);
        expect(s.canvas.width).toBe(260);
        expect(s.canvas.height).toBe(180);
        expect(domCache.wrapper._cachedPrimaryColor).toBe('#ffaa00');
        expect(s.bounds.arcDrawn).toBe(true);
        expect(s.snapshot()).toEqual(initial);
        expect(s.stackDepth()).toBe(0);

        s.ctx.stroke = () => { throw new Error('simulated stroke failure'); };
        expect(() => renderCorners({ susp_fl: 0.5 }, true, false, false, [[], [], [], []], suspHist, emptyMinMax(), 32, domCache)).toThrow('simulated stroke failure');
        expect(s.snapshot()).toEqual(initial);
        expect(s.stackDepth()).toBe(0);
    });

    it('reuses 150-slot ring buffer, sanitizes non-finite travel, and keeps geometry inside canvas bounds', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(130, 90);
        const domCache = makeDomCache(s.canvas);
        const suspHist: any[][] = [[], [], [], []];

        renderCorners({ susp_fl: Number.NaN, susp_fr: Infinity }, true, false, false, [[], [], [], []], suspHist, emptyMinMax(), 0, domCache);
        expect(suspHist[0][0].travel).toBe(0);
        expect(suspHist[1][0].travel).toBe(0);

        for (let i = 1; i < 150; i++) {
            renderCorners({ susp_fl: i % 2 === 0 ? 1.2 : -0.3 }, true, false, false, [[], [], [], []], suspHist, emptyMinMax(), i * 16, domCache);
        }
        const firstSlotRef = suspHist[0][0];
        renderCorners({ susp_fl: 1.0 }, true, false, false, [[], [], [], []], suspHist, emptyMinMax(), 2400, domCache);

        expect(suspHist[0]).toHaveLength(150);
        expect(suspHist[0][0]).toBe(firstSlotRef);
        expect(suspHist[0][0].travel).toBe(1);
        expect(s.bounds.minX).toBeGreaterThanOrEqual(0);
        expect(s.bounds.maxX).toBeLessThanOrEqual(s.canvas.width);
        expect(s.bounds.minY).toBeGreaterThanOrEqual(0);
        expect(s.bounds.maxY).toBeLessThanOrEqual(s.canvas.height);
        expect(() => renderCorners({}, true, false, false, [[], [], [], []], [[], [], [], []], emptyMinMax(), 1, { corners: { FL: { wCanvas: { clientWidth: 0, clientHeight: 0, getContext: () => null } }, FR: {}, RL: {}, RR: {} } })).not.toThrow();
    });
});
