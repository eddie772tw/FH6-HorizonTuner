import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

type LayoutModule = {
  create: (options: Record<string, unknown>) => {
    render: (theme: string, data: unknown, palette: unknown, redlineRatio: number) => void;
    names: string[];
    centerRegions: Record<string, Region>;
    baseDrivingRegions: Record<string, unknown>;
  };
};

function loadLayoutsModule(): LayoutModule {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_layouts.js'),
    'utf8',
  );
  const window = {} as { S650HmiLayouts?: LayoutModule };
  new Function('window', source)(window);

  if (!window.S650HmiLayouts) {
    throw new Error('S650 layouts module did not register itself');
  }
  return window.S650HmiLayouts;
}

function createLayouts(
  centerInfo: { draw: (...args: unknown[]) => void },
  baseDriving: { draw: (...args: unknown[]) => void } = { draw: () => undefined },
  showCenterInfo = true,
) {
  return loadLayoutsModule().create({
    ctx: {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      fillText: () => undefined,
      clearRect: () => undefined,
      fillRect: () => undefined,
    },
    contract: { heritageTelemetrySlots: { center: {}, side: {} } },
    view: {
      gauge: {
        speedScaleMax: 300,
        leftCenterX: 315,
        rightCenterX: 945,
        centerY: 240,
        radius: 180,
      },
      typography: { speedHero: 64 },
      theme: 'normal',
      showCenterInfo,
      showSpeed: false,
      showRPM: false,
      isMetric: true,
      width: 1260,
      getSpeed: () => 0,
      getMaxRpm: () => 8000,
      getRpm: () => 0,
      getTelemetryReadout: () => ({ value: '--', unit: '', ratio: null }),
    },
    primitives: {
      clearAndPaintBackground: () => undefined,
      drawHeader: () => undefined,
      drawRoundedPanel: () => undefined,
      drawPedalBars: () => undefined,
      drawHeritageStatus: () => undefined,
      drawHeritageSideGauge: () => undefined,
      drawHeritageDial: () => undefined,
      getHeritageDialScale: () => ({ max: 80 }),
      setFont: () => undefined,
    },
    centerInfo,
    baseDriving,
    width: 1260,
    height: 472,
  });
}

describe('S650 center-information layout regions', () => {
  it('exposes independent coordinate regions for supported analog layouts', () => {
    const layouts = createLayouts({ draw: () => undefined });

    expect(layouts.centerRegions.normal).toMatchObject({
      x: 425,
      y: 132,
      width: 430,
      height: 224,
      centerX: 640,
      speedY: 190,
      gearY: 302,
    });
    expect(layouts.centerRegions.foxbody).toEqual({
      x: 425,
      y: 122,
      width: 430,
      height: 210,
    });
    expect(layouts.centerRegions.heritage67).toEqual({
      x: 425,
      y: 126,
      width: 430,
      height: 230,
    });
    expect(layouts.names).toEqual(['normal', 'foxbody', 'heritage67']);
  });

  it('routes Normal through the named region instead of inline coordinates', () => {
    const centerCalls: unknown[][] = [];
    const baseCalls: unknown[][] = [];
    const layouts = createLayouts(
      { draw: (...args) => centerCalls.push(args) },
      { draw: (...args) => baseCalls.push(args) },
    );

    layouts.render('normal', {}, { background: '#000' }, 1);

    expect(centerCalls).toHaveLength(1);
    expect(centerCalls[0][3]).toEqual(layouts.centerRegions.normal);
    expect(baseCalls).toHaveLength(1);
    expect(baseCalls[0][3]).toEqual(layouts.baseDrivingRegions.normal);
  });

  it('keeps base driving active when center information is hidden', () => {
    const baseCalls: unknown[][] = [];
    const layouts = createLayouts(
      { draw: () => { throw new Error('center info must be skipped'); } },
      { draw: (...args) => baseCalls.push(args) },
      false,
    );

    (['normal', 'foxbody', 'heritage67'] as const).forEach((theme) => {
      layouts.render(theme, { redlineRpm: 6500 }, { background: '#000' }, 1);
    });

    expect(baseCalls.map((call) => call[3])).toEqual([
      layouts.baseDrivingRegions.normal,
      layouts.baseDrivingRegions.foxbody,
      layouts.baseDrivingRegions.heritage67,
    ]);
  });
});
