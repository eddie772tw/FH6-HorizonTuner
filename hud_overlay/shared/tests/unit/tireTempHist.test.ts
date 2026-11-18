import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCorners } from '../../telemetry-cards/corner-card.js';

function createSurface(width = 240, height = 36) {
    const stack: Record<string, unknown>[] = [];
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, nonFinite: false };
    const track = (x: number, y: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) bounds.nonFinite = true;
        bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
    };
    const texts: string[] = [];
    const ctx: Record<string, any> = {
        shadowBlur: 3, shadowColor: '#abcdef', strokeStyle: '#123456', fillStyle: '#654321',
        lineWidth: 5, lineCap: 'round', font: '12px sans-serif', textAlign: 'end', textBaseline: 'alphabetic',
        save() { stack.push(snapshot()); }, restore() { Object.assign(ctx, stack.pop() || {}); },
        clearRect: () => {}, beginPath: () => {}, stroke: () => {}, fill: () => {},
        moveTo: track, lineTo: track,
        fillRect: (x: number, y: number, w: number, h: number) => { track(x, y); track(x + w, y + h); },
        arc: (x: number, y: number, r: number) => { track(x - r, y - r); track(x + r, y + r); },
        fillText: (text: string, x: number, y: number) => { texts.push(text); track(x, y); },
    };
    const snapshot = () => ({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline });
    const canvas = { width, height, clientWidth: width, clientHeight: height, getContext: () => ctx };
    return { canvas, ctx, bounds, texts, snapshot, stackDepth: () => stack.length };
}

const makeDomCache = (tCanvas: any) => ({ corners: { FL: { tCanvas }, FR: {}, RL: {}, RR: {} } });
const emptyMinMax = () => [{ min: null, max: null }, { min: null, max: null }, { min: null, max: null }, { min: null, max: null }];
afterEach(() => vi.unstubAllGlobals());

describe('Corner tire temperature histogram renderer', () => {
    it.each([1, 2, 3])('keeps bars, baseline, and temperature indicator inside bounds at DPR %s', dpr => {
        vi.stubGlobal('window', { devicePixelRatio: dpr });
        for (const [width, height] of [[10, 10], [48, 24], [240, 36]]) {
            const s = createSurface(width, height), domCache = makeDomCache(s.canvas);
            for (const temp of [80, 195, 290]) renderCorners({ temp_fl: temp }, false, false, true, [[], [], [], []], [[], [], [], []], emptyMinMax(), 0, domCache);
            expect(s.bounds.nonFinite).toBe(false);
            expect(s.bounds.minX).toBeGreaterThanOrEqual(0); expect(s.bounds.maxX).toBeLessThanOrEqual(s.canvas.width);
            expect(s.bounds.minY).toBeGreaterThanOrEqual(0); expect(s.bounds.maxY).toBeLessThanOrEqual(s.canvas.height);
        }
    });

    it('formats metric/imperial labels, isolates context state, and restores on fault', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(240, 36);
        const initial = s.snapshot();
        const domCache = makeDomCache(s.canvas);
        renderCorners({ temp_fl: 212, isMetric: true }, false, false, true, [[], [], [], []], [[], [], [], []], emptyMinMax(), 16, domCache);
        renderCorners({ temp_fl: 212, isMetric: false }, false, false, true, [[], [], [], []], [[], [], [], []], emptyMinMax(), 32, domCache);
        expect(s.canvas.width).toBe(480);
        expect(s.texts).toEqual(['100°C', '212°F']);
        expect(s.snapshot()).toEqual(initial);
        expect(s.stackDepth()).toBe(0);

        s.ctx.stroke = () => { throw new Error('simulated histogram failure'); };
        expect(() => renderCorners({ temp_fl: 185 }, false, false, true, [[], [], [], []], [[], [], [], []], emptyMinMax(), 48, domCache)).toThrow('simulated histogram failure');
        expect(s.snapshot()).toEqual(initial);
        expect(s.stackDepth()).toBe(0);
    });

    it('reuses 180-slot ring buffer, sanitizes non-finite temps, and skips null contexts', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(240, 36);
        const tireHist: any[][] = [[], [], [], []];
        renderCorners({ temp_fl: Number.NaN, temp_fr: Infinity }, false, false, true, tireHist, [[], [], [], []], emptyMinMax(), 0, makeDomCache(s.canvas));
        expect(tireHist[0][0].temp).toBe(0);
        expect(tireHist[1][0].temp).toBe(0);
        expect(s.texts).toEqual([]);

        for (let i = 1; i < 180; i++) renderCorners({ temp_fl: 150 + (i % 60) }, false, false, true, tireHist, [[], [], [], []], emptyMinMax(), i * 16, makeDomCache(s.canvas));
        const firstSlotRef = tireHist[0][0];
        renderCorners({ temp_fl: 205 }, false, false, true, tireHist, [[], [], [], []], emptyMinMax(), 2880, makeDomCache(s.canvas));
        expect(tireHist[0]).toHaveLength(180);
        expect(tireHist[0][0]).toBe(firstSlotRef);
        expect(tireHist[0][0].temp).toBe(205);
        expect(() => renderCorners({}, false, false, true, [[], [], [], []], [[], [], [], []], emptyMinMax(), 1, { corners: { FL: { tCanvas: { clientWidth: 0, clientHeight: 0, getContext: () => null } }, FR: {}, RL: {}, RR: {} } })).not.toThrow();
    });
});
