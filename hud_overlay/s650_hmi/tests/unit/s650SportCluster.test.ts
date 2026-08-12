import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawSportCluster: (...args: unknown[]) => void;
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
  const rectangles: Array<{ color: string; width: number }> = [];
  const text: string[] = [];
  const ctx: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    fillRect: (_x: number, _y: number, width: number) => rectangles.push({ color: String(ctx.fillStyle || ''), width }),
    fillText: (value: string) => text.push(value),
    fillStyle: '',
    textAlign: '',
    font: '',
  };
  return { ctx, rectangles, text };
}

describe('S650 Sport cluster primitive', () => {
  it('prioritizes central speed and gear, a warm RPM band, and pedal information', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {});
    const view = {
      width: 1280,
      height: 480,
      showSpeed: true,
      showGear: true,
      showRPM: true,
      getRpm: () => 7200,
      getMaxRpm: () => 8000,
      roundedSpeed: () => 120,
      getGearLabel: () => '4',
      getPedalValue: (_data: unknown, key: string) => key === 'throttle' ? 0.75 : 0.25,
      getTelemetryReadout: (slot: string) => slot === 'boost'
        ? { value: '12.5', unit: 'PSI' }
        : { value: '540', unit: 'HP' },
      unitLabel: () => 'KM/H',
    };

    primitives.drawSportCluster(view, {}, {
      background: '#090807',
      primary: '#E78B3F',
      secondary: '#B8AAA0',
      text: '#FFF8F1',
      warning: '#FFCC00',
      danger: '#FF3B30',
    }, 0.875);

    expect(spy.rectangles.filter((rectangle) => rectangle.color === '#E78B3F' && rectangle.width < 100)).toHaveLength(14);
    expect(spy.rectangles.filter((rectangle) => rectangle.color === '#FFCC00' && rectangle.width < 100)).toHaveLength(2);
    expect(spy.rectangles.filter((rectangle) => rectangle.color === '#FF3B30' && rectangle.width < 60)).toHaveLength(2);
    expect(spy.rectangles).toEqual(expect.arrayContaining([
      { color: '#E78B3F', width: 195 },
      { color: '#FF3B30', width: 65 },
    ]));
    expect(spy.text).toEqual(expect.arrayContaining([
      '120', 'KM/H', '4', 'GEAR', '7200 RPM', 'BOOST  12.5 PSI', 'POWER  540 HP', 'SPORT', 'THROTTLE', 'BRAKE',
    ]));
  });
});
