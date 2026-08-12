import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawSvtCobraCluster: (...args: unknown[]) => void;
  };
};

function loadPrimitivesModule(): PrimitiveModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_primitives.js'),
    'utf8',
  );
  const window = {} as { S650HmiPrimitives?: PrimitiveModule };
  new Function('window', source)(window);
  if (!window.S650HmiPrimitives) throw new Error('S650 primitives module did not register itself');
  return window.S650HmiPrimitives;
}

function createCanvasSpy() {
  const rectangles: Array<{ color: string; width: number; y: number }> = [];
  const text: string[] = [];
  const ctx: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    fillRect: (_x: number, y: number, width: number) => rectangles.push({ color: String(ctx.fillStyle || ''), width, y }),
    fillText: (value: string) => text.push(value),
    fillStyle: '',
    textAlign: '',
    font: '',
  };
  return { ctx, rectangles, text };
}

describe('S650 SVT Cobra cluster primitive', () => {
  it('uses the product-extension hierarchy with a central gear and linear redline band', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {});
    const view = {
      width: 1280,
      height: 480,
      showSpeed: true,
      showGear: true,
      showRPM: true,
      getRpm: () => 6200,
      getMaxRpm: () => 8000,
      roundedSpeed: () => 110,
      getGearLabel: () => '3',
      getTelemetryReadout: (slot: string) => slot === 'power'
        ? { value: '480', unit: 'HP' }
        : { value: '9.0', unit: 'PSI' },
      unitLabel: () => 'KM/H',
    };

    primitives.drawSvtCobraCluster(view, {}, {
      background: '#030403',
      primary: '#E8ECE7',
      secondary: '#A7AFA7',
      text: '#FFFFFF',
      danger: '#E33B3B',
    }, 0.875);

    expect(spy.rectangles.filter((rectangle) => rectangle.y === 386 && rectangle.color === '#E8ECE7')).toHaveLength(8);
    expect(spy.rectangles.filter((rectangle) => rectangle.y === 386 && rectangle.color === '#E33B3B')).toHaveLength(1);
    expect(spy.text).toEqual(expect.arrayContaining([
      'SVT COBRA', 'PERFORMANCE CLUSTER', '6200', 'RPM', '3', 'GEAR', '110', 'KM/H', 'POWER  480 HP    BOOST  9.0 PSI',
    ]));
  });
});
