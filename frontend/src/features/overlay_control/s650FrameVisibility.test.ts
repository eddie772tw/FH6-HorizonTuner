import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type FrameModule = {
  create: (options: Record<string, unknown>) => {
    update: (payload: unknown) => void;
    view: { showCenterInfo: boolean };
  };
};

function loadFrameModule(): FrameModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_frame.js'),
    'utf8',
  );
  const window = {} as { S650HmiFrame?: FrameModule };
  new Function('window', source)(window);

  if (!window.S650HmiFrame) {
    throw new Error('S650 frame module did not register itself');
  }
  return window.S650HmiFrame;
}

function createFrame() {
  return loadFrameModule().create({
    canvas: null,
    ctx: null,
    container: null,
    contract: {
      canvas: { width: 1280, height: 480 },
      defaultFrame: {},
      finiteNumber: (value: unknown, fallback: number) => (
        typeof value === 'number' && Number.isFinite(value) ? value : fallback
      ),
      normalizeConfig: (payload: { elements?: unknown }) => ({
        elements: payload.elements && typeof payload.elements === 'object' ? payload.elements : {},
      }),
      normalizeFrame: () => ({}),
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    },
    tokens: { grid: { overlay: {} } },
    layouts: { render: () => undefined },
  });
}

describe('S650 center-information visibility contract', () => {
  it('defaults center information to visible and accepts an explicit off state', () => {
    const frame = createFrame();

    expect(frame.view.showCenterInfo).toBe(true);

    frame.update({ elements: { showCenterInfo: false } });
    expect(frame.view.showCenterInfo).toBe(false);

    frame.update({ elements: { showCenterInfo: true } });
    expect(frame.view.showCenterInfo).toBe(true);
  });
});
