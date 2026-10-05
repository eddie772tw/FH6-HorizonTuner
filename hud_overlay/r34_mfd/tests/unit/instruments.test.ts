import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const context: Record<string, any> = {};
for (const name of ['model', 'instruments']) runInNewContext(readFileSync(resolve(import.meta.dirname, '../../' + name + '.js'), 'utf8'), context);
const I = context.R34Instruments;
const direction = (degrees: number) => ({ x: Math.cos(degrees * Math.PI / 180), y: Math.sin(degrees * Math.PI / 180) });
describe('reference-grounded dial geometry', () => {
  it.each([[0, 10000], [3000, 9000]])('keeps tach %i and %i mirrored about the vertical axis', (left, right) => {
    const a = direction(I.tachAngle(left)), b = direction(I.tachAngle(right));
    expect(a.x).toBeCloseTo(-b.x); expect(a.y).toBeCloseTo(b.y);
  });
  it('compresses each low-range thousand equally, then uses the larger uniform high-range interval', () => {
    for (let rpm = 0; rpm < 3000; rpm += 1000) expect(I.tachAngle(rpm + 1000) - I.tachAngle(rpm)).toBeCloseTo(10);
    for (let rpm = 3000; rpm < 10000; rpm += 1000) expect(I.tachAngle(rpm + 1000) - I.tachAngle(rpm)).toBeCloseTo(30);
    expect(I.tachAngle(3000.001) - I.tachAngle(2999.999)).toBeLessThan(.001);
    expect(I.tachAngle(-1)).toBe(I.tachAngle(0)); expect(I.tachAngle(12000)).toBe(I.tachAngle(10000));
  });
  it('keeps the Nür 300 analog scale and clamps only geometric over-range', () => {
    expect(I.SPEED_MAX).toBe(300);
    expect(I.speedAngle(150)).toBeCloseTo((I.speedAngle(0) + I.speedAngle(300)) / 2);
    expect(I.speedAngle(360)).toBe(I.speedAngle(300)); expect(I.speedAngle(-1)).toBe(I.speedAngle(0));
  });
  it('uses mirrored, visibly off-center pivots shared by artwork and live needle transforms', () => {
    const { face, temperature, boost } = I.AUXILIARY_GEOMETRY;
    expect(temperature.cx).toBeLessThan(face.cx); expect(boost.cx).toBeGreaterThan(face.cx);
    expect(face.cx - temperature.cx).toBeCloseTo(boost.cx - face.cx);
    expect(temperature.cy).toBe(face.cy); expect(boost.cy).toBe(face.cy);
    for (const kind of ['temperature', 'boost']) {
      const g = I.AUXILIARY_GEOMETRY[kind];
      expect(Math.abs(g.cx - face.cx) / face.radius).toBeGreaterThan(.2);
      expect(I.auxiliaryTransform(kind, .5)).toBe(`translate(${g.cx} ${g.cy}) rotate(${I.auxiliaryAngle(kind, .5)})`);
    }
  });
  it.each([0, .5, 1])('mirrors cold/low to hot/high motion around opposite hemispheres at ratio %s', ratio => {
    const temp = direction(I.auxiliaryAngle('temperature', ratio)), boost = direction(I.auxiliaryAngle('boost', ratio));
    expect(temp.x).toBeGreaterThan(0); expect(boost.x).toBeLessThan(0);
    expect(temp.x).toBeCloseTo(-boost.x); expect(temp.y).toBeCloseTo(boost.y);
    if (ratio === 0) expect(temp.y).toBeGreaterThan(0);
    else if (ratio === 1) expect(temp.y).toBeLessThan(0);
    else expect(temp.y).toBeCloseTo(0);
  });
  it('keeps both offset sweeps and tick endpoints inside their own face across the full range', () => {
    const { face } = I.AUXILIARY_GEOMETRY;
    for (const kind of ['temperature', 'boost']) {
      const g = I.AUXILIARY_GEOMETRY[kind];
      for (let index = 0; index <= 20; index++) {
        const d = direction(I.auxiliaryAngle(kind, index / 20));
        for (const radius of [g.needleLength, g.tickInner, g.tickOuter]) {
          const x = g.cx + d.x * radius - face.cx, y = g.cy + d.y * radius - face.cy;
          expect(Math.hypot(x, y)).toBeLessThan(face.radius);
        }
      }
      expect(I.auxiliaryAngle(kind, -1)).toBe(I.auxiliaryAngle(kind, 0));
      expect(I.auxiliaryAngle(kind, 2)).toBe(I.auxiliaryAngle(kind, 1));
    }
  });
});
