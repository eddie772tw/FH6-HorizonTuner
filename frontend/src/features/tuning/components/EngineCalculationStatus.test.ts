import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { EngineCalculationStatus } from './EngineCalculationStatus';
import type { EngineCalculationSummary } from '../engineCalculation';
import { createTuningMeasurement } from '../tuningMeasurement';
import { engineCalculationSummary } from '../engineCalculation';

const ready: EngineCalculationSummary = { analysisVersion: 'engine-loaded-sweep/v3',
  observationId: 'test', status: 'ready', reason: 'ready', acceptedMs: 7000,
  peakPower: { rpm: 3984, value: 53600 }, peakTorque: { rpm: 2392, value: 158.8 } };
const render = (calculation: EngineCalculationSummary | null, unsupported = false) =>
  renderToStaticMarkup(createElement(EngineCalculationStatus, { calculation, hasObservation: true,
    gearing: unsupported ? { finalDrive: 0, gears: [], unsupported: true } : null, t: key => key }));

describe('engine analysis status', () => {
  it('never labels a missing capture or legacy peak as calculation-ready', () => {
    expect(render(null)).toContain('loading or unavailable');
    expect(render(engineCalculationSummary(createTuningMeasurement('1435'), 'old'))).toContain('history remains readable');
  });
  it('shows the actionable reason without hiding the original observation', () => {
    expect(render({ ...ready, status: 'collecting', reason: 'rpm-coverage-high' })).toContain('Hold the gear longer');
    expect(render({ ...ready, status: 'collecting', reason: 'duration-insufficient' })).toContain('More clean acceleration data');
  });
  it('distinguishes analysis-ready from an infeasible solver result', () => {
    expect(render(ready)).toContain('3984 RPM');
    expect(render(ready, true)).toContain('no feasible result');
    expect(render(ready, true)).not.toContain('3984 RPM');
  });
});
