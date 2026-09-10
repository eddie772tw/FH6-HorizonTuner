import { describe, expect, it } from 'vitest';
import { engineDependencyKey, parseEngineArchive } from './engineMeasurementArchive';
import type { TuningCarParams } from '../../utils/tuningMath';
const profile: TuningCarParams = { weight: 1200, weight_distribution: 60, drivetrain: 'FWD', induction: 'NA', maxHp: 300, maxTorque: 250, maxHpRpm: 7000, maxTorqueRpm: 5000 };
describe('engine observation dependencies', () => {
  it('keeps scans compatible with unrelated suspension and tire geometry edits', () => {
    const key = engineDependencyKey('42', profile);
    expect(engineDependencyKey('42', { ...profile, spring_front_min: 30, weight: 1250, frontTireRim: 19 })).toBe(key);
    expect(engineDependencyKey('42', { ...profile, maxHp: 350 })).not.toBe(key);
    expect(engineDependencyKey('42', { ...profile, induction: 'Turbo' })).not.toBe(key);
    expect(engineDependencyKey('43', profile)).not.toBe(key);
  });
  it('does not promote malformed or mismatched archive data to a ready observation', () => {
    for (const value of [null, '{}', 'not json', JSON.stringify([{ schema: 'engine-observation/v1', id: 'x', carId: '42', dependencyKey: 'key', data: { status: 'ready', engineMaxRpm: 8000 } }])]) expect(parseEngineArchive(value)).toEqual([]);
  });
});
