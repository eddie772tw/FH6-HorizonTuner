import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const context: Record<string, any> = {};
runInNewContext(readFileSync(resolve(import.meta.dirname, '../../layout.js'), 'utf8'), context);
const L = context.R34Layout;
const profiles = [[1280, 720], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 360]];
function inside(box: any, width: number, height: number) {
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1e-6);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1e-6);
}
describe('independent lower-center instruments and corner MFD', () => {
  it.each(profiles)('fits %i×%i at compact/default/enlarged scales without crossing the MFD', (width, height) => {
    for (const scale of [.7, 1, 1.5, 2, 3]) {
      const g = L.layout(width, height, scale);
      for (const key of ['tach', 'speed', 'boost', 'temperature', 'screen']) inside(g[key], width, height);
      expect(g.boost.x + g.boost.width).toBeLessThan(g.tach.x);
      expect(g.tach.x + g.tach.width).toBeLessThan(g.speed.x);
      expect(g.speed.x + g.speed.width).toBeLessThan(g.temperature.x);
      expect(g.temperature.x + g.temperature.width).toBeLessThan(g.screen.x);
      expect(g.status.y + 12).toBeLessThanOrEqual(height);
      expect(g.screen.width / g.screen.height).toBeCloseTo(270 / 152);
      expect(g.screen.x + g.screen.width).toBeCloseTo(width - g.margin);
      expect(g.screen.y + g.screen.height).toBeCloseTo(height - g.margin);
    }
  });
  it.each(profiles)('keeps an independent meaningful MFD when the cluster is hidden at %i×%i', (width, height) => {
    const normal = L.layout(width, height, 1), hidden = L.layout(width, height, 1, false);
    expect(hidden.screen).toEqual(normal.screen);
    const enlarged = L.layout(width, height, 3, false); inside(enlarged.screen, width, height);
    expect(enlarged.screen.width).toBeGreaterThan(hidden.screen.width);
  });
  it('sanitizes invalid viewport and scale inputs', () => {
    expect(L.layout(NaN, 0, -1)).toEqual(L.layout(1920, 1080, 1));
  });
});
