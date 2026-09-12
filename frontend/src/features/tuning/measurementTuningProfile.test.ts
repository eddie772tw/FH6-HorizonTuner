import { describe, expect, it } from 'vitest';
import { calculateWizardMeasuredGearing } from './measurementTuningProfile';
import type { TuningCarParams } from '../../utils/tuningMath';

const profile: TuningCarParams = { weight: 1400, weight_distribution: 50, drivetrain: 'RWD', maxHp: 500, maxTorque: 500, maxHpRpm: 7000, maxTorqueRpm: 4500, tireType: 'Stock', rearTireWidth: 265, rearTireAspect: 35, rearTireRim: 18 };
const engine = { engineMaxRpm: 7500, peakPowerRpm: 7000, peakTorqueRpm: 4500 };

describe('wizard measurement solver adapter', () => {
  it('keeps historical tire labels from affecting gearing', () => {
    expect(calculateWizardMeasuredGearing('Road', 6, profile, engine)).toEqual(calculateWizardMeasuredGearing('Road', 6, { ...profile, tireType: 'Drag' }, engine));
  });
  it('returns unavailable without a profile or measured engine', () => {
    expect(calculateWizardMeasuredGearing('Road', 6, null, engine)).toBeNull();
    expect(calculateWizardMeasuredGearing('Road', 6, profile, null)).toBeNull();
  });
});
