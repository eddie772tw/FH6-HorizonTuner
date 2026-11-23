import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatHeadingDigits, getNearestCardinal, normalizeAngle, renderCompass } from '../../telemetry-cards/compass.js';

function createSurface(width = 640, height = 76) {
    const stack: Record<string, unknown>[] = [];
    const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, nonFinite: false };
    const track = (x: number, y: number) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) bounds.nonFinite = true;
        bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
    };
    const texts: Array<{ text: string; y: number; fillStyle: string; font: string }> = [];
    let pointerTipY = -Infinity, activePathMaxY = -Infinity;
    const ctx: Record<string, any> = {
        shadowBlur: 2, shadowColor: '#abcdef', shadowOffsetX: 3, shadowOffsetY: 4,
        strokeStyle: '#123456', fillStyle: '#654321', lineWidth: 5, lineCap: 'butt',
        font: '12px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalCompositeOperation: 'source-over',
        save() { stack.push(snapshot()); }, restore() { Object.assign(ctx, stack.pop() || {}); },
        setTransform: () => {}, clearRect: () => {}, stroke: () => {}, closePath: () => {},
        beginPath: () => { activePathMaxY = -Infinity; },
        moveTo: (x: number, y: number) => { track(x, y); activePathMaxY = Math.max(activePathMaxY, y); },
        lineTo: (x: number, y: number) => { track(x, y); activePathMaxY = Math.max(activePathMaxY, y); },
        fill: () => { pointerTipY = Math.max(pointerTipY, activePathMaxY); },
        fillRect: (x: number, y: number, w: number, h: number) => { track(x, y); track(x + w, y + h); },
        fillText: (text: string, x: number, y: number) => { texts.push({ text, y, fillStyle: String(ctx.fillStyle), font: String(ctx.font) }); track(x, y); },
        createLinearGradient: () => ({ addColorStop: () => {} }),
    };
    const snapshot = () => ({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, shadowOffsetX: ctx.shadowOffsetX, shadowOffsetY: ctx.shadowOffsetY, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, font: ctx.font, textAlign: ctx.textAlign, textBaseline: ctx.textBaseline, globalCompositeOperation: ctx.globalCompositeOperation });
    const canvas: Record<string, any> = { width, height, clientWidth: width, clientHeight: height, getContext: () => ctx };
    return { canvas, ctx, bounds, texts, snapshot, pointerTipY: () => pointerTipY, stackDepth: () => stack.length };
}

afterEach(() => vi.unstubAllGlobals());

describe('Compass tape renderer', () => {
    it('normalizes and formats wrap-around and non-finite headings safely', () => {
        expect([normalizeAngle(-90), normalizeAngle(Number.NaN)]).toEqual([270, 0]);
        expect([formatHeadingDigits(359.6), formatHeadingDigits(Number.POSITIVE_INFINITY), getNearestCardinal(Number.NaN)]).toEqual(['000', '000', 'N']);
    });

    it.each([1, 2, 3])('keeps tape inside bounds and clears pointer from cardinal labels at DPR %s', dpr => {
        vi.stubGlobal('window', { devicePixelRatio: dpr });
        for (const [w, h] of [[320, 36], [480, 56], [640, 76], [960, 100]]) {
            const s = createSurface(w, h);
            for (const yaw of [0, (42 * Math.PI) / 180, -Math.PI / 2]) renderCompass(s.canvas, { Yaw: yaw }, {});
            expect(s.bounds.nonFinite).toBe(false);
            expect(s.bounds.minX).toBeGreaterThanOrEqual(0); expect(s.bounds.maxX).toBeLessThanOrEqual(w);
            expect(s.bounds.minY).toBeGreaterThanOrEqual(0); expect(s.bounds.maxY).toBeLessThanOrEqual(h);
            const north = s.texts.find(t => t.text === 'N');
            expect(north && north.y - Number(north.font.match(/(\d+)px/)?.[1] || 0)).toBeGreaterThan(s.pointerTipY());
        }
    });

    it('reuses cached fade gradients across frames and invalidates on resize or DPR change', () => {
        vi.stubGlobal('window', { devicePixelRatio: 1 });
        const s = createSurface(640, 76);
        renderCompass(s.canvas, { Yaw: 0 }, {});
        const firstLeft = s.canvas._leftFadeGrad, firstRight = s.canvas._rightFadeGrad;
        for (let i = 1; i <= 10; i++) renderCompass(s.canvas, { Yaw: i * 0.1 }, {});
        expect([s.canvas._leftFadeGrad, s.canvas._rightFadeGrad]).toEqual([firstLeft, firstRight]);
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        renderCompass(s.canvas, { Yaw: 0.2 }, {});
        expect(s.canvas._leftFadeGrad).not.toBe(firstLeft);
    });

    it('sanitizes non-finite yaw, applies custom theme, and restores composite state on fault', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2, demoActive: true });
        const s = createSurface(640, 76), initial = s.snapshot();
        renderCompass(s.canvas, { Yaw: Number.NaN }, { useDefaultColors: false, customColor: '#ffaa00' });
        expect(s.texts.some(t => t.text === '000° N' && t.fillStyle === '#ffaa00')).toBe(true);
        renderCompass(s.canvas, { NormalizedYaw: 0.5 }, {});
        expect(s.texts.some(t => t.text === '090° E')).toBe(true);
        expect(s.snapshot()).toEqual(initial); expect(s.stackDepth()).toBe(0);
        s.ctx.fillRect = () => { throw new Error('simulated mask failure'); };
        expect(() => renderCompass(s.canvas, { Yaw: 0 }, {})).toThrow('simulated mask failure');
        expect(s.snapshot()).toEqual(initial); expect(s.stackDepth()).toBe(0);
        expect(() => renderCompass({ clientWidth: 640, clientHeight: 76, getContext: () => null }, {}, {})).not.toThrow();
    });
});
