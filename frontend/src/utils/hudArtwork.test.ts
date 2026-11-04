import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const scope: Record<string, any> = {};
vm.runInNewContext(readFileSync(new URL('../../../hud_overlay/shared/hud-artwork.js', import.meta.url), 'utf8'), scope);

describe('shared HUD artwork transparency', () => {
  it('softens dark backplates without losing markings or increasing existing alpha', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 0, 12, 14, 18, 255, 12, 14, 18, 100,
      240, 50, 10, 255, 200, 200, 200, 120, 40, 40, 40, 255,
    ]);
    scope.HUDArtwork.softenBackground(pixels, 0.18);
    expect([...pixels].filter((_, i) => i % 4 === 3)).toEqual([0, 46, 18, 255, 120, 150]);
    expect([...pixels].filter((_, i) => i % 4 !== 3)).toEqual([
      0, 0, 0, 12, 14, 18, 12, 14, 18, 240, 50, 10, 200, 200, 200, 40, 40, 40,
    ]);
  });

  it('removes the repeated dark background from illuminated overlay layers', () => {
    const pixels = new Uint8ClampedArray([8, 12, 16, 255, 255, 30, 0, 255]);
    scope.HUDArtwork.softenBackground(pixels, 0);
    expect([...pixels]).toEqual([8, 12, 16, 0, 255, 30, 0, 255]);
  });
});
