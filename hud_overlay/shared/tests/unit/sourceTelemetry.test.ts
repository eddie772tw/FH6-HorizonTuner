import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
});

async function coordinatorFixture(smoothing = true) {
    vi.resetModules();
    let now = 0;
    let render: FrameRequestCallback | null = null;
    const window = Object.assign(new EventTarget(), { isMetric: () => true });
    const frames: Record<string, unknown>[] = [];
    window.addEventListener('hud:frame', event => frames.push((event as CustomEvent).detail.data));
    vi.stubGlobal('window', window);
    vi.stubGlobal('localStorage', { getItem: () => 'false' });
    vi.stubGlobal('setInterval', () => 1);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { render = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => { render = null; });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const coordinator = await import('../../coordinator.js');
    coordinator.setFrameSmoothing(smoothing);
    coordinator.initCoordinator();
    return {
        frames,
        push(raw: object, time: number) {
            now = time;
            window.dispatchEvent(new CustomEvent('telemetry', { detail: raw }));
        },
        paint(time: number) {
            now = time;
            const callback = render;
            render = null;
            callback?.(time);
            return frames.at(-1)!;
        },
    };
}

function sample(timestamp: number, rpm: number, tire: number) {
    return Object.freeze({
        IsRaceOn: 1, TimestampMS: timestamp, CarOrdinal: 7,
        CurrentEngineRpm: rpm, EngineMaxRpm: 8000,
        TireTemp: Object.freeze([tire, tire, tire, tire]),
    });
}

describe('Coordinator source telemetry evidence', () => {
    it('keeps exact source values separate from extrapolated display and stale replay', async () => {
        const fixture = await coordinatorFixture();
        const first = sample(0, 6000, 180), second = sample(16, 7000, 200);
        fixture.push(first, 0);
        fixture.push(second, 16);
        const extrapolated = fixture.paint(20);
        expect(extrapolated.CurrentEngineRpm).toBe(7250);
        expect(extrapolated.TireTemp).toEqual([205, 205, 205, 205]);
        expect(extrapolated.sourceTelemetry).toBe(second);
        expect(extrapolated.sourceTelemetry).toEqual({
            IsRaceOn: 1, TimestampMS: 16, CarOrdinal: 7,
            CurrentEngineRpm: 7000, EngineMaxRpm: 8000, TireTemp: [200, 200, 200, 200],
        });
        // Matches the browser postMessage boundary, including missing fields.
        const delivered = structuredClone(extrapolated);
        expect(delivered.sourceTelemetry).toEqual(second);
        expect(delivered.sourceTelemetry).not.toHaveProperty('Boost');
        expect(fixture.paint(500).sourceTelemetry).toBe(second);
        const third = sample(32, 6500, 190);
        fixture.push(third, 516);
        expect(fixture.paint(520).sourceTelemetry).toBe(third);
        expect(extrapolated.sourceTelemetry).toBe(second);
        expect(first.CurrentEngineRpm).toBe(6000);
        expect(second.TireTemp).toEqual([200, 200, 200, 200]);
    });

    it('provides the same source contract when visual smoothing is disabled', async () => {
        const fixture = await coordinatorFixture(false);
        const raw = sample(42, 6000, 0);
        fixture.push(raw, 100);
        const frame = fixture.frames.at(-1)!;
        expect(frame.sourceTelemetry).toBe(raw);
        expect(frame.CurrentEngineRpm).toBe(raw.CurrentEngineRpm);
        expect((frame.sourceTelemetry as typeof raw).TireTemp).toEqual([0, 0, 0, 0]);
    });
});
