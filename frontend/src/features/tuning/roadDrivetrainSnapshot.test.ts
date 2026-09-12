import { describe, expect, it } from 'vitest';
import type { CarParams } from '../../context/CarParamsContext';
import { mergeDynoPollResult } from '../../context/CarParamsContext';
import { serializeWorkflowProfile } from './tuningWorkflow';
import { workflowRecommendation } from './workflowSnapshot';
import { calculateChassisTuning, calculateStaticTireAlignment, calculateMeasuredGearing } from '../../utils/tuningMath';

describe('Road AWD override snapshots', () => {
  it('survives save-shaped JSON and dyno refresh, and reaches the applied centre setting', () => {
    const profile: CarParams = { weight: 1300, weight_distribution: 56, drivetrain: 'AWD', roadAwdRearPercent: 40,
      induction: 'NA', maxHp: 300, maxTorque: 400, maxHpRpm: 6800, maxTorqueRpm: 4500, aeroEfficiency: 0.5, dyno_curve: {},
      adjustability: { gearbox: 'Full', gears: 6, suspension: 'Race', arb: 'Adjustable', aero: 'Fixed', brakes: 'Fixed', diff: 'Adjustable' } };
    const reloaded = JSON.parse(serializeWorkflowProfile(profile)) as CarParams;
    const refreshed = mergeDynoPollResult(reloaded, { dyno_curve: {} });
    const rec = workflowRecommendation(refreshed, calculateChassisTuning('Road', refreshed),
      calculateStaticTireAlignment('Road', 'Summer', refreshed),
      calculateMeasuredGearing('Road', 6, refreshed, { engineMaxRpm: 7500, peakPowerRpm: 6800, peakTorqueRpm: 4500 })!, { profile: refreshed });
    expect(rec.fields['diff.center'].value).toBe(40);
    expect((rec.inputSnapshot.profile as CarParams).roadAwdRearPercent).toBe(40);
    expect(JSON.parse(serializeWorkflowProfile({ ...profile, roadAwdRearPercent: undefined })).roadAwdRearPercent).toBeUndefined();
  });
});
