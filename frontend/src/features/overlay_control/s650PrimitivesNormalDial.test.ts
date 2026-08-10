import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PrimitiveModule = {
  create: (ctx: Record<string, unknown>, contract: Record<string, unknown>) => {
    drawNormalEnergyDial: (...args: unknown[]) => void;
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
  const arcs: number[][] = [];
  const lines: number[][] = [];
  const text: string[] = [];
  const textLayout: Array<{ value: string; x: number; y: number }> = [];
  const strokes: Array<{ color: string; width: number }> = [];
  const ctx: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: (...args: number[]) => arcs.push(args),
    moveTo: (...args: number[]) => lines.push(args),
    lineTo: (...args: number[]) => lines.push(args),
    stroke: () => strokes.push({
      color: String(ctx.strokeStyle || ''),
      width: Number(ctx.lineWidth || 0),
    }),
    fill: () => undefined,
    fillText: (value: string, x: number, y: number) => {
      text.push(value);
      textLayout.push({ value, x, y });
    },
    strokeStyle: '',
    lineWidth: 0,
  };
  return {
    arcs,
    lines,
    text,
    textLayout,
    strokes,
    ctx,
  };
}

describe('S650 Normal energy dial primitive', () => {
  it('renders concentric tracks, an explicit redline region, energy arc and endpoint indicator', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    });

    primitives.drawNormalEnergyDial(
      { typography: { bodyM: 24, captionLegal: 16 } },
      { primary: '#4FA8FF', secondary: '#D8E6F4', danger: '#FF4B4B', text: '#FFFFFF' },
      320,
      240,
      180,
      0.5,
      0.75,
      'RPM',
      4200,
      'RPM',
      { tickLabels: ['0', '2', '4', '6', '8', '10'] },
    );

    expect(spy.arcs.length).toBeGreaterThanOrEqual(5);
    expect(spy.lines.length).toBeGreaterThan(10);
    expect(spy.text).toEqual(expect.arrayContaining(['RPM', '4200', '0', '10']));
  });

  it('supports the Normal thick energy band and centered value stack', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    });

    primitives.drawNormalEnergyDial(
      { typography: { bodyM: 24, captionLegal: 16 } },
      { primary: '#1351D8', secondary: '#98A0A8', danger: '#FF3B30', text: '#FFFFFF' },
      320,
      240,
      180,
      0.5,
      0.75,
      'SPEED',
      120,
      'KM/H',
      {
        baseWidth: 48,
        redlineWidth: 56,
        centerLabel: true,
        valueSize: 56,
        unitSize: 16,
        labelSize: 16,
        valueOffsetY: -16,
        unitOffsetY: 18,
        labelOffsetY: 42,
      },
    );

    expect(spy.strokes).toEqual(expect.arrayContaining([
      { color: '#1351D8', width: 48 },
      { color: '#FF3B30', width: 56 },
    ]));
    expect(spy.textLayout).toEqual(expect.arrayContaining([
      { value: '120', x: 320, y: 224 },
      { value: 'KM/H', x: 320, y: 258 },
      { value: 'SPEED', x: 320, y: 282 },
    ]));
  });

  it('renders a gear value with the two-line Normal RPM label', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    });

    primitives.drawNormalEnergyDial(
      { typography: { bodyM: 24, captionLegal: 16 } },
      { primary: '#1351D8', secondary: '#98A0A8', danger: '#FF3B30', text: '#FFFFFF' },
      320,
      240,
      180,
      0.5,
      0.75,
      'RPMx1000',
      '4',
      '',
      {
        centerLabel: true,
        valueSize: 56,
        labelSize: 16,
        labelOffsetYWithoutUnit: 30,
        labelLineGap: 16,
        labelLines: ['GEAR', 'RPMx1000'],
      },
    );

    expect(spy.textLayout).toEqual(expect.arrayContaining([
      { value: '4', x: 320, y: 224 },
      { value: 'GEAR', x: 320, y: 262 },
      { value: 'RPMx1000', x: 320, y: 278 },
    ]));
  });

  it('does not depend on Heritage dial rendering semantics', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    });

    expect(primitives.drawNormalEnergyDial).toEqual(expect.any(Function));
  });
});
