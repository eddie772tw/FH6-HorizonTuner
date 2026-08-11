import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DriftLayout = {
  getViewportTransform: (width: number, height: number, bottomMargin: number) => {
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  ellipsePoint: (t: number, centerX: number, centerY: number, halfWidth: number, radiusX: number, radiusY: number, side: string) => { x: number; y: number };
  fillSweepState: (progress: number, maxRpm: number, target: { rpm: number; angle: number; speed: number }) => { rpm: number; angle: number; speed: number };
};

function loadLayout(): DriftLayout {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/drift/assets/drift_layout.js'),
    'utf8',
  );
  const window = {} as { DriftLayout?: DriftLayout };
  new Function('window', source)(window);
  if (!window.DriftLayout) throw new Error('Drift layout did not register itself');
  return window.DriftLayout;
}

describe('Drift viewport layout', () => {
  it('anchors the logical instrument group to the full viewport above the bottom HUD', () => {
    const layout = loadLayout();
    const transform = layout.getViewportTransform(2048, 1152, 72);

    expect(transform.scale).toBeCloseTo(2048 / 1680);
    expect(transform.offsetX).toBeCloseTo(0);
    expect(transform.offsetY).toBeGreaterThan(0);
  });

  it('keeps top and bottom arc points on the same ellipse as the frame decoration', () => {
    const layout = loadLayout();
    const top = layout.ellipsePoint(0.82, 840, 320, 350, 412, 174, 'top');
    const bottom = layout.ellipsePoint(0.82, 840, 320, 350, 412, 174, 'bottom');

    expect(top.x).toBe(bottom.x);
    expect(top.y).toBeCloseTo(320 - (bottom.y - 320));
  });

  it('sweeps the visual RPM and angle before settling at idle', () => {
    const layout = loadLayout();
    const state = { rpm: 0, angle: 0, speed: 0 };

    layout.fillSweepState(0, 9000, state);
    expect(state.angle).toBe(-60);
    expect(state.rpm).toBe(0);

    layout.fillSweepState(0.55, 9000, state);
    expect(state.angle).toBeCloseTo(60);
    expect(state.rpm).toBeCloseTo(9000);

    layout.fillSweepState(1, 9000, state);
    expect(state.angle).toBeCloseTo(0);
    expect(state.rpm).toBeCloseTo(900);
  });
});
