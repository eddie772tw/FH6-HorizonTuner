import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type PerformanceModule = {
  drawTrack: (...args: unknown[]) => void;
  drawSvtCobra: (...args: unknown[]) => void;
};

function loadPerformanceModule(): PerformanceModule {
  const componentSource = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_cluster_components.js'),
    'utf8',
  );
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/s650_hmi/assets/s650_performance_clusters.js'),
    'utf8',
  );
  const window = {} as { S650HmiPerformanceClusters?: PerformanceModule };
  new Function('window', componentSource)(window);
  new Function('window', source)(window);
  if (!window.S650HmiPerformanceClusters) throw new Error('performance layouts did not register');
  return window.S650HmiPerformanceClusters;
}

function createCanvasSpy() {
  const rectangles: Array<{ color: string; x: number; y: number; width: number; height: number }> = [];
  const fills: string[] = [];
  const text: string[] = [];
  const textEntries: Array<{ value: string; x: number; y: number; align: string; font: string }> = [];
  const arcs: number[] = [];
  const clips: number[] = [];
  const moves: Array<{ x: number; y: number }> = [];
  const lines: Array<{ x: number; y: number }> = [];
  const strokes: Array<{ color: string; width: number }> = [];
  const ctx: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: (x: number, y: number) => moves.push({ x, y }),
    lineTo: (x: number, y: number) => lines.push({ x, y }),
    quadraticCurveTo: () => undefined,
    closePath: () => undefined,
    clip: () => clips.push(1),
    arc: () => arcs.push(1),
    stroke: () => strokes.push({ color: String(ctx.strokeStyle || ''), width: Number(ctx.lineWidth || 0) }),
    fill: () => fills.push(String(ctx.fillStyle || '')),
    fillRect: (x: number, y: number, width: number, height: number) => rectangles.push({
      color: String(ctx.fillStyle || ''), x, y, width, height,
    }),
    fillText: (value: string, x: number, y: number) => {
      text.push(value);
      textEntries.push({ value, x, y, align: String(ctx.textAlign || ''), font: String(ctx.font || '') });
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    lineCap: '',
    globalAlpha: 1,
  };
  return { arcs, clips, ctx, fills, lines, moves, rectangles, strokes, text, textEntries };
}

const palette = {
  background: '#050608',
  primary: '#F04A3E',
  secondary: '#9AA3AD',
  text: '#F7F8FA',
  danger: '#FF3B30',
};

const view = {
  width: 1280,
  height: 480,
  isMetric: true,
  showSpeed: true,
  showGear: true,
  showRPM: true,
  getRpm: () => 6200,
  getMaxRpm: () => 8000,
  getSpeed: () => 140,
  roundedSpeed: () => 140,
  getGearLabel: () => '4',
  getFuelLevel: () => 0.7,
  getTireTemperatures: () => [170, 172, 168, 169],
  formatTireTemperature: (value: number) => String(Math.round(value)),
  getTelemetryReadout: (slot: string) => slot === 'power'
    ? { value: '540', unit: 'HP', ratio: 0.54 }
    : slot === 'boost'
      ? { value: '12.5', unit: 'PSI', ratio: 0.42 }
      : slot === 'heading'
        ? { value: 'NE', unit: '' }
        : slot === 'rpm'
          ? { value: '6200', unit: 'RPM' }
          : slot === 'speed'
            ? { value: '140', unit: 'KM/H' }
            : { value: '12.4', unit: 'km' },
  unitLabel: () => 'KM/H',
};

describe('S650 transparent performance layouts', () => {
  it('uses a clipped Track tachometer, right-aligned center info, dynamic rails and footer slots', () => {
    const spy = createCanvasSpy();
    const centerCalls: unknown[][] = [];
    const gearCalls: unknown[][] = [];
    loadPerformanceModule().drawTrack(view, {}, palette, 0.875, spy.ctx, {
      centerInfo: { draw: (...args: unknown[]) => centerCalls.push(args) },
      primitives: { drawGearCarousel: (...args: unknown[]) => gearCalls.push(args) },
    });

    expect(spy.rectangles.filter((rectangle) => rectangle.color === palette.background)).toHaveLength(0);
    expect(spy.clips).toHaveLength(1);
    // The lower-game UI needs the Track band at its original upper anchor.
    // The first path starts at the tachometer's lower-left outline point.
    expect(spy.moves[0]).toEqual({ x: 96, y: 182 });
    expect(spy.lines.slice(0, 4)).toEqual([
      { x: 190, y: 86 }, { x: 1122, y: 86 },
      { x: 1122, y: 162.8 }, { x: 190, y: 162.8 },
    ]);
    expect(spy.rectangles.map((rectangle) => rectangle.color)).toEqual(expect.arrayContaining([
      'rgba(160, 144, 255, 0.12)', 'rgba(255, 59, 48, 0.50)', palette.primary,
    ]));
    expect(spy.rectangles.find((rectangle) => rectangle.color === 'rgba(255, 59, 48, 0.50)')).toMatchObject({
      x: 1005.5, width: 116.5,
    });
    const activeBand = spy.rectangles.find((rectangle) => rectangle.color === palette.primary);
    expect(activeBand).toMatchObject({ x: 96 });
    expect(activeBand?.width).toBeCloseTo(816.3, 8);
    expect(spy.strokes).toContainEqual({ color: palette.primary, width: 8 });
    expect(spy.text).toEqual(expect.arrayContaining([
      'RPM', '540 HP', '12.5 PSI', '12.4 km', 'NE', '6200 RPM', '140 KM/H', 'SPEED KM/H', 'GEAR', '140', '4',
    ]));
    expect(spy.text).not.toEqual(expect.arrayContaining(['TRACK USE ONLY', 'TIRE TEMP', 'TEMP', 'FUEL', 'P  R  N  D  M']));
    expect(spy.textEntries).toEqual(expect.arrayContaining([
      { value: '4', x: 255, y: 253, align: 'center', font: '700 57px Arial Narrow, Arial, sans-serif' },
      { value: '140', x: 408, y: 253, align: 'right', font: '700 57px Arial Narrow, Arial, sans-serif' },
    ]));
    expect(spy.moves).toEqual(expect.arrayContaining([{ x: 310, y: 208 }]));
    expect(centerCalls).toHaveLength(1);
    expect(centerCalls[0][3]).toEqual({ x: 840, y: 184, width: 220, height: 88, layoutStyle: 'trackSidebar' });
    expect(gearCalls).toHaveLength(1);
    expect(gearCalls[0].slice(3)).toEqual([640, 407]);
  });

  it('keeps the live Track fill readable after it enters the redline zone', () => {
    const spy = createCanvasSpy();
    loadPerformanceModule().drawTrack({ ...view, getRpm: () => 7800 }, {}, palette, 0.875, spy.ctx, {
      centerInfo: { draw: () => undefined },
      primitives: { drawGearCarousel: () => undefined },
    });

    const redlineIndex = spy.rectangles.findIndex((rectangle) => rectangle.color === 'rgba(255, 59, 48, 0.50)');
    const activeIndex = spy.rectangles.findIndex((rectangle) => rectangle.color === palette.primary);
    expect(redlineIndex).toBeGreaterThanOrEqual(0);
    expect(activeIndex).toBeGreaterThan(redlineIndex);
    expect(spy.rectangles[activeIndex]).toMatchObject({ x: 96 });
    expect(spy.rectangles[activeIndex].width).toBeCloseTo(1002.7, 8);
  });

  it('gives SVT Cobra two analog rings with distinct SVT labels and red needles', () => {
    const spy = createCanvasSpy();
    loadPerformanceModule().drawSvtCobra(view, {}, palette, 0.875, spy.ctx);

    expect(spy.rectangles.filter((rectangle) => rectangle.color === palette.background)).toHaveLength(0);
    expect(spy.arcs.length).toBeGreaterThanOrEqual(6);
    expect(spy.text).toEqual(expect.arrayContaining([
      'SVT COBRA', 'SVT  RPM x1000', 'KM/H', 'POWER  540 HP', 'BOOST  12.5 PSI',
    ]));
  });
});
