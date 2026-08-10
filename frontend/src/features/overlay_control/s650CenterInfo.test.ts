import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Widget = 'drive' | 'tire_temp' | 'performance';

type CenterInfoModule = {
  register: (definition: { id: string; render: (context: unknown) => void }) => void;
  list: () => Widget[];
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
  const sourceFiles = [
    's650_center_info.js',
    's650_center_info_drive.js',
    's650_center_info_tire_temp.js',
    's650_center_info_performance.js',
  ];
  const source = sourceFiles
    .map((fileName) => readFileSync(resolve(process.cwd(), `../hud_overlay/s650_hmi/assets/${fileName}`), 'utf8'))
    .join('\n');
  const window = {} as { S650HmiCenterInfo?: CenterInfoModule };
  new Function('window', source)(window);

  if (!window.S650HmiCenterInfo) {
    throw new Error('S650 center-info module did not register itself');
  }
  return window.S650HmiCenterInfo;
}

describe('S650 center-information registry contract', () => {
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

  it('passes the layout region into the selected page renderer', () => {
    let driveArgs: unknown[] = [];
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: (...args) => { driveArgs = args; },
        drawTireTemperatureWidget: () => undefined,
        drawPerformanceWidget: () => undefined,
      },
      contract: { centerWidgets: ['drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({ centerWidget: 'drive' }, {}, {}, 100, 50, 200, 100);

    expect(driveArgs[3]).toBe(200);
    expect(driveArgs[4]).toBe(88);
    expect(driveArgs[5]).toBe(128);
  });

  it('rejects duplicate page registration', () => {
    const module = loadCenterInfoModule();

    expect(() => module.register({ id: 'drive', render: () => undefined })).toThrow('Duplicate page id: drive');
  });
});
