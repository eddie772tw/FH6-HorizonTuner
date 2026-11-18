import { expect, it } from 'vitest';
import { validGearingView } from './gearingView';
import { computeGearingChartData } from './gearingChartData';
import type { GearingView } from '../aegoTypes';

it('uses the backend-resolved front geometry and requires complete display inputs', () => {
  const gearing = { finalDrive: 3.5, gears: [3, 2, 1.5, 1] };
  const view: GearingView = { drivenTireAxle: 'front', tireRadiusM: .29, referenceRpm: 5000,
    maxRpm: 7500, effectiveRedline: 7000, powerPeakRpm: 5000, torquePeakRpm: 3500,
    speedSemantics: 'pure-rolling-wheel-speed-at-peak-power-rpm' };
  expect(validGearingView(view, gearing)).toBe(true);
  const display = (radius: number) => computeGearingChartData({ ...gearing, numGears: 4,
    tireRadiusM: radius, maxRpm: view.maxRpm, effectiveRedline: view.effectiveRedline,
    speedUnit: 'kmh', convertSpeed: ms => ({ value: ms * 3.6, label: 'km/h' }) });
  // A different backend radius changes the axis proportionally, without a rear-tire override.
  expect(display(view.tireRadiusM).gearRanges[3].endSpeed / display(.35).gearRanges[3].endSpeed).toBeCloseTo(.29 / .35, 10);
  expect(validGearingView(null, gearing)).toBe(false);
  expect(validGearingView({ ...view, tireRadiusM: 0 }, gearing)).toBe(false);
  expect(validGearingView({ ...view, effectiveRedline: 8000 }, gearing)).toBe(false);
  expect(validGearingView(view, { ...gearing, unsupported: true })).toBe(false);
});
