import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Widget = 'disable' | 'drive' | 'tire_temp' | 'performance';
type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX?: number;
  speedY?: number;
  gearY?: number;
  speedSize?: number;
  gearSize?: number;
};

type CenterInfoModule = {
  register: (definition: { id: string; render: (context: unknown) => void }) => void;
  list: () => Widget[];
  create: (options: {
    primitives: Record<string, (...args: unknown[]) => void>;
    contract: { centerWidgets: Widget[] };
    ctx?: Record<string, unknown>;
  }) => {
    draw: (view: { centerWidget?: string }, data: unknown, palette: unknown, regionOrX: Region | number, y?: number, width?: number, height?: number) => void;
    normalizeWidget: (view: { centerWidget?: string }) => Widget;
    widgets: Widget[];
  };
};

function createCanvasSpy() {
  const text: string[] = [];
  const ctx = {
    text,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    strokeRect: () => undefined,
    fillRect: () => undefined,
    fillText: (value: string) => text.push(value),
  } as unknown as Record<string, unknown>;
  return ctx;
}

function loadCenterInfoModule(): CenterInfoModule {
  const sourceFiles = [
    's650_center_info.js',
    's650_center_info_common.js',
    's650_center_info_disable.js',
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
  it('keeps Disable as an explicit blank page', () => {
    const calls: string[] = [];
    const primitives = {
      drawGearAndSpeed: () => calls.push('drawGearAndSpeed'),
    };
    const centerInfo = loadCenterInfoModule().create({
      primitives,
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({ centerWidget: 'disable' }, {}, {}, 425, 126, 430, 230);

    expect(calls).toEqual([]);
  });

  it('renders tire temperature as an isolated page on the shared Canvas', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({
      centerWidget: 'tire_temp',
      getTireTemperatures: () => [80, 81, 82, 83],
      tireTemperatureUnit: () => '°C',
      formatTireTemperature: (value) => `${value}°`,
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, 100, 50, 200, 100);

    expect((ctx.text as string[])[0]).toBe('TIRE TEMPERATURE');
  });

  it('renders performance as an isolated page on the shared Canvas', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({
      centerWidget: 'performance',
      isMetric: true,
      getRpm: () => 4200,
      getMaxRpm: () => 8000,
      getPedalValue: (_data, pedal) => pedal === 'throttle' ? 0.75 : 0.2,
      getGearLabel: () => '4',
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, 100, 50, 200, 100);

    expect((ctx.text as string[])).toContain('POWERTRAIN');
    expect((ctx.text as string[])).toContain('4200 / 8000');
    expect((ctx.text as string[])).not.toContain('4');
  });

  it('does not inject pedal bars into every page', () => {
    const pedalCalls: unknown[][] = [];
    const centerInfo = loadCenterInfoModule().create({
      ctx: createCanvasSpy(),
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
        drawPedalBars: (...args) => pedalCalls.push(args),
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({ centerWidget: 'disable' }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff' }, {
      x: 425,
      y: 132,
      width: 430,
      height: 224,
    });

    expect(pedalCalls).toHaveLength(0);
  });

  it('keeps pedal bars local to the driving page', () => {
    const ctx = createCanvasSpy();
    const centerInfo = loadCenterInfoModule().create({
      ctx,
      primitives: {
        setFont: () => undefined,
        getFontSize: (_view, _role, fallback) => fallback,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({
      centerWidget: 'drive',
      roundedSpeed: () => 120,
      unitLabel: () => 'KM/H',
      getGearLabel: () => '4',
      getTelemetryReadout: () => ({ value: '--', unit: '' }),
      getPedalValue: (_data, pedal) => pedal === 'throttle' ? 0.75 : 0.2,
    }, {}, { text: '#fff', secondary: '#aaa', primary: '#0ff', warning: '#ff0' }, {
      x: 425,
      y: 126,
      width: 430,
      height: 230,
    });

    expect((ctx.text as string[])).toContain('THR');
    expect((ctx.text as string[])).toContain('BRK');
  });

  it('uses the contract widget list and falls back to drive', () => {
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: () => undefined,
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    expect(centerInfo.widgets).toEqual(['disable', 'drive', 'tire_temp', 'performance']);
    expect(centerInfo.normalizeWidget({ centerWidget: 'unknown' })).toBe('drive');
  });

  it('does not use a layout region to render core drive values', () => {
    let driveArgs: unknown[] = [];
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: (...args) => { driveArgs = args; },
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({ centerWidget: 'drive' }, {}, {}, 100, 50, 200, 100);

    expect(driveArgs).toEqual([]);
  });

  it('does not use explicit drive anchors to render core values', () => {
    let driveArgs: unknown[] = [];
    const centerInfo = loadCenterInfoModule().create({
      primitives: {
        drawGearAndSpeed: (...args) => { driveArgs = args; },
      },
      contract: { centerWidgets: ['disable', 'drive', 'tire_temp', 'performance'] },
    });

    centerInfo.draw({ centerWidget: 'drive' }, {}, {}, {
      x: 10,
      y: 20,
      width: 300,
      height: 120,
      centerX: 170,
      speedY: 64,
      gearY: 106,
      speedSize: 46,
      gearSize: 68,
    });

    expect(driveArgs).toEqual([]);
  });

  it('rejects duplicate page registration', () => {
    const module = loadCenterInfoModule();

    expect(() => module.register({ id: 'drive', render: () => undefined })).toThrow('Duplicate page id: drive');
  });
});
