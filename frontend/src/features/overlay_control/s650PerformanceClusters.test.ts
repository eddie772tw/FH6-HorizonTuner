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
  const arcs: number[] = [];
  const clips: number[] = [];
  const ctx: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    closePath: () => undefined,
    clip: () => clips.push(1),
    arc: () => arcs.push(1),
    stroke: () => undefined,
    fill: () => fills.push(String(ctx.fillStyle || '')),
    fillRect: (x: number, y: number, width: number, height: number) => rectangles.push({
      color: String(ctx.fillStyle || ''), x, y, width, height,
    }),
    fillText: (value: string) => text.push(value),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    lineCap: '',
    globalAlpha: 1,
  };
  return { arcs, clips, ctx, fills, rectangles, text };
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
    expect(spy.rectangles.map((rectangle) => rectangle.color)).toEqual(expect.arrayContaining([
      'rgba(160, 144, 255, 0.12)', 'rgba(255, 59, 48, 0.50)', palette.primary,
    ]));
    expect(spy.text).toEqual(expect.arrayContaining([
      'RPM', '540 HP', '12.5 PSI', '12.4 km', 'NE', '6200 RPM', '140 KM/H',
    ]));
    expect(spy.text).not.toEqual(expect.arrayContaining(['TRACK USE ONLY', 'TIRE TEMP', 'TEMP', 'FUEL', 'P  R  N  D  M']));
    expect(centerCalls).toHaveLength(1);
    expect(centerCalls[0][3]).toEqual({ x: 782, y: 184, width: 286, height: 164 });
    expect(gearCalls).toHaveLength(1);
    expect(gearCalls[0].slice(3)).toEqual([640, 407]);
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
