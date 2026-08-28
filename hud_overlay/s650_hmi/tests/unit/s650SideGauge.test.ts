import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawSideGauge: (...args: unknown[]) => void;
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

describe('S650 side sub-gauge primitive', () => {
  it('renders side gauge with styling options without errors', () => {
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      arc: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      stroke: () => undefined,
      fill: () => undefined,
      fillText: () => undefined,
      strokeStyle: '',
      fillStyle: '',
    };
    const primitives = loadPrimitivesModule().create(ctx, {
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    });

    expect(() => {
      primitives.drawSideGauge(256, 250, 'kW', 0.6, {
        activeColor: '#C98D5A',
        pointerColor: '#C98D5A',
        tickColor: '#98A0A8',
        showText: false,
        auxiliaryLabel: 'POWER',
      });
    }).not.toThrow();
  });
});
