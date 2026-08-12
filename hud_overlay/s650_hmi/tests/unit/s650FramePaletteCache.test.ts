import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type FrameModule = {
  create: (options: Record<string, unknown>) => {
    onFrame: (data: unknown, payload?: unknown) => void;
    update: (payload: unknown) => void;
  };
};

function loadFrameModule(): FrameModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_frame.js'),
    'utf8',
  );
  const window = {} as { S650HmiFrame?: FrameModule };
  new Function('window', source)(window);
  if (!window.S650HmiFrame) throw new Error('S650 frame module did not register itself');
  return window.S650HmiFrame;
}

describe('S650 frame palette cache', () => {
  it('reuses the palette on telemetry-only frames and refreshes it for a theme change', () => {
    const paletteFor = vi.fn((theme: string) => ({ theme }));
    const render = vi.fn();
    const frameData = {
      rpm: 4200,
      maxRpm: 8000,
      redlineRpm: 7000,
      speed_kmh: 120,
      speed_mph: 75,
      gear: 4,
    };
    const frame = loadFrameModule().create({
      canvas: {},
      ctx: {},
      container: null,
      contract: {
        canvas: { width: 1280, height: 480 },
        defaultFrame: frameData,
        normalizeFrame: (data: typeof frameData) => data,
        normalizeConfig: (payload: { s650Theme?: string }) => ({
          theme: payload.s650Theme || 'heritage67',
          centerWidget: 'drive',
          guiThemeMode: 'dark',
          isMetric: true,
          elements: {},
        }),
        finiteNumber: (value: unknown, fallback: number) => typeof value === 'number' ? value : fallback,
        clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      },
      tokens: { grid: { overlay: {} }, paletteFor },
      layouts: { render },
    });

    frame.onFrame(frameData);
    frame.onFrame({ ...frameData, rpm: 4300 });

    expect(paletteFor).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][2]).toBe(render.mock.calls[1][2]);

    frame.update({ s650Theme: 'track' });
    frame.onFrame(frameData);

    expect(paletteFor).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[2][0]).toBe('track');
    expect(render.mock.calls[2][2]).toEqual({ theme: 'track' });
  });
});
