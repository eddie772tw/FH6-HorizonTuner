import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

describe('HUD scale baseline', () => {
  it('applies the S650 calibration through HUDCore at the 100% setting', () => {
    const container = { style: {} as { zoom?: number } };
    const hudCore = loadHudCore(container);

    hudCore.registerStyle('s650_hmi', {
      containerId: 's650Container',
      scaleBaseline: 3.0 * 0.7,
      scaleMultiplier: 0.75,
    });
    hudCore.init('s650_hmi');
    hudCore.handleMessage('config', {
      data: { scale: 1.0, actualScale: 99.0, elements: {} },
    });

    // 1.0 * (3.0 * 0.7) * 0.75 * 0.75 === 1.18125
    expect(container.style.zoom).toBe(1.18125);
  });
});
