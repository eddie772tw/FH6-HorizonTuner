import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TuningWorkflowNavigation } from './TuningWorkflowNavigation';
import { Step3ChassisTuner } from './Step3ChassisTuner';
import { DifferentialSetup } from './DifferentialSetup';
import { calculateChassisTuning } from '../../../utils/tuningMath';

vi.mock('../../../context/SettingsContext', () => ({ useSettings: () => ({
  t: (key: string) => key,
  convertSpringRate: (value: number) => ({ value, label: 'kgf/mm' }),
  convertHeight: (value: number) => ({ value, label: 'cm' }),
}) }));
const result = calculateChassisTuning('Road', { weight: 1200, weight_distribution: 50, drivetrain: 'RWD',
  maxHp: 0, maxTorque: 0, maxHpRpm: 0, maxTorqueRpm: 0 });
describe('workflow recommendations rendering', () => {
  it('enables mechanical navigation while explaining the remaining verification gate', () => {
    const html = renderToStaticMarkup(createElement(TuningWorkflowNavigation, { currentStep: 3,
      readiness: { mechanical: true, engineInputs: false, measuredEngine: false }, onSelect: () => {} }));
    expect(html.match(/disabled=""/g)).toHaveLength(1);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('Complete engine-data preparation before verifying the complete setup.');
    expect(html).toContain('Available sections can be opened independently.');
  });
  it('renders springs before roll balance and damping without engine input or a local solver effect', () => {
    const html = renderToStaticMarkup(createElement(Step3ChassisTuner, { selectedRaceGoal: 'Road', tuningResult: result, saveCarParams: async () => {} }));
    expect(html.indexOf('Springs &amp; Ride Height')).toBeLessThan(html.indexOf('Anti-Roll Bars (ARB)'));
    expect(html.indexOf('Anti-Roll Bars (ARB)')).toBeLessThan(html.indexOf('Damping System'));
    expect(html).toContain(`${result.springs.front.toFixed(1)} kgf/mm`);
    expect(html).not.toContain('Differential');
  });
  it('shows only the applicable differential axles on the independent powertrain card', () => {
    const rear = renderToStaticMarkup(createElement(DifferentialSetup, { diff: result.diff, drivetrain: 'RWD' }));
    expect(rear).toContain('Rear Accel Lock');
    expect(rear).not.toContain('Front Accel Lock');
    expect(rear).not.toContain('AWD Center Rear Split');
    const all = renderToStaticMarkup(createElement(DifferentialSetup, { diff: result.diff, drivetrain: 'AWD' }));
    expect(all).toContain('Front Accel Lock');
    expect(all).toContain('AWD Center Rear Split');
  });
});
