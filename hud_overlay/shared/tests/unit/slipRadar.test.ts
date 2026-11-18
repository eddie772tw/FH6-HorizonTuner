import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCorners } from '../../telemetry-cards/corner-card.js';

function createSurface(width = 76, height = 76) {
    const stack: Record<string, unknown>[] = [];
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, nonFinite: false };
    const track = (x: number, y: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) bounds.nonFinite = true;
        bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
    };
    let lastFillStyle = '';
    const ctx: Record<string, any> = {
        shadowBlur: 3, shadowColor: '#abcdef', strokeStyle: '#123456', fillStyle: '#654321', lineWidth: 5,
        save() { stack.push({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth }); },
        restore() { Object.assign(ctx, stack.pop() || {}); },
        clearRect: () => {}, beginPath: () => {}, stroke: () => {},
        fill: () => { lastFillStyle = String(ctx.fillStyle); },
        moveTo: (x: number, y: number) => track(x, y), lineTo: (x: number, y: number) => track(x, y),
        arc: (x: number, y: number, r: number) => { track(x - r, y - r); track(x + r, y + r); },
    };
    const snapshot = () => ({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth });
    const canvas = { width, height, clientWidth: width, clientHeight: height, getContext: () => ctx };
    return { canvas, ctx, bounds, snapshot, lastFill: () => lastFillStyle, stackDepth: () => stack.length };
}

function makeDomCache(rCanvas: any, primaryColor = '#33ddff', extras: Record<string, any> = {}) {
    const wrapper = { style: { getPropertyValue: (k: string) => (k === '--card-primary' ? primaryColor : '') } } as any;
    return { wrapper, corners: { FL: { rCanvas, ...extras }, FR: {}, RL: {}, RR: {} } };
}
const emptyMinMax = () => [{ min: null, max: null }, { min: null, max: null }, { min: null, max: null }, { min: null, max: null }];
afterEach(() => vi.unstubAllGlobals());

describe('Corner tire slip radar renderer', () => {
    it.each([1, 2, 3])('keeps radar rings and clamped pulse inside compact bounds at DPR %s', dpr => {
        vi.stubGlobal('window', { devicePixelRatio: dpr });
        for (const [width, height] of [[10, 10], [24, 24], [76, 76]]) {
            const s = createSurface(width, height);
            const domCache = makeDomCache(s.canvas);
            for (const [angle, ratio] of [[0, 0], [0.4, -0.3], [2.5, -2.5]]) {
                renderCorners({ slip_angle_fl: angle, slip_fl: ratio }, false, true, false, [[], [], [], []], [[], [], [], []], emptyMinMax(), 0, domCache);
            }
            expect(s.bounds.nonFinite).toBe(false);
            expect(s.bounds.minX).toBeGreaterThanOrEqual(0);
            expect(s.bounds.maxX).toBeLessThanOrEqual(s.canvas.width);
            expect(s.bounds.minY).toBeGreaterThanOrEqual(0);
            expect(s.bounds.maxY).toBeLessThanOrEqual(s.canvas.height);
        }
    });

    it('uses theme primary color, shifts to danger on traction loss, and restores state on fault', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(76, 76);
        const initial = s.snapshot();
        const domCache = makeDomCache(s.canvas, '#ffaa00');
        renderCorners({ slip_angle_fl: 0.3, slip_fl: 0.2 }, false, true, false, [[], [], [], []], [[], [], [], []], emptyMinMax(), 16, domCache);
        expect(s.canvas.width).toBe(152);
        expect(domCache.wrapper._cachedPrimaryColor).toBe('#ffaa00');
        expect(s.lastFill()).toBe('#ffaa00');
        expect(s.snapshot()).toEqual(initial);
        renderCorners({ slip_angle_fl: 0.9, slip_fl: 0.8 }, false, true, false, [[], [], [], []], [[], [], [], []], emptyMinMax(), 32, domCache);
        expect(s.lastFill()).toBe('#ff0055');
        s.ctx.stroke = () => { throw new Error('simulated radar failure'); };
        expect(() => renderCorners({ slip_angle_fl: 0, slip_fl: 0 }, false, true, false, [[], [], [], []], [[], [], [], []], emptyMinMax(), 48, domCache)).toThrow('simulated radar failure');
        expect(s.snapshot()).toEqual(initial);
        expect(s.stackDepth()).toBe(0);
    });

    it('sanitizes non-finite slip telemetry and skips unmounted or null contexts safely', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(76, 76);
        const angEl = { textContent: '' }, ratEl = { textContent: '' };
        renderCorners({ slip_angle_fl: Number.NaN, slip_fl: Infinity }, false, true, false, [[], [], [], []], [[], [], [], []], emptyMinMax(), 0, makeDomCache(s.canvas, '#00f0ff', { angEl, ratEl }));
        expect(s.bounds.nonFinite).toBe(false);
        expect(angEl.textContent).toBe('0.0°');
        expect(ratEl.textContent).toBe('0.00');
        expect(() => renderCorners({}, false, true, false, [[], [], [], []], [[], [], [], []], emptyMinMax(), 1, { corners: { FL: { rCanvas: { clientWidth: 0, clientHeight: 0, getContext: () => null } }, FR: {}, RL: {}, RR: {} } })).not.toThrow();
    });
});
