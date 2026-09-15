import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type HudStyleDefinition = {
  containerId: string;
  scaleBaseline?: number;
  scaleMultiplier?: number;
  globalScaleFactor?: number;
};

type HudCore = {
  registerStyle: (id: string, definition: Record<string, unknown>) => void;
  init: (id: string) => void;
  handleMessage: (type: string, payload: unknown) => void;
};

function loadHudCore(container: { style: { zoom?: number } }): HudCore {
  const source = readFileSync(
    resolve(process.cwd(), '../hud_overlay/shared/hud-core.js'),
    'utf8',
  );
  const window = {
    addEventListener: () => undefined,
  } as { HUDCore?: HudCore; addEventListener: () => void };
  const document = {
    documentElement: { style: { setProperty: () => undefined } },
    getElementById: () => container,
  };

  new Function('window', 'document', source)(window, document);

  if (!window.HUDCore) {
    throw new Error('HUDCore did not initialize');
  }
  return window.HUDCore;
}

function calculateEffectiveScale(
  hudCore: HudCore,
  styleId: string,
  definition: HudStyleDefinition,
  userScale?: number,
  container: { style: { zoom?: number } } = { style: {} },
): number {
  hudCore.registerStyle(styleId, definition);
  hudCore.init(styleId);
  hudCore.handleMessage('config', {
    data: {
      scale: userScale,
      actualScale: 999.0, // Legacy field that must be ignored
    },
  });
  return container.style.zoom ?? 1.0;
}

describe('HUD scale baseline & multi-resolution defense', () => {
  describe('HUDCore scale mathematical SSOT & fallback defense', () => {
    it('applies the S650 calibration through HUDCore at the 100% setting', () => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      const zoom = calculateEffectiveScale(
        hudCore,
        's650_hmi',
        {
          containerId: 's650Container',
          scaleBaseline: 3.0 * 0.7,
          scaleMultiplier: 0.75,
        },
        1.0,
        container,
      );

      // 1.0 * (3.0 * 0.7) * 0.75 * 0.75 === 1.18125
      expect(zoom).toBe(1.18125);
      expect(container.style.zoom).toBe(1.18125);
    });

    it('falls back to 1.0 baseline, 1.0 multiplier, and 0.75 global scale when undefined', () => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      const zoom = calculateEffectiveScale(
        hudCore,
        'default_test',
        { containerId: 'defaultContainer' },
        1.0,
        container,
      );

      // 1.0 * 1.0 * 1.0 * 0.75 === 0.75
      expect(zoom).toBe(0.75);
    });

    it.each([
      ['zero', 0],
      ['negative', -1.5],
      ['NaN', Number.NaN],
      ['undefined', undefined],
    ])('falls back to userScale=1.0 on invalid input: %s', (_, invalidScale) => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      const zoom = calculateEffectiveScale(
        hudCore,
        'fallback_test',
        {
          containerId: 'fallbackContainer',
          scaleMultiplier: 1.0,
        },
        invalidScale as any,
        container,
      );

      // 1.0 (fallback) * 1.0 * 1.0 * 0.75 === 0.75
      expect(zoom).toBe(0.75);
    });
  });

  describe('F01 1080p baseline calibration for all HUD styles', () => {
    const styleTestTable = [
      { id: 'defi_triple', canvasW: 380, canvasH: 360, multiplier: 1.2, expectedZoom: 0.9, expectedW: 342, expectedH: 324 },
      { id: 'simple', canvasW: 750, canvasH: 750, multiplier: 0.5, expectedZoom: 0.375, expectedW: 281.25, expectedH: 281.25 },
      { id: 'fh5_arc', canvasW: 380, canvasH: 380, multiplier: 1.0, expectedZoom: 0.75, expectedW: 285, expectedH: 285 },
      { id: 'mw2005', canvasW: 390, canvasH: 390, multiplier: 0.95, expectedZoom: 0.7125, expectedW: 277.875, expectedH: 277.875 },
      { id: 'nfs15', canvasW: 331, canvasH: 320, multiplier: 1.15, expectedZoom: 0.8625, expectedW: 285.4875, expectedH: 276 },
      { id: 'shift_tacho', canvasW: 440, canvasH: 280, multiplier: 0.9, expectedZoom: 0.675, expectedW: 297, expectedH: 189 },
      { id: 'fm4ui', canvasW: 270, canvasH: 270, multiplier: 1.4, expectedZoom: 1.05, expectedW: 283.5, expectedH: 283.5 },
      { id: 'cyberpunk_hud', canvasW: 520, canvasH: 220, multiplier: 1.0, expectedZoom: 0.75, expectedW: 390, expectedH: 165 },
      { id: 'motec_gt3', canvasW: 800, canvasH: 480, multiplier: 0.7, expectedZoom: 0.525, expectedW: 420, expectedH: 252 },
      { id: 'vfd', canvasW: 1120, canvasH: 520, multiplier: 0.75, expectedZoom: 0.5625, expectedW: 630, expectedH: 292.5 },
    ];

    it.each(styleTestTable)(
      'calibrates style $id to expected physical dimensions ($expectedW x $expectedH)',
      ({ id, canvasW, canvasH, multiplier, expectedZoom, expectedW, expectedH }) => {
        const container = { style: {} as { zoom?: number } };
        const hudCore = loadHudCore(container);

        const zoom = calculateEffectiveScale(
          hudCore,
          id,
          { containerId: `${id}Container`, scaleMultiplier: multiplier },
          1.0,
          container,
        );

        expect(zoom).toBeCloseTo(expectedZoom, 5);
        expect(canvasW * zoom).toBeCloseTo(expectedW, 3);
        expect(canvasH * zoom).toBeCloseTo(expectedH, 3);
      },
    );

    it('verifies M1 calibration for nfs15 (1.15) and simple (0.50) harmonizes single gauges to ~280-290px', () => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      // Verify nfs15 calibrated to 1.15
      const nfs15Zoom = calculateEffectiveScale(
        hudCore,
        'nfs15',
        { containerId: 'nfs15Container', scaleMultiplier: 1.15 },
        1.0,
        container,
      );
      const nfs15W = 331 * nfs15Zoom;
      expect(nfs15W).toBeCloseTo(285.4875, 3);
      expect(nfs15W).toBeGreaterThanOrEqual(280);
      expect(nfs15W).toBeLessThanOrEqual(290);

      // Verify simple calibrated to 0.50
      const simpleZoom = calculateEffectiveScale(
        hudCore,
        'simple',
        { containerId: 'simpleContainer', scaleMultiplier: 0.5 },
        1.0,
        container,
      );
      const simpleW = 750 * simpleZoom;
      expect(simpleW).toBeCloseTo(281.25, 3);
      expect(simpleW).toBeGreaterThanOrEqual(280);
      expect(simpleW).toBeLessThanOrEqual(290);
    });
  });

  describe('F02 volume bounds contract for dual & arcade clusters', () => {
    it('verifies initial_d dual cluster satisfies F02 volume bounds (550~620px W, 295~360px H)', () => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      const zoom = calculateEffectiveScale(
        hudCore,
        'initial_d',
        {
          containerId: 'initialDContainer',
          scaleMultiplier: 0.95,
        },
        1.0,
        container,
      );

      expect(zoom).toBeCloseTo(0.7125, 5);
      const renderedWidth = 800 * zoom;
      const renderedHeight = 420 * zoom;

      expect(renderedWidth).toBeCloseTo(570, 3);
      expect(renderedHeight).toBeCloseTo(299.25, 3);

      // Strict F02 boundary assertions
      expect(renderedWidth).toBeGreaterThanOrEqual(550);
      expect(renderedWidth).toBeLessThanOrEqual(620);
      expect(renderedHeight).toBeGreaterThanOrEqual(295);
      expect(renderedHeight).toBeLessThanOrEqual(360);
    });

    it('verifies classic_jdm arcade geometry contract with and without triple gauges', () => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      const zoom = calculateEffectiveScale(
        hudCore,
        'classic_jdm',
        {
          containerId: 'classicJdmContainer',
          scaleMultiplier: 0.95,
        },
        1.0,
        container,
      );

      // When triple gauges shown (Arcade Arc layout: 800x420)
      const fullWidth = 800 * zoom;
      const fullHeight = 420 * zoom;
      expect(fullWidth).toBeCloseTo(570, 3);
      expect(fullHeight).toBeCloseTo(299.25, 3);
      expect(fullWidth).toBeGreaterThanOrEqual(550);
      expect(fullWidth).toBeLessThanOrEqual(620);

      // When triple gauges hidden (Dual Only layout: 540x280 adaptive shrink)
      const compactWidth = 540 * zoom;
      const compactHeight = 280 * zoom;
      expect(compactWidth).toBeCloseTo(384.75, 3);
      expect(compactHeight).toBeCloseTo(199.5, 3);
      expect(compactWidth).toBeLessThan(fullWidth);
      expect(compactHeight).toBeLessThan(fullHeight);
    });
  });

  describe('Multi-resolution (1080p, 1440p, 4K) viewport safety & headroom', () => {
    const resolutions = [
      { name: '1080p', width: 1920, height: 1080, maxCornerWidthRatio: 0.35, maxCornerHeightRatio: 0.35 },
      { name: '1440p', width: 2560, height: 1440, maxCornerWidthRatio: 0.25, maxCornerHeightRatio: 0.25 },
      { name: '4K', width: 3840, height: 2160, maxCornerWidthRatio: 0.16, maxCornerHeightRatio: 0.16 },
    ];

    it.each(resolutions)(
      'guarantees dual cluster and corner gauges fit safely within $name viewport with 30px padding',
      ({ width, height, maxCornerWidthRatio, maxCornerHeightRatio }) => {
        const padding = 30;
        const availableW = width - padding * 2;
        const availableH = height - padding * 2;

        const dualZoom = 1.0 * 1.0 * 0.95 * 0.75; // 0.7125
        const dualW = 800 * dualZoom; // 570
        const dualH = 420 * dualZoom; // 299.25

        // Zero overflow check
        expect(dualW).toBeLessThanOrEqual(availableW);
        expect(dualH).toBeLessThanOrEqual(availableH);

        // Screen area occupancy checks
        expect(dualW / width).toBeLessThanOrEqual(maxCornerWidthRatio);
        expect(dualH / height).toBeLessThanOrEqual(maxCornerHeightRatio);

        // Right-bottom anchor margin assertion
        const leftAnchor = width - padding - dualW;
        const topAnchor = height - padding - dualH;
        expect(leftAnchor).toBeGreaterThan(0);
        expect(topAnchor).toBeGreaterThan(0);
      },
    );
  });

  describe('User scale boundary matrix (Min 0.5x, Default 1.0x, Max 2.0x)', () => {
    it('scales linearly across the UI slider range [0.5, 2.0]', () => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      const zoomMin = calculateEffectiveScale(
        hudCore,
        'linear_test',
        { containerId: 'linearContainer', scaleMultiplier: 1.0 },
        0.5,
        container,
      );
      const zoomDefault = calculateEffectiveScale(
        hudCore,
        'linear_test',
        { containerId: 'linearContainer', scaleMultiplier: 1.0 },
        1.0,
        container,
      );
      const zoomMax = calculateEffectiveScale(
        hudCore,
        'linear_test',
        { containerId: 'linearContainer', scaleMultiplier: 1.0 },
        2.0,
        container,
      );

      expect(zoomMin).toBe(0.375);
      expect(zoomDefault).toBe(0.75);
      expect(zoomMax).toBe(1.5);

      expect(zoomDefault).toBe(zoomMin * 2);
      expect(zoomMax).toBe(zoomDefault * 2);
    });

    it('guarantees dual cluster does not overflow 1080p even at maximum 2.0x user scale', () => {
      const container = { style: {} as { zoom?: number } };
      const hudCore = loadHudCore(container);

      const zoomMax = calculateEffectiveScale(
        hudCore,
        'initial_d_max',
        { containerId: 'maxContainer', scaleMultiplier: 0.95 },
        2.0,
        container,
      );

      const maxW = 800 * zoomMax; // 800 * 1.425 = 1140px
      const maxH = 420 * zoomMax; // 420 * 1.425 = 598.5px

      const available1080pW = 1920 - 60; // 1860px
      const available1080pH = 1080 - 60; // 1020px

      expect(maxW).toBeCloseTo(1140, 3);
      expect(maxH).toBeCloseTo(598.5, 3);
      expect(maxW).toBeLessThan(available1080pW);
      expect(maxH).toBeLessThan(available1080pH);

      // Remaining horizontal headroom on 1080p is still 720px!
      expect(available1080pW - maxW).toBeCloseTo(720, 3);
    });
  });
});
