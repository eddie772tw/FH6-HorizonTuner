import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type LayoutModule = {
  create: (options: Record<string, unknown>) => {
    render: (theme: string, data: unknown, palette: unknown, redlineRatio: number) => void;
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

describe('S650 Normal layout', () => {
  it('maps the reference layout to left RPM and right speed energy dials', () => {
    const dials: unknown[][] = [];
    const sideGauges: unknown[][] = [];
    const status: unknown[][] = [];
    const structureLines: number[][] = [];
    const layouts = loadLayoutsModule().create({
      ctx: {
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        moveTo: (...args: number[]) => structureLines.push(args),
        lineTo: (...args: number[]) => structureLines.push(args),
        stroke: () => undefined,
        fillText: () => undefined,
      },
      contract: { heritageTelemetrySlots: { center: {}, side: {} } },
      view: {
        gauge: { speedScaleMax: 360, leftCenterX: 256, rightCenterX: 1024, centerY: 250, radius: 180 },
        typography: { speedHero: 64, bodyM: 24, captionLegal: 16 },
        theme: 'normal',
        isMetric: true,
        showCenterInfo: false,
        showSpeed: true,
        showRPM: true,
        getSpeed: () => 120,
        roundedSpeed: () => 120,
        unitLabel: () => 'KM/H',
        getRpm: () => 4200,
        getMaxRpm: () => 8000,
        getPedalValue: () => 0,
        getTelemetryReadout: (slot: string) => ({ value: slot, unit: '%', ratio: 0.5 }),
      },
      primitives: {
        clearAndPaintBackground: () => undefined,
        drawHeader: () => undefined,
        drawNormalEnergyDial: (...args: unknown[]) => dials.push(args),
        drawSideGauge: (...args: unknown[]) => sideGauges.push(args),
        drawNormalStatus: (...args: unknown[]) => status.push(args),
        drawRoundedPanel: () => undefined,
        drawPedalBars: () => undefined,
        setFont: () => undefined,
      },
      baseDriving: { draw: () => undefined },
      centerInfo: { draw: () => { throw new Error('center info should be hidden'); } },
      width: 1280,
      height: 480,
    });

    layouts.render('normal', { redlineRpm: 7000 }, { background: '#000' }, 0.875);

    expect(dials).toHaveLength(2);
    expect(sideGauges).toHaveLength(2);
    expect(status).toHaveLength(1);
    expect(status[0][4]).toEqual({
      centerX: 640,
      topOffset: 147,
      bottomOffset: 141,
      topY: 82,
      bottomY: 374,
    });
    expect(sideGauges[0][0]).toBe(256);
    expect(sideGauges[1][0]).toBe(1024);
    expect(dials[0][2]).toBe(1024);
    expect(dials[0][7]).toBe('SPEED');
    expect(dials[0][10]).toMatchObject({ tickCount: 10, tickLabels: ['0', '30', '60', '90', '120', '150', '180', '210', '240', '270', '300'] });
    expect(dials[1][2]).toBe(256);
    expect(dials[1][7]).toBe('RPMx1000');
    expect(dials[1][10]).toMatchObject({ tickCount: 8, tickLabels: ['0', '1', '2', '3', '4', '5', '6', '7', '8'] });
    expect(structureLines).toEqual([
      [456, 144], [824, 144],
      [640, 158], [640, 348],
      [425, 350], [580, 350],
      [700, 350], [855, 350],
    ]);
    expect(layouts.baseDrivingRegions.normal).toEqual({ carousel: { centerX: 640, y: 399 } });
  });
});
