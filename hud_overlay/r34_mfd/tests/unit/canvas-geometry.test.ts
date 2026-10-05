import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const sandbox: Record<string, any> = {};
runInNewContext(readFileSync(resolve(import.meta.dirname, '../../canvas-geometry.js'), 'utf8'), sandbox);
const C = sandbox.R34CanvasGeometry;
describe('R34 canvas backing geometry', () => {
  it('increases backing resolution with DPR while preserving logical layout', () => {
    const one = C.geometry(300, 180, 1, 1), two = C.geometry(300, 180, 1, 2);
    expect(two.width).toBe(one.width); expect(two.height).toBe(one.height);
    expect(two.pixelWidth).toBe(one.pixelWidth * 2); expect(two.pixelHeight).toBe(one.pixelHeight * 2);
  });
  it('adapts to HUD scale and preserves aspect through independent pixel rounding', () => {
    const full = C.geometry(316, 182, .66, 2), compact = C.geometry(316, 182, .462, 2);
    expect(compact.pixelWidth).toBeLessThan(full.pixelWidth); expect(compact.pixelHeight).toBeLessThan(full.pixelHeight);
    expect(compact.width / compact.height).toBe(full.width / full.height);
    expect(compact.pixelWidth / compact.xScale).toBeCloseTo(compact.width);
    expect(compact.pixelHeight / compact.yScale).toBeCloseTo(compact.height);
  });
  it('bounds allocation for extreme scales without changing logical aspect', () => {
    const huge = C.geometry(300, 180, 100, 10);
    expect(huge.pixelWidth).toBeLessThanOrEqual(C.MAX_DIMENSION); expect(huge.pixelHeight).toBeLessThanOrEqual(C.MAX_DIMENSION);
    expect(huge.width / huge.height).toBe(300 / 180);
  });
  it.each([[0, 100], [100, 0], [-1, 10], [NaN, 50]])('does not allocate a zero-size or invalid surface', (w, h) => {
    const result = C.geometry(w, h, 1, 2); expect(result.drawable).toBe(false); expect(result.pixelWidth * result.pixelHeight).toBe(0);
  });
  it('uses safe density defaults for invalid scale/DPR', () => {
    expect(C.geometry(300, 180, NaN, 0)).toEqual(C.geometry(300, 180, 1, 1));
  });
});

it('restores the original backing after an upward then downward DPR transition', () => {
  const original = C.geometry(316, 182, .66, 1);
  const high = C.geometry(316, 182, .66, 2);
  const restored = C.geometry(316, 182, .66, 1);
  expect(high.pixelWidth).toBeGreaterThan(original.pixelWidth);
  expect(high.pixelHeight).toBeGreaterThan(original.pixelHeight);
  expect(restored).toEqual(original);
});
