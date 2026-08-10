import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Widget = 'drive' | 'tire_temp' | 'performance';

type CenterInfoModule = {
  create: (options: {
    primitives: Record<string, (...args: unknown[]) => void>;
    contract: { centerWidgets: Widget[] };
  }) => {
    draw: (view: { centerWidget?: string }, data: unknown, palette: unknown, x: number, y: number, width: number, height: number) => void;
    normalizeWidget: (view: { centerWidget?: string }) => Widget;
    widgets: Widget[];
  };
};

function loadCenterInfoModule(): CenterInfoModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_center_info.js'),
    'utf8'
  );
  const window = {} as { S650HmiCenterInfo?: CenterInfoModule };
  new Function('window', source)(window);

  if (!window.S650HmiCenterInfo) {
    throw new Error('S650 center-info module did not register itself');
  }
  return window.S650HmiCenterInfo;
}

describe('S650 Heritage center-information contract', () => {
  it.each([
    ['drive', 'drawGearAndSpeed'],
    ['tire_temp', 'drawTireTemperatureWidget'],
    ['performance', 'drawPerformanceWidget'],
  ] as const)('dispatches %s to the matching primitive', (widget, primitiveName) => {
    const calls: string[] = [];
    const primitives = {
      drawGearAndSpeed: () => calls.push('drawGearAndSpeed'),
      drawTireTemperatureWidget: () => calls.push('drawTireTemperatureWidget'),
      drawPerformanceWidget: () => calls.push('drawPerformanceWidget'),
    };
    const centerInfo = loadCenterInfoModule().create({
      primitives,
      contract: { centerWidgets: ['drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({ centerWidget: widget }, {}, {}, 425, 126, 430, 230);

    expect(calls).toEqual([primitiveName]);
  });

  it('uses the contract widget list and falls back to drive', () => {
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: () => undefined,
        drawTireTemperatureWidget: () => undefined,
        drawPerformanceWidget: () => undefined,
      },
      contract: { centerWidgets: ['drive', 'tire_temp', 'performance'] },
    });

    expect(centerInfo.widgets).toEqual(['drive', 'tire_temp', 'performance']);
    expect(centerInfo.normalizeWidget({ centerWidget: 'unknown' })).toBe('drive');
  });
});
