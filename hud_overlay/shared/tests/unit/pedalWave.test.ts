import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPedalWave } from '../../telemetry-cards/pedal-wave.js';

function createSurface(width = 320, height = 88) {
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
        lineWidth: 7, lineCap: 'square', lineJoin: 'bevel',
        save() { stack.push({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, lineJoin: ctx.lineJoin }); },
        restore() { Object.assign(ctx, stack.pop() || {}); },
        clearRect: () => {}, beginPath: () => {}, stroke: () => {}, fill: () => {},
        moveTo: (x: number, y: number) => track(x, y),
        lineTo: (x: number, y: number) => track(x, y),
        arc: (x: number, y: number, r: number) => { bounds.arcDrawn = true; track(x - r, y - r); track(x + r, y + r); },
    };
    const snapshot = () => ({ shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor, strokeStyle: ctx.strokeStyle, fillStyle: ctx.fillStyle, lineWidth: ctx.lineWidth, lineCap: ctx.lineCap, lineJoin: ctx.lineJoin });
    const canvas = { width, height, clientWidth: width, clientHeight: height, getContext: () => ctx };
    return { canvas, ctx, bounds, snapshot, stackDepth: () => stack.length };
}

afterEach(() => vi.unstubAllGlobals());

describe('Pedal wave HUD canvas renderer', () => {
    it('restores canvas state across single-sample, active modulation, and mid-draw exceptions', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(320, 88);
        const initial = s.snapshot();
        const hist: any[] = [];

        renderPedalWave({ throttle: 0.75, brake: 0.25 }, hist, 16, { pedalWaveCanvas: s.canvas });
        expect(s.bounds.arcDrawn).toBe(true);
        expect(s.snapshot()).toEqual(initial);
        expect(s.stackDepth()).toBe(0);

        s.ctx.stroke = () => { throw new Error('simulated draw failure'); };
        expect(() => renderPedalWave({ throttle: 1, brake: 0 }, hist, 32, { pedalWaveCanvas: s.canvas })).toThrow('simulated draw failure');
        expect(s.snapshot()).toEqual(initial);
        expect(s.stackDepth()).toBe(0);
    });

    it('sanitizes inputs, reuses circular slots at capacity, and keeps trace and glow markers inside canvas bounds', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 });
        const s = createSurface(320, 88);
        const hist: any[] = [];

        renderPedalWave({ throttle: Number.NaN, brake: 1.5 }, hist, 0, { pedalWaveCanvas: s.canvas });
        expect(hist[0]).toMatchObject({ throttle: 0, brake: 1 });

        for (let i = 1; i < 300; i++) {
            renderPedalWave({ throttle: i % 2 === 0 ? 1 : 0, brake: i / 300 }, hist, i * 16, { pedalWaveCanvas: s.canvas });
        }
        const firstSlotRef = hist[0];
        renderPedalWave({ throttle: -0.4, brake: 0.9 }, hist, 4800, { pedalWaveCanvas: s.canvas });

        expect(hist).toHaveLength(300);
        expect(hist[0]).toBe(firstSlotRef);
        expect(hist[0]).toMatchObject({ throttle: 0, brake: 0.9 });
        expect(s.bounds.minX).toBeGreaterThanOrEqual(0);
        expect(s.bounds.maxX).toBeLessThanOrEqual(s.canvas.width);
        expect(s.bounds.minY).toBeGreaterThanOrEqual(0);
        expect(s.bounds.maxY).toBeLessThanOrEqual(s.canvas.height);
    });
});
