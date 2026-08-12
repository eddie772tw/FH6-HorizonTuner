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
  const rectangles: Array<{ color: string; width: number; height: number }> = [];
  const fills: string[] = [];
  const text: string[] = [];
  const arcs: number[] = [];
  const ctx: Record<string, unknown> = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    closePath: () => undefined,
    arc: () => arcs.push(1),
    stroke: () => undefined,
    fill: () => fills.push(String(ctx.fillStyle || '')),
    fillRect: (_x: number, _y: number, width: number, height: number) => rectangles.push({
      color: String(ctx.fillStyle || ''), width, height,
    }),
    fillText: (value: string) => text.push(value),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    lineCap: '',
  };
  return { arcs, ctx, fills, rectangles, text };
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
    ? { value: '540', unit: 'HP' }
    : slot === 'boost'
      ? { value: '12.5', unit: 'PSI' }
      : slot === 'heading'
        ? { value: 'NE', unit: '' }
        : { value: '12.4', unit: 'km' },
  unitLabel: () => 'KM/H',
};

describe('S650 transparent performance layouts', () => {
  it('composes Track from the shared components without a full opaque backdrop', () => {
    const spy = createCanvasSpy();
    loadPerformanceModule().drawTrack(view, {}, palette, 0.875, spy.ctx);

    expect(spy.rectangles.filter((rectangle) => rectangle.color === palette.background)).toHaveLength(0);
    expect(spy.fills).toContain('rgba(19, 55, 79, 0.68)');
    expect(spy.text).toEqual(expect.arrayContaining([
      'RPM', 'TIRE TEMP', 'TEMP', 'FUEL', 'FL', 'FR', 'RL', 'RR',
    ]));
    expect(spy.text).not.toEqual(expect.arrayContaining(['TRACK USE ONLY', '140', '4 GEAR']));
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
