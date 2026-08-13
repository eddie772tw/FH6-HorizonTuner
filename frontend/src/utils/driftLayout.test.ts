import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type DriftLayout = {
  getViewportTransform: (width: number, height: number, bottomMargin: number) => {
    scale: number;
    offsetX: number;
    offsetY: number;
  };
  getBottomRightAnchor: (width: number, height: number, contentWidth: number, contentHeight: number, padding: number) => {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  };
  getCenteredBottomAnchor: (width: number, height: number, contentWidth: number, contentHeight: number, padding: number) => {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
  };
  getFh6PrimaryAnchor: (width: number, height: number, contentWidth: number, contentHeight: number) => {
    centerX: number;
    centerY: number;
    width: number;
    height: number;
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
    const transform = layout.getViewportTransform(2048, 1152, 0);

    expect(transform.scale).toBeCloseTo(2048 / 1680);
    expect(transform.offsetX).toBeCloseTo(0);
    expect(transform.offsetY).toBeGreaterThan(0);
    expect(transform.offsetY + 611 * transform.scale).toBeCloseTo(1117.1, 0);
  });

  it('keeps top and bottom arc points on the same ellipse as the frame decoration', () => {
    const layout = loadLayout();
    const top = layout.ellipsePoint(0.82, 840, 320, 350, 412, 174, 'top');
    const bottom = layout.ellipsePoint(0.82, 840, 320, 350, 412, 174, 'bottom');

    expect(top.x).toBe(bottom.x);
    expect(top.y).toBeCloseTo(320 - (bottom.y - 320));
  });

  it('anchors the secondary box like the conventional bottom-right HUDs', () => {
    const layout = loadLayout();
    const anchor = layout.getBottomRightAnchor(2048, 1152, 590, 288, 30);

    expect(anchor.centerX).toBe(1723);
    expect(anchor.centerY).toBe(978);
    expect(anchor.width).toBe(590);
    expect(anchor.height).toBe(288);
  });

  it('anchors a primary layer to the viewport bottom center like GT7', () => {
    const layout = loadLayout();
    const anchor = layout.getCenteredBottomAnchor(2048, 1152, 680, 288, 180);

    expect(anchor.centerX).toBe(1024);
    expect(anchor.centerY).toBe(828);
    expect(anchor.width).toBe(680);
    expect(anchor.height).toBe(288);
  });

  it('doubles and lowers the primary from the left side-wing edge', () => {
    const layout = loadLayout();
    const anchor = layout.getFh6PrimaryAnchor(1920, 1080, 260, 860 / 380);

    expect(anchor.centerX).toBeCloseTo(552.96);
    expect(anchor.width).toBeCloseTo(399.36);
    expect(anchor.centerX - anchor.width * 0.5).toBeCloseTo(353.28);
    expect(anchor.centerX + anchor.width * 0.5).toBeCloseTo(752.64);
    expect(anchor.centerY).toBeCloseTo(1080 * 0.8 - 1080 * 0.025 - anchor.height * 0.5 + anchor.height * 0.75);
    expect(anchor.centerY + anchor.height * 0.5).toBeLessThan(1080);
  });

  it('keeps the lowered primary inside the viewport on narrow viewports', () => {
    const layout = loadLayout();
    const anchor = layout.getFh6PrimaryAnchor(1024, 576, 260, 860 / 380);

    expect(anchor.width).toBeLessThan(240);
    expect(anchor.centerY + anchor.height * 0.5).toBeLessThan(576);
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
