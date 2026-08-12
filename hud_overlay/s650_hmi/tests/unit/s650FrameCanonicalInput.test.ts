import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type CanonicalFrame = {
  speed_kmh: number;
  speed_mph: number;
  rpm: number;
  maxRpm: number;
  redlineRpm: number;
  gear: number;
  throttle: number;
  brake: number;
};

type Contract = {
  canvas: { width: number; height: number };
  defaultFrame: CanonicalFrame;
  normalizeFrame: (data: unknown) => CanonicalFrame;
  normalizeConfig: (payload: unknown) => Record<string, unknown>;
  finiteNumber: (value: unknown, fallback: number) => number;
  clamp: (value: number, min: number, max: number) => number;
};

type FrameModule = {
  create: (options: Record<string, unknown>) => {
    onFrame: (data: unknown, payload?: unknown) => void;
  };
};

function loadContract(): Contract {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_contract.js'),
    'utf8',
  );
  const window = {} as { S650HmiContract?: Contract };
  new Function('window', source)(window);
  if (!window.S650HmiContract) throw new Error('S650 contract module did not register itself');
  return window.S650HmiContract;
}

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

describe('S650 renderer frame boundary', () => {
  it('passes only a canonical frame into the layout renderer', () => {
    const contract = loadContract();
    const render = vi.fn();
    const frame = loadFrameModule().create({
      canvas: {},
      ctx: {},
      container: null,
      contract,
      tokens: {
        grid: { overlay: {} },
        paletteFor: () => ({}),
      },
      layouts: { render },
    });

    frame.onFrame({
      SpeedMetersPerSecond: 34.28,
      CurrentEngineRpm: 6123,
      EngineMaxRpm: 7500,
      AccelInput: 204,
      BrakeInput: 51,
      TireTemp: [200, 201, 198, 199],
    });

    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0][1]).toEqual(contract.defaultFrame);
  });
});
