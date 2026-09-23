import { describe, expect, it } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { companionProfileKey, validateCompanionCommand, type CompanionCommand, type CompanionSnapshot } from './companionProtocol';

const profile = { weight: 1500, weight_distribution: 50, maxHp: 400, drivetrain: 'RWD', dyno_curve: {} } as CarParams;
const snapshot: CompanionSnapshot = {
  carId: '42', carName: 'Test car', profile, profileKey: companionProfileKey('42', profile),
  workflow: { step: 1, goal: 'Road', season: 'Summer' }, results: { chassis: null, alignment: null, gearing: null },
  engine: { phase: 'idle', sampleCount: 0, state: null }, readiness: { mechanical: true, engineInputs: true, measuredEngine: false },
};
const command = (change: Partial<CompanionCommand> = {}): CompanionCommand => ({
  id: 'edit-1', carId: snapshot.carId, profileKey: snapshot.profileKey, kind: 'profile', patch: { weight: 1420 }, ...change,
});

describe('companion workflow boundary', () => {
  it('accepts static edits and ignores unrelated dyno updates in conflict detection', () => {
    expect(() => validateCompanionCommand(command(), snapshot)).not.toThrow();
    expect(companionProfileKey('42', { ...profile, dyno_curve: { '4000': { hp: 300, torque: 420 } } })).toBe(snapshot.profileKey);
    expect(companionProfileKey('42', { ...profile, frontTireWidth: 285 })).not.toBe(snapshot.profileKey);
    expect(companionProfileKey('42', profile, 1)).not.toBe(snapshot.profileKey);
  });
  it('rejects stale vehicle and profile commands', () => {
    expect(() => validateCompanionCommand(command({ carId: '43' }), snapshot)).toThrow('changed');
    expect(() => validateCompanionCommand(command({ profileKey: 'old' }), snapshot)).toThrow('changed');
  });
  it('rejects invalid values and fields owned by the host', () => {
    for (const patch of [{ weight: -1 }, { weight: NaN }, { weight_distribution: 100 }, { dyno_curve: {} }, {}]) {
      expect(() => validateCompanionCommand(command({ patch }), snapshot)).toThrow();
    }
  });
  it('uses the same workflow readiness gates as the desktop', () => {
    expect(() => validateCompanionCommand(command({ kind: 'workflow', step: 2 }), snapshot)).not.toThrow();
    expect(() => validateCompanionCommand(command({ kind: 'workflow', step: 4 }), snapshot)).toThrow('required');
    expect(() => validateCompanionCommand(command({ kind: 'workflow', goal: 'bad' }), snapshot)).toThrow();
  });
  it('does not claim measurement actions succeeded in an incompatible phase', () => {
    expect(() => validateCompanionCommand(command({ kind: 'measurement', action: 'start' }), snapshot)).not.toThrow();
    expect(() => validateCompanionCommand(command({ kind: 'measurement', action: 'finish' }), snapshot)).toThrow('not available');
    expect(() => validateCompanionCommand(command({ kind: 'measurement', action: 'pause_resume' }), { ...snapshot, engine: { ...snapshot.engine, phase: 'collecting' } })).not.toThrow();
  });
});
