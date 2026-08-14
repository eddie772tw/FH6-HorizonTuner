import { describe, expect, it } from 'vitest';
import { calculateDevChassis } from './suspensionSolver';
import type { DevTuningInput } from '../../../utils/tuningMath_dev';

const createMockInput = (overrides?: Partial<DevTuningInput>): DevTuningInput => ({
  raceGoal: 'Road',
  surface: 'tarmac',
  targetTopSpeedKmh: 280,
  targetRideFrequencyFrontHz: 2.2,
  targetRideFrequencyRearHz: 2.4,
  dampingRatioFront: 0.70,
  dampingRatioRear: 0.70,
  car: {
    weight: 1250,
    weight_distribution: 53,
    drivetrain: 'RWD',
    maxHp: 228,
    maxHpRpm: 7000,
    maxTorqueRpm: 3700,
    spring_front_min: 3,
    spring_front_max: 100,
    spring_rear_min: 3,
    spring_rear_max: 100,
    height_front_min: 10,
    height_front_max: 22,
    height_rear_min: 10,
    height_rear_max: 22,
    arb_front_min: 1,
    arb_front_max: 65,
    arb_rear_min: 1,
    arb_rear_max: 65
  },
  ...overrides
});

describe('suspensionSolver domain tests', () => {
  it('identifies spring output as direct wheel-load approximation', () => {
    const input = createMockInput();
    const result = calculateDevChassis(input);

    expect(result.springs.modelType).toBe('direct_wheel_load_approx');
    expect(result.springs.assumedMotionRatio).toBe(1.0);
    // Calculated un-clamped spring rate is ~5.56 kgf/mm for front, ~5.89 kgf/mm for rear
    expect(result.springs.frontKgfMm).toBeGreaterThan(3);
    expect(result.springs.rearKgfMm).toBeGreaterThan(3);
  });

  it('separates physical critical damping, damping-ratio priors, and advisory slider mappings', () => {
    const input = createMockInput({
      dampingRatioFront: 0.65,
      dampingRatioRear: 0.65
    });
    const result = calculateDevChassis(input);

    // 1. Physical damping layer (N·s/m)
    expect(result.damping.physical.frontCriticalNsM).toBeGreaterThan(0);
    expect(result.damping.physical.rearCriticalNsM).toBeGreaterThan(0);
    expect(result.damping.physical.frontReboundDampingNsM).toBeCloseTo(
      result.damping.physical.frontCriticalNsM * 0.65,
      1
    );
    expect(result.damping.physical.frontBumpDampingNsM).toBeCloseTo(
      result.damping.physical.frontReboundDampingNsM * 0.55,
      1
    );

    // 2. Prior layer
    expect(result.damping.priors.source).toBe('calibration-prior/v1');
    expect(result.damping.priors.frontDampingRatio).toBe(0.65);
    expect(result.damping.priors.bumpToReboundRatio).toBe(0.55);

    // 3. Advisory slider mapping layer
    expect(result.damping.sliderMapping.mappingSource).toBe('advisory_heuristic_v1');
    expect(result.damping.sliderMapping.frontSliderValue).toBeGreaterThanOrEqual(1);
    expect(result.damping.sliderMapping.frontSliderValue).toBeLessThanOrEqual(20);

    // 4. Backwards-compatible flat layer aligns with structured layer
    expect(result.damping.frontCriticalNsM).toBe(result.damping.physical.frontCriticalNsM);
    expect(result.damping.frontSliderValue).toBe(result.damping.sliderMapping.frontSliderValue);
    expect(result.damping.bumpToReboundRatio).toBe(result.damping.priors.bumpToReboundRatio);
  });

  it('handles extreme frequency inputs and boundary clamping gracefully', () => {
    const input = createMockInput({
      targetRideFrequencyFrontHz: 4.5, // High frequency -> calculated ~23.3 kgf/mm
      car: {
        ...createMockInput().car,
        spring_front_min: 3,
        spring_front_max: 20 // Artificially low clamp -> should clamp to 20
      }
    });
    const result = calculateDevChassis(input);

    expect(result.springs.frontKgfMm).toBe(20);
    expect(result.damping.physical.frontCriticalNsM).toBeGreaterThan(0);
    expect(Number.isFinite(result.damping.sliderMapping.frontSliderValue)).toBe(true);
  });
});
