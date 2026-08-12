import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawTrackCluster: (...args: unknown[]) => void;
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

function createCanvasSpy() {
  const rectangles: Array<{ x: number; y: number; width: number; height: number; color: string }> = [];
  const text: Array<{ value: string; x: number; y: number }> = [];
  const ctx: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    fillRect: (x: number, y: number, width: number, height: number) => rectangles.push({
      x,
      y,
      width,
      height,
      color: String(ctx.fillStyle || ''),
    }),
    fillText: (value: string, x: number, y: number) => text.push({ value, x, y }),
    fillStyle: '',
    textAlign: '',
    font: '',
  };
  return { ctx, rectangles, text };
}

describe('S650 Track cluster primitive', () => {
  it('uses the dedicated performance hierarchy and a 24-segment RPM band', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {});
    const readouts: Record<string, { value: string; unit: string }> = {
      power: { value: '540', unit: 'HP' },
      boost: { value: '12.5', unit: 'PSI' },
      heading: { value: 'NE', unit: '' },
      odometer: { value: '12.4', unit: 'km' },
    };
    const view = {
      width: 1280,
      height: 480,
      showSpeed: true,
      showGear: true,
      showRPM: true,
      getRpm: () => 4200,
      getMaxRpm: () => 8000,
      roundedSpeed: () => 120,
      getGearLabel: () => '4',
      getFuelLevel: () => 0.65,
      getTelemetryReadout: (slot: string) => readouts[slot] || { value: '--', unit: '' },
      unitLabel: () => 'KM/H',
    };

    primitives.drawTrackCluster(view, {}, {
      background: '#050608',
      primary: '#F04A3E',
      secondary: '#9AA3AD',
      text: '#F7F8FA',
      danger: '#FF3B30',
    }, 0.875);

    expect(spy.rectangles).toHaveLength(25);
    expect(spy.rectangles[0]).toEqual({ x: 48, y: 32, width: 1184, height: 416, color: '#050608' });
    expect(spy.rectangles.slice(1).filter((rectangle) => rectangle.color === '#F04A3E')).toHaveLength(13);
    expect(spy.rectangles.slice(1).filter((rectangle) => rectangle.color === '#FF3B30')).toHaveLength(3);
    expect(spy.text).toEqual(expect.arrayContaining([
      { value: 'SPEED', x: 96, y: 104 },
      { value: '120', x: 96, y: 148 },
      { value: '4', x: 640, y: 218 },
      { value: '4200 RPM', x: 640, y: 248 },
      { value: 'TRACK', x: 640, y: 286 },
      { value: 'POWER  540 HP', x: 1184, y: 124 },
      { value: 'BOOST  12.5 PSI', x: 1184, y: 164 },
      { value: 'FUEL  65%', x: 1184, y: 204 },
      { value: 'NE  /  12.4 km', x: 640, y: 428 },
    ]));
  });

  it('honors the shared speed, gear and RPM visibility controls', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {});
    const view = {
      width: 1280,
      height: 480,
      showSpeed: false,
      showGear: false,
      showRPM: false,
      getRpm: () => 0,
      getMaxRpm: () => 8000,
      roundedSpeed: () => 0,
      getGearLabel: () => '1',
      getFuelLevel: () => null,
      getTelemetryReadout: () => ({ value: '--', unit: '' }),
      unitLabel: () => 'KM/H',
    };

    primitives.drawTrackCluster(view, {}, {
      background: '#050608',
      primary: '#F04A3E',
      secondary: '#9AA3AD',
      text: '#F7F8FA',
      danger: '#FF3B30',
    }, 0.875);

    expect(spy.text.map((entry) => entry.value)).not.toEqual(expect.arrayContaining(['SPEED', '0', '1', '0 RPM']));
    expect(spy.text.map((entry) => entry.value)).toContain('TRACK');
  });
});
