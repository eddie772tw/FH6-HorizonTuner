import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawCenterDecorations: (...args: unknown[]) => void;
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

describe('S650 center readout decorations', () => {
  it('uses one horizontal-and-side-line geometry without a vertical divider', () => {
    const segments: number[][] = [];
    const primitives = loadPrimitivesModule().create(
      {
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        moveTo: (...args: number[]) => segments.push(args),
        lineTo: (...args: number[]) => segments.push(args),
        stroke: () => undefined,
      },
      { clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)) },
    );

    primitives.drawCenterDecorations({ width: 1280 }, { primary: '#C98D5A' }, { centerX: 640 });

    expect(segments).toEqual([
      [522, 84], [758, 84],
      [464, 410], [522, 410],
      [758, 410], [816, 410],
    ]);
  });
});
