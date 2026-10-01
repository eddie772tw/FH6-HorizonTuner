import { getWorkflowReadiness } from './legacyWorkflowReadiness';
import { describe, expect, it } from 'vitest';
import { calculateAEGOGearing, calculateMeasuredGearing, type TuningCarParams } from '../../utils/tuningMath';
import { calculateWizardMeasuredGearing } from './measurementTuningProfile';
import { resolveTuningStep } from './tuningWorkflow';
import { engineDependencyKey } from './engineMeasurementArchive';
import { evDependencyKey } from './evSession';
import type { CarParams } from '../../context/CarParamsContext';
import golden from '../../../../tests/fixtures/ev_golden_fixtures.json';
import type { EvGearingResult } from '../../domain/tuning/ev/types';
import { validateCompanionCommand, type CompanionSnapshot } from '../companion/companionProtocol';
import { workflowRecommendation } from './workflowSnapshot';
import { calculateChassisTuning, calculateStaticTireAlignment } from '../../utils/tuningMath';

const ev = { weight: 2200, weight_distribution: 50, maxHp: 0, isElectric: true } as CarParams;
const measured = { engineMaxRpm: 17000, peakPowerRpm: 6000, peakTorqueRpm: 3000 };
describe('parallel EV and ICE workflow routing', () => {
  it('never falls back to ICE peaks or gear count when EV measurements are missing', () => {
    for (const goal of ['Road', 'Rally', 'Drag', 'Drift']) {
      expect(calculateAEGOGearing(goal, 6, ev, 17000).unsupported).toBe(true);
      expect(calculateWizardMeasuredGearing(goal, 6, ev, measured)).toBeNull();
      expect(calculateMeasuredGearing(goal, 6, ev, measured)).toBeNull();
    }
    const result = golden[0].expected as EvGearingResult;
    expect(calculateWizardMeasuredGearing('Road', 6, ev, measured, result)).toBe(result);
  });
  it('opens the same steps using EV evidence without requiring an ICE max-power input', () => {
    expect(getWorkflowReadiness(true, ev, false).engineInputs).toBe(true);
    expect(resolveTuningStep(4, getWorkflowReadiness(true, ev, false))).toBe(3);
    expect(resolveTuningStep(4, getWorkflowReadiness(true, ev, true))).toBe(4);
    expect(getWorkflowReadiness(true, { ...ev, isElectric: false }, true).engineInputs).toBe(false);
  });
  it('preserves historical ICE dependency keys while isolating EV scans and ratio changes', () => {
    const ice = { ...ev, isElectric: false };
    expect(engineDependencyKey('3445', ice)).toBe(engineDependencyKey('3445', { ...ice, isElectric: undefined }));
    expect(engineDependencyKey('3445', ev)).not.toBe(engineDependencyKey('3445', ice));
    expect(evDependencyKey('3445', ev)).not.toBe(evDependencyKey('3445', ice));
    expect(evDependencyKey('3445', ev)).not.toBe(evDependencyKey('3445', { ...ev, evGearbox: golden[0].input.setup }));
  });
  it('rejects legacy companion measurement commands for EV', () => {
    const snapshot = { carId: '3445', profileKey: 'ev', profile: ev, readiness: getWorkflowReadiness(true, ev, false) } as CompanionSnapshot;
    expect(() => validateCompanionCommand({ id: '1', kind: 'measurement', action: 'start', carId: '3445', profileKey: 'ev' }, snapshot)).toThrow('desktop EV');
  });
  it.each([true, false])('rejects verification snapshots with mismatched powertrain results (EV profile: %s)', (isElectric) => {
    const profile = { ...ev, isElectric, drivetrain: 'AWD', maxHp: 751, adjustability: {
      gearbox: 'Full', gears: 6, suspension: 'Race', arb: 'Adjustable', aero: 'Adjustable', brakes: 'Adjustable', diff: 'Adjustable',
    } } as CarParams;
    const chassis = calculateChassisTuning('Road', profile);
    const alignment = calculateStaticTireAlignment('Road', 'Summer', profile);
    const mismatched = isElectric
      ? calculateAEGOGearing('Road', 6, { ...profile, isElectric: false }, 7000)
      : golden[0].expected as EvGearingResult;
    expect(() => workflowRecommendation(profile, chassis, alignment, mismatched, {})).toThrow('modes must match');
  });
  it('never emits locked or unknown EV ratios as settings to apply, regardless of legacy capabilities', () => {
    const profile = { ...ev, drivetrain: 'AWD', maxHp: 751, adjustability: {
      gearbox: 'Full', gears: 6, suspension: 'Race', arb: 'Adjustable', aero: 'Adjustable', brakes: 'Adjustable', diff: 'Adjustable',
    } } as CarParams;
    const chassis = calculateChassisTuning('Road', profile);
    const alignment = calculateStaticTireAlignment('Road', 'Summer', profile);
    const locked = golden.find(c => c.id === 'unknown-locked-single-speed')!.expected as EvGearingResult;
    const rec = workflowRecommendation(profile, chassis, alignment, locked, { powertrainModel: 'ev/v1' });
    expect(rec.formulaVersion).toBe('ev/measured-workflow-v1');
    expect(Object.keys(rec.fields).filter(k => k.startsWith('gearing.'))).toEqual([]);
    const fdOnly = golden.find(c => c.id === 'final-drive-only-preview')!.expected as EvGearingResult;
    const fdRec = workflowRecommendation(profile, chassis, alignment, fdOnly, {});
    expect(Object.keys(fdRec.fields).filter(k => k.startsWith('gearing.'))).toEqual(['gearing.finalDrive']);
  });
});
