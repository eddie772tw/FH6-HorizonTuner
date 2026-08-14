import { describe, expect, it } from 'vitest';
import {
  calculateTireGeometry,
  calculateTireVerticalStiffnessPrior,
  TireGeometryInput
} from './tireGeometry';

describe('tireGeometry', () => {
  it('computes exact metric dimensions for standard tire specifications', () => {
    const geo245 = calculateTireGeometry({
      widthMm: 245,
      aspectRatio: 40,
      rimDiameterIn: 18
    });

    expect(geo245.sidewallHeightMm).toBeCloseTo(98.0, 2);
    expect(geo245.sidewallHeightM).toBeCloseTo(0.098, 4);
    expect(geo245.rimDiameterMm).toBeCloseTo(457.2, 2);
    expect(geo245.rimDiameterM).toBeCloseTo(0.4572, 4);
    expect(geo245.overallDiameterMm).toBeCloseTo(653.2, 2);
    expect(geo245.overallDiameterM).toBeCloseTo(0.6532, 4);
    expect(geo245.tireRadiusMm).toBeCloseTo(326.6, 2);
    expect(geo245.tireRadiusM).toBeCloseTo(0.3266, 4);
    expect(geo245.rollingCircumferenceM).toBeCloseTo((653.2 * Math.PI) / 1000, 4);
    expect(geo245.warnings).toHaveLength(0);

    const geo275 = calculateTireGeometry({
      widthMm: 275,
      aspectRatio: 35,
      rimDiameterIn: 19
    });

    expect(geo275.sidewallHeightMm).toBeCloseTo(96.25, 2);
    expect(geo275.rimDiameterMm).toBeCloseTo(482.6, 2);
    expect(geo275.overallDiameterMm).toBeCloseTo(675.1, 2);
    expect(geo275.tireRadiusM).toBeCloseTo(0.33755, 4);
    expect(geo275.rollingCircumferenceM).toBeCloseTo((675.1 * Math.PI) / 1000, 4);
  });

  it('correctly interprets decimal fraction aspect ratios', () => {
    const fromPercentage = calculateTireGeometry({ widthMm: 245, aspectRatio: 45, rimDiameterIn: 18 });
    const fromFraction = calculateTireGeometry({ widthMm: 245, aspectRatio: 0.45, rimDiameterIn: 18 });

    expect(fromFraction.aspectRatio).toBe(45);
    expect(fromFraction.sidewallHeightMm).toBe(fromPercentage.sidewallHeightMm);
    expect(fromFraction.overallDiameterMm).toBe(fromPercentage.overallDiameterMm);
    expect(fromFraction.rollingCircumferenceM).toBe(fromPercentage.rollingCircumferenceM);
  });

  it('computes heuristic vertical stiffness prior adhering to physical scaling relationships', () => {
    const geoBaseline = calculateTireGeometry({ widthMm: 245, aspectRatio: 40, rimDiameterIn: 18 });
    const baseline = calculateTireVerticalStiffnessPrior(geoBaseline, { pressurePsi: 30.0 });

    expect(baseline.source).toBe('geometric-heuristic-prior/v1');
    expect(baseline.isHeuristic).toBe(true);
    expect(baseline.verticalStiffnessNPerM).toBeCloseTo(250000, -2);
    expect(baseline.verticalStiffnessNPerMm).toBeCloseTo(250, 0);

    // 1. Shorter sidewall (lower aspect ratio) yields higher radial stiffness
    const geoLowProfile = calculateTireGeometry({ widthMm: 245, aspectRatio: 30, rimDiameterIn: 19 });
    const geoHighProfile = calculateTireGeometry({ widthMm: 245, aspectRatio: 55, rimDiameterIn: 17 });
    const lowProfileStiff = calculateTireVerticalStiffnessPrior(geoLowProfile, { pressurePsi: 30.0 });
    const highProfileStiff = calculateTireVerticalStiffnessPrior(geoHighProfile, { pressurePsi: 30.0 });

    expect(lowProfileStiff.verticalStiffnessNPerM).toBeGreaterThan(baseline.verticalStiffnessNPerM);
    expect(highProfileStiff.verticalStiffnessNPerM).toBeLessThan(baseline.verticalStiffnessNPerM);

    // 2. Wider section width yields higher radial stiffness
    const geoWide = calculateTireGeometry({ widthMm: 305, aspectRatio: 32, rimDiameterIn: 18 });
    const geoNarrow = calculateTireGeometry({ widthMm: 205, aspectRatio: 48, rimDiameterIn: 18 });
    const wideStiff = calculateTireVerticalStiffnessPrior(geoWide, { pressurePsi: 30.0 });
    const narrowStiff = calculateTireVerticalStiffnessPrior(geoNarrow, { pressurePsi: 30.0 });

    expect(wideStiff.verticalStiffnessNPerM).toBeGreaterThan(baseline.verticalStiffnessNPerM);
    expect(narrowStiff.verticalStiffnessNPerM).toBeLessThan(baseline.verticalStiffnessNPerM);

    // 3. Higher inflation pressure yields higher radial stiffness
    const highPressure = calculateTireVerticalStiffnessPrior(geoBaseline, { pressurePsi: 38.0 });
    const lowPressure = calculateTireVerticalStiffnessPrior(geoBaseline, { pressurePsi: 24.0 });

    expect(highPressure.verticalStiffnessNPerM).toBeGreaterThan(baseline.verticalStiffnessNPerM);
    expect(lowPressure.verticalStiffnessNPerM).toBeLessThan(baseline.verticalStiffnessNPerM);
  });

  it('safely handles zero, negative, and extreme inputs with fallbacks and finite outputs', () => {
    const invalidList: TireGeometryInput[] = [
      { widthMm: 0, aspectRatio: 0, rimDiameterIn: 0 },
      { widthMm: -245, aspectRatio: -40, rimDiameterIn: -18 },
      { widthMm: NaN, aspectRatio: NaN, rimDiameterIn: NaN },
      { widthMm: Infinity, aspectRatio: -Infinity, rimDiameterIn: 0 },
      {}
    ];

    for (const bad of invalidList) {
      const geo = calculateTireGeometry(bad);
      expect(Number.isFinite(geo.widthMm)).toBe(true);
      expect(geo.widthMm).toBeGreaterThan(0);
      expect(Number.isFinite(geo.sidewallHeightMm)).toBe(true);
      expect(geo.sidewallHeightMm).toBeGreaterThan(0);
      expect(Number.isFinite(geo.overallDiameterM)).toBe(true);
      expect(geo.overallDiameterM).toBeGreaterThan(0);
      expect(Number.isFinite(geo.rollingCircumferenceM)).toBe(true);
      expect(geo.rollingCircumferenceM).toBeGreaterThan(0);
      expect(geo.warnings.length).toBeGreaterThan(0);

      const stiffness = calculateTireVerticalStiffnessPrior(geo);
      expect(Number.isFinite(stiffness.verticalStiffnessNPerM)).toBe(true);
      expect(stiffness.verticalStiffnessNPerM).toBeGreaterThan(0);
      expect(stiffness.verticalStiffnessNPerM).toBeGreaterThanOrEqual(80000);
      expect(stiffness.verticalStiffnessNPerM).toBeLessThanOrEqual(600000);
    }
  });

  it('clamps extreme out-of-range dimensions and generates descriptive warnings', () => {
    const extreme = calculateTireGeometry({
      widthMm: 800,
      aspectRatio: 120,
      rimDiameterIn: 45
    });

    expect(extreme.widthMm).toBe(450);
    expect(extreme.aspectRatio).toBe(95);
    expect(extreme.rimDiameterIn).toBe(30);
    expect(extreme.warnings).toHaveLength(3);
    expect(extreme.warnings.every((w) => w.includes('clamped'))).toBe(true);
  });
});
