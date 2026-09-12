import { describe, expect, it } from 'vitest';
import { canOpenTuningStep, getWorkflowReadiness, nextTuningStep, resolveTuningStep, restoreWorkflowStep, serializeWorkflowProfile, TUNING_WORKFLOW_STEPS } from './tuningWorkflow';

const profile = { weight: 1200, weight_distribution: 50, maxHp: 200 };
describe('recommended workflow and independent data gates', () => {
  it('maps explicitly versioned legacy steps without confusing current step numbers', () => {
    expect(restoreWorkflowStep({ schema: 'tuning-workflow/v1', step: 2 })).toBe(5);
    expect(restoreWorkflowStep({ schema: 'tuning-workflow/v2', step: 2 })).toBe(2);
    expect(restoreWorkflowStep({ step: 2 })).toBe(1);
    expect(restoreWorkflowStep({ schema: 'tuning-workflow/v2', step: 7 })).toBe(1);
  });
  it('keeps the static snapshot key stable across background dyno polling but changes it for actual inputs', () => {
    const params = { ...profile, drivetrain: 'RWD' as const, maxTorque: 200, maxHpRpm: 6000, maxTorqueRpm: 4500 };
    const key = serializeWorkflowProfile(params);
    expect(serializeWorkflowProfile({ ...params, dyno_curve: [{ rpm: 7000 }], dyno_quality: { updated: true } })).toBe(key);
    expect(serializeWorkflowProfile({ ...params, weight: 1300 })).not.toBe(key);
    expect(JSON.parse(key)).toEqual(params);
    expect(serializeWorkflowProfile(null)).toBe('null');
  });
  it('offers tires, chassis and alignment before powertrain, without visited-page dependencies', () => {
    expect(TUNING_WORKFLOW_STEPS.map(step => step.id)).toEqual(['setup', 'tires', 'chassis', 'alignment', 'powertrain', 'validation']);
    const ready = getWorkflowReadiness(true, { ...profile, maxHp: 0 }, false);
    expect([1, 2, 3, 4, 5, 6].map(step => canOpenTuningStep(step, ready))).toEqual([true, true, true, true, true, false]);
    expect(nextTuningStep(1, ready)).toBe(2);
    expect(nextTuningStep(5, ready)).toBeNull();
  });
  it('requires engine inputs and a current measurement only for full verification', () => {
    expect(canOpenTuningStep(6, getWorkflowReadiness(true, profile, true))).toBe(true);
    expect(canOpenTuningStep(6, getWorkflowReadiness(true, profile, false))).toBe(false);
    expect(canOpenTuningStep(6, getWorkflowReadiness(true, { ...profile, maxHp: NaN }, true))).toBe(false);
  });
  it('keeps independent sections open when measurement is invalidated', () => {
    const ready = getWorkflowReadiness(true, profile, false);
    for (const step of [2, 3, 4, 5]) expect(resolveTuningStep(step, ready)).toBe(step);
    expect(resolveTuningStep(6, ready)).toBe(5);
  });
  it.each([null, { ...profile, weight: 0 }, { ...profile, weight_distribution: 100 }, { ...profile, weight: NaN }])(
    'requires a usable mechanical profile: %j', params => {
      const ready = getWorkflowReadiness(true, params, true);
      expect(resolveTuningStep(3, ready)).toBe(1);
      expect(canOpenTuningStep(6, ready)).toBe(false);
    });
  it('rejects loading profiles and invalid navigation numbers', () => {
    expect(resolveTuningStep(6, getWorkflowReadiness(false, profile, true))).toBe(1);
    const ready = getWorkflowReadiness(true, profile, true);
    for (const step of [0, 7, 2.5, NaN]) expect(resolveTuningStep(step, ready)).toBe(1);
    expect(nextTuningStep(5, ready)).toBe(6);
    expect(nextTuningStep(6, ready)).toBeNull();
  });
});
