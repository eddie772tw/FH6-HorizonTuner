import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderCompass } from '../../telemetry-cards/compass.js';

function createCanvas(width: number, height: number) {
    let scaleX = 1;
    let scaleY = 1;
    const noop = () => {};
    const context = {
        setTransform: (a: number, _b: number, _c: number, d: number) => {
            scaleX = a;
            scaleY = d;
        },
        clearRect: noop, save: noop, restore: noop, beginPath: noop,
        moveTo: noop, lineTo: noop, closePath: noop, stroke: noop,
        fill: noop, fillText: noop, fillRect: noop,
        createLinearGradient: () => ({ addColorStop: noop }),
    };
    return {
        width: 300, height: 150, clientWidth: width, clientHeight: height,
        getContext: () => context,
        // Effective on-screen geometry, independent of the bitmap resolution.
        get displayScaleX() { return scaleX * this.clientWidth / this.width; },
        get displayScaleY() { return scaleY * this.clientHeight / this.height; },
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('Compass canvas resolution', () => {
    it.each([
        [640, 1], [960, 1.25], [1280, 1.5], [1720, 2], [1920, 2], [683, 1.25],
    ])('keeps CSS geometry at width %s and DPR %s', (width, dpr) => {
        vi.stubGlobal('window', { devicePixelRatio: dpr });
        const canvas = createCanvas(width, 76);

        renderCompass(canvas, { Yaw: Math.PI / 4 }, {});

        expect(canvas.width).toBe(Math.round(canvas.clientWidth * dpr));
        expect(canvas.height).toBe(Math.round(canvas.clientHeight * dpr));
        expect(canvas.displayScaleX).toBeCloseTo(1);
        expect(canvas.displayScaleY).toBeCloseTo(1);
    });

    it('updates the same canvas after resizing and changing display DPI', () => {
        vi.stubGlobal('window', { devicePixelRatio: 1 });
        const canvas = createCanvas(640, 76);
        renderCompass(canvas, { Yaw: 0 }, {});

        canvas.clientWidth = 1920;
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        renderCompass(canvas, { Yaw: -Math.PI / 2 }, {});
        renderCompass(canvas, { Yaw: 2 * Math.PI }, {});

        expect(canvas.width).toBe(canvas.clientWidth * 2);
        expect(canvas.height).toBe(canvas.clientHeight * 2);
        expect(canvas.displayScaleX).toBeCloseTo(canvas.displayScaleY);
        expect(canvas.displayScaleX).toBeCloseTo(1);
    });

    it('preserves the bitmap while hidden and recovers when visible', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const canvas = createCanvas(960, 76);
        renderCompass(canvas, { Yaw: 0 }, {});
        const bitmap = [canvas.width, canvas.height];

        canvas.clientWidth = 0;
        canvas.clientHeight = 0;
        for (let frame = 0; frame < 3; frame++) renderCompass(canvas, null, {});
        expect([canvas.width, canvas.height]).toEqual(bitmap);

        canvas.clientWidth = 640;
        canvas.clientHeight = 76;
        renderCompass(canvas, { Yaw: Math.PI }, {});
        expect(canvas.width).toBe(canvas.clientWidth * 2);
        expect(canvas.displayScaleX).toBeCloseTo(1);
        expect(canvas.displayScaleY).toBeCloseTo(1);
    });
});
