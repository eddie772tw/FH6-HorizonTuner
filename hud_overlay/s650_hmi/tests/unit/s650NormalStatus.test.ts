import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawNormalStatus: (...args: unknown[]) => void;
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

describe('S650 Normal fixed center readouts', () => {
  it('uses an independent centered four-corner layout with enlarged typography', () => {
    const readouts: Array<{ value: string; x: number; y: number; font: string; textAlign: string }> = [];
    const canvas = { font: '', textAlign: '' };
    const primitives = loadPrimitivesModule().create(
      {
        save: () => undefined,
        restore: () => undefined,
        fillText: (value: string, x: number, y: number) => {
          readouts.push({ value, x, y, font: canvas.font, textAlign: canvas.textAlign });
        },
        get font() { return canvas.font; },
        set font(value: string) { canvas.font = value; },
        get textAlign() { return canvas.textAlign; },
        set textAlign(value: string) { canvas.textAlign = value; },
      },
      { clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) },
    );

    primitives.drawNormalStatus(
      {
        width: 1280,
        typography: { normalCenterTopReadout: 28, normalCenterBottomReadout: 26 },
        getTelemetryReadout: (slot: string) => ({ value: slot.toUpperCase(), unit: slot === 'heading' ? '' : 'X' }),
      },
      {},
      { secondary: '#98A0A8' },
      { topLeft: 'odometer', topRight: 'heading', bottomLeft: 'rpm', bottomRight: 'speed' },
      { centerX: 640, topOffset: 147, bottomOffset: 141, topY: 82, bottomY: 392 },
    );

    expect(readouts).toHaveLength(4);
    expect(readouts.map(({ x, y }) => [x, y])).toEqual([
      [493, 82], [787, 82],
      [499, 392], [781, 392],
    ]);
    expect(readouts.every((readout) => readout.textAlign === 'center')).toBe(true);
    expect(readouts[0].font).toContain('28px');
    expect(readouts[2].font).toContain('26px');
  });
});
