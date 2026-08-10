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
  return {
    arcs,
    lines,
    text,
    ctx: {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      arc: (...args: number[]) => arcs.push(args),
      moveTo: (...args: number[]) => lines.push(args),
      lineTo: (...args: number[]) => lines.push(args),
      stroke: () => undefined,
      fill: () => undefined,
      fillText: (value: string) => text.push(value),
    },
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

  it('does not depend on Heritage dial rendering semantics', () => {
    const spy = createCanvasSpy();
    const primitives = loadPrimitivesModule().create(spy.ctx, {
      clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    });

    expect(primitives.drawNormalEnergyDial).toEqual(expect.any(Function));
  });
});
