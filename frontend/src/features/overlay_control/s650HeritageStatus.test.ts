import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawHeritageStatus: (...args: unknown[]) => void;
  };
};

function loadPrimitivesModule(): PrimitiveModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_primitives.js'),
    'utf8',
  );
  const window = {} as { S650HmiPrimitives?: PrimitiveModule };
  new Function('window', source)(window);

  if (!window.S650HmiPrimitives) {
    throw new Error('S650 primitives module did not register itself');
  }
  return window.S650HmiPrimitives;
}

describe('S650 Heritage fixed center readouts', () => {
  it('accepts the shared horizontal calibration instead of using hard-coded offsets', () => {
    const readouts: Array<{ x: number; y: number }> = [];
    const canvas = { font: '', textAlign: '' };
    const primitives = loadPrimitivesModule().create(
      {
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        stroke: () => undefined,
        fillText: (_value: string, x: number, y: number) => readouts.push({ x, y }),
        get font() { return canvas.font; },
        set font(value) { canvas.font = value; },
        get textAlign() { return canvas.textAlign; },
        set textAlign(value) { canvas.textAlign = value; },
        textBaseline: '',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
      },
      { clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) },
    );

    primitives.drawHeritageStatus(
      {
        width: 1280,
        typography: { heritageCenterTopReadout: 28, heritageCenterBottomReadout: 26 },
        getTelemetryReadout: (slot: string) => ({ value: slot, unit: '' }),
      },
      {},
      { topLeft: 'top-left', topRight: 'top-right', bottomLeft: 'bottom-left', bottomRight: 'bottom-right' },
      { centerX: 640, topOffset: 195, bottomOffset: 170 },
    );

    expect(readouts.slice(0, 4).map(({ x, y }) => [x, y])).toEqual([
      [445, 82], [835, 82],
      [470, 392], [810, 392],
    ]);
  });
});
