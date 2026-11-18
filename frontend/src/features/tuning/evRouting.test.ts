import { describe, expect, it } from 'vitest';
import { resolveTuningStep } from './tuningWorkflow';
import { engineDependencyKey } from './engineObservationIdentity';
import { evDependencyKey } from './evSession';
import type { CarParams } from '../../context/CarParamsContext';
import { validateCompanionCommand, type CompanionSnapshot } from '../companion/companionProtocol';
const ev = { weight: 2200, weight_distribution: 50, maxHp: 0, isElectric: true } as CarParams;
describe('current EV workflow boundaries', () => {
  it('navigates from backend readiness without deriving ICE peaks', () => {
    const pending = { mechanical: true, engineInputs: true, measuredEngine: false, gearingAvailable: false };
    expect(resolveTuningStep(4, pending)).toBe(3);
    expect(resolveTuningStep(4, { ...pending, measuredEngine: true, gearingAvailable: true })).toBe(4);
  });
  it('isolates EV evidence and ratio changes from ICE identities', () => {
    const ice = { ...ev, isElectric: false };
    expect(engineDependencyKey('3445', ice)).toBe(engineDependencyKey('3445', { ...ice, isElectric: undefined }));
    expect(engineDependencyKey('3445', ev)).not.toBe(engineDependencyKey('3445', ice));
    expect(evDependencyKey('3445', ev)).not.toBe(evDependencyKey('3445', ice));
    expect(evDependencyKey('3445', ev)).not.toBe(evDependencyKey('3445', { ...ev, evGearbox: { kind: 'fixed' } } as CarParams));
  });
  it('rejects ICE measurement commands for EV', () => {
    const snapshot = { carId: '3445', profileKey: 'ev', profile: ev } as CompanionSnapshot;
    expect(() => validateCompanionCommand({ id: '1', kind: 'measurement', action: 'start', carId: '3445', profileKey: 'ev' }, snapshot)).toThrow('desktop EV');
  });
});
