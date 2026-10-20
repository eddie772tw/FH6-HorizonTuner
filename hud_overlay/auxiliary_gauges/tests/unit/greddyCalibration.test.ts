import { describe, expect, it } from 'vitest';
// @ts-expect-error Standalone HUD calibration is consumed directly by the browser.
import { greddyOilPressureAngle } from '../../greddy-calibration.js';

// Independently measured directions of the printed white ticks in the original
// PNG, not outputs copied from the mapping under test. Method: ../visual/README.md.
const printedTickAngles = [
  [0, 135.082], [10, 168.877], [20, 202.552],
  [30, 236.401], [40, 270.000], [50, 303.680],
  [60, 337.448], [70, 371.135], [80, 404.918],
];

describe('GReddy oil pressure face calibration', () => {
  it.each(printedTickAngles)('aligns %s PSI with the original printed tick', (psi, measuredAngle) => {
    // Half a degree is below one source-pixel of tangential displacement at
    // the sampled tick radius, while allowing raster antialiasing uncertainty.
    expect(Math.abs(greddyOilPressureAngle(psi) - measuredAngle)).toBeLessThan(0.5);
  });

  it('clamps out-of-scale pressures to the two printed endpoints', () => {
    for (const pressure of [-1000, -1]) {
      expect(greddyOilPressureAngle(pressure)).toBe(greddyOilPressureAngle(0));
    }
    for (const pressure of [81, 1000]) {
      expect(greddyOilPressureAngle(pressure)).toBe(greddyOilPressureAngle(80));
    }
  });

  it('interpolates monotonically and symmetrically between the printed ticks', () => {
    const middle = greddyOilPressureAngle(40);
    for (let pressure = 0; pressure < 80; pressure += 0.5) {
      const current = greddyOilPressureAngle(pressure);
      const next = greddyOilPressureAngle(pressure + 0.5);
      expect(next).toBeGreaterThan(current);
      expect((current + greddyOilPressureAngle(80 - pressure)) / 2).toBeCloseTo(middle, 10);
    }
    for (let pressure = 0; pressure < 80; pressure += 10) {
      expect(greddyOilPressureAngle(pressure + 5))
        .toBeCloseTo((greddyOilPressureAngle(pressure) + greddyOilPressureAngle(pressure + 10)) / 2, 10);
    }
  });
});
