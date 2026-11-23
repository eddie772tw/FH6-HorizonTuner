import { describe, expect, it, vi } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { saveCompanionDraft } from './saveCompanionDraft';
import { validateCompanionCommand, type CompanionCommand, type CompanionSnapshot } from './companionProtocol';

const profile = { weight: 1500, dyno_curve: { '4000': { hp: 300, torque: 400 } } } as CarParams;
const command: CompanionCommand = { id: 'save-1', kind: 'save', carId: '42', profileKey: 'current', patch: { weight: 1400 }, goal: 'Rally', season: 'Winter' };

describe('remote saved tuning draft', () => {
  it('persists parameters and target in one document before applying the visible draft', async () => {
    const apply = vi.fn();
    const save = vi.fn(async (document: CarParams) => {
      expect(apply).not.toHaveBeenCalled();
      expect(document).toEqual({ ...profile, weight: 1400, tuningTarget: { goal: 'Rally', season: 'Winter' } });
    });
    await saveCompanionDraft(command, profile, save, () => 'current', apply);
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ weight: 1400 }), 'Rally', 'Winter');
  });
  it('propagates disk failures and does not claim an applied change', async () => {
    const apply = vi.fn();
    await expect(saveCompanionDraft(command, profile, async () => { throw new Error('disk full'); }, () => 'current', apply)).rejects.toThrow('disk full');
    expect(apply).not.toHaveBeenCalled();
  });
  it('does not overwrite a newer desktop draft or selected vehicle after saving', async () => {
    const apply = vi.fn();
    await saveCompanionDraft(command, profile, async () => {}, () => 'new vehicle or draft', apply);
    expect(apply).not.toHaveBeenCalled();
  });
  it('requires valid parameters and a complete target before saving', () => {
    const snapshot = { carId: '42', profileKey: 'current', profile } as CompanionSnapshot;
    expect(() => validateCompanionCommand(command, snapshot)).not.toThrow();
    for (const change of [{ goal: 'invalid' }, { season: undefined }, { patch: { weight: -1 } }, { profileKey: 'stale' }]) {
      expect(() => validateCompanionCommand({ ...command, ...change }, snapshot)).toThrow();
    }
  });
});
