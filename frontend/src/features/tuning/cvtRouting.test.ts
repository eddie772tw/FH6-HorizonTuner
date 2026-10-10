import { describe, expect, it } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { usesCvt } from '../../domain/tuning/transmission';
import { engineDependencyKey } from './engineObservationIdentity';
import { evDependencyKey } from './evSession';
import { companionProfileKey, validateCompanionCommand, type CompanionSnapshot } from '../companion/companionProtocol';
import { serializeWorkflowProfile } from './tuningWorkflow';

const ice = { weight: 1200, maxHp: 250, isElectric: false } as CarParams;
const cvt: CarParams = { ...ice, transmission: { type: 'cvt', capability: 'unknown' } };
describe('explicit CVT selection', () => {
  it('keeps engine powertrain and transmission separate without gear/name inference', () => {
    expect(usesCvt(cvt)).toBe(true);
    expect(usesCvt({ ...cvt, isElectric: true })).toBe(true);
    for (const gears of [1, 2, 6]) expect(usesCvt({ ...ice, adjustability: { gears, gearbox: 'Full' } } as CarParams)).toBe(false);
    expect(engineDependencyKey('42', ice)).toBe(JSON.stringify(['42', null, null, 250, null]));
    expect(engineDependencyKey('42', cvt)).not.toBe(engineDependencyKey('42', ice));
    expect(evDependencyKey('42', { ...cvt, isElectric: true })).not.toBe(evDependencyKey('42', { ...ice, isElectric: true }));
  });
  it('preserves legacy profiles and persists explicit selection in static snapshots', () => {
    expect(JSON.parse(serializeWorkflowProfile(ice)).transmission).toBeUndefined();
    expect(JSON.parse(serializeWorkflowProfile(cvt)).transmission).toEqual(cvt.transmission);
    expect(companionProfileKey('42', cvt)).not.toBe(companionProfileKey('42', ice));
    expect(companionProfileKey('42', { ...cvt, transmission: { type: 'cvt', capability: 'fixed' } })).not.toBe(companionProfileKey('42', cvt));
  });
  it('blocks Companion ICE measurement commands even with obsolete ready flags', () => {
    const snapshot = { carId: '42', profile: cvt, profileKey: 'key', engine: { phase: 'idle' }, readiness: { engineInputs: true, measuredEngine: true, gearingAvailable: true } } as CompanionSnapshot;
    for (const action of ['start', 'pause_resume', 'restart', 'finish'] as const) {
      expect(() => validateCompanionCommand({ id: '1', carId: '42', profileKey: 'key', kind: 'measurement', action }, snapshot)).toThrow('CVT');
    }
  });
});
