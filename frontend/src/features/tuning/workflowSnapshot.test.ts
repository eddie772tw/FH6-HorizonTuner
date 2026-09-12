import { describe, expect, it } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { calculateAEGOGearing, calculateMeasuredGearing, calculateChassisTuning, calculateStaticTireAlignment, roadExplorationStep, type MeasuredEngineInputs } from '../../utils/tuningMath';
import { workflowRecommendation } from './workflowSnapshot';

const profile: CarParams = {
  weight: 1200, weight_distribution: 55, drivetrain: 'RWD', induction: 'NA', maxHp: 300, maxTorque: 400,
  maxHpRpm: 0, maxTorqueRpm: 0, aeroEfficiency: 1, dyno_curve: {},
  adjustability: { gearbox: 'Full', gears: 6, suspension: 'Race', arb: 'Adjustable', aero: 'Fixed', brakes: 'Fixed', diff: 'Adjustable' },
};
const engine = { engineMaxRpm: 8100, peakPowerRpm: 7100, peakTorqueRpm: 5200 };
describe('measured workflow adapters', () => {
  it.each(['Road', 'Rally', 'Drag', 'Drift'])('uses measured RPM with the existing %s formula', goal => {
    const before = JSON.stringify(profile);
    const result = calculateMeasuredGearing(goal, 6, profile, engine);
    expect(result).toEqual(calculateAEGOGearing(goal, 6, { ...profile, maxHpRpm: 7100, maxTorqueRpm: 5200 }, 8100));
    expect(JSON.stringify(profile)).toBe(before);
  });
  it('does not substitute guessed limits or peaks for missing measurements', () => {
    for (const invalid of [null, {} as MeasuredEngineInputs, { ...engine, engineMaxRpm: NaN }, { ...engine, peakPowerRpm: 9000 }, { ...engine, peakTorqueRpm: 0 }]) {
      expect(calculateMeasuredGearing('Road', 6, profile, invalid)).toBeNull();
    }
  });
  it('freezes the input snapshot and only lists controls available on the installed parts', () => {
    const fixed = { ...profile, adjustability: { ...profile.adjustability, suspension: 'Fixed' as const, arb: 'Fixed' as const, diff: 'Fixed' as const, gearbox: 'FinalDrive' as const } };
    const inputs = { carId: '42', profile: fixed, engineObservation: { id: 'measured-id', data: engine } };
    const rec = workflowRecommendation(fixed, calculateChassisTuning('Road', fixed), calculateStaticTireAlignment('Road', 'Summer', fixed), calculateMeasuredGearing('Road', 6, fixed, engine)!, inputs);
    expect(Object.keys(rec.fields).sort()).toEqual(['gearing.finalDrive', 'pressure.front', 'pressure.rear']);
    inputs.profile.weight = 1800;
    expect((rec.inputSnapshot.profile as CarParams).weight).toBe(1200);
  });
  it('changes exactly one confirmed game step and never exceeds the range', () => {
    const setting = { value: 28, minimum: 15, maximum: 55, step: 0.5 };
    expect(roadExplorationStep(setting, 1)).toBe(28.5);
    expect(roadExplorationStep({ ...setting, value: 55 }, 1)).toBeNull();
    expect(roadExplorationStep({ ...setting, value: 28.1 }, 1)).toBeNull();
  });
});
