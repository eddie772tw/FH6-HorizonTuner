import type { DevChassisOutput, DevRaceGoal, DevTuningInput } from '../../../utils/tuningMath_dev';
import { DEV_CHASSIS_PROFILES } from '../constants';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finiteOr = (value: number | undefined, fallback: number): number => (Number.isFinite(value) ? (value as number) : fallback);
const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const bounded = (value: number | undefined, fallbackMin: number, fallbackMax: number): [number, number] => {
  const min = finiteOr(value, fallbackMin);
  return min <= fallbackMax ? [min, fallbackMax] : [fallbackMin, fallbackMax];
};

/**
 * Calculates direct wheel-load spring rate (assuming direct 1:1 motion ratio MR=1.0).
 * Note: This is an empirical direct-load approximation, NOT a full wheel-rate / ride-rate
 * model incorporating vehicle-specific suspension geometry motion ratio or tire vertical stiffness.
 */
function calculateDirectSpringKgfMm(massKg: number, frequencyHz: number): number {
  return ((2 * Math.PI * frequencyHz) ** 2 * massKg) / 9806.65;
}

/**
 * Calculates physical critical damping in N·s/m.
 * Cc = 2 * sqrt(K_spring_N_per_m * mass_kg)
 */
function calculateCriticalDampingNsM(massKg: number, springKgfMm: number): number {
  const springNPerM = springKgfMm * 9806.65;
  return 2 * Math.sqrt(springNPerM * massKg);
}

function calculateHeight(raceGoal: DevRaceGoal, min: number, max: number, axle: 'front' | 'rear'): number {
  const fraction =
    raceGoal === 'Rally' ? 0.90 : raceGoal === 'Drag' ? (axle === 'front' ? 0.05 : 0.70) : raceGoal === 'Drift' ? 0.20 : 0.12;
  return round(min + (max - min) * fraction, 1);
}

export function calculateDevChassis(input: DevTuningInput): DevChassisOutput {
  const car = input.car;
  const weight = Math.max(600, finiteOr(car.weight, 1400));
  const frontPercent = clamp(finiteOr(car.weight_distribution, 50), 20, 80) / 100;
  const sprungMass = weight * 0.86;
  const frontWheelMass = (sprungMass * frontPercent) / 2;
  const rearWheelMass = (sprungMass * (1 - frontPercent)) / 2;
  const frontFrequency = clamp(finiteOr(input.targetRideFrequencyFrontHz, 2.2), 1.0, 4.5);
  const rearFrequency = clamp(finiteOr(input.targetRideFrequencyRearHz, 2.3), 1.0, 4.5);

  const [frontSpringMin, frontSpringMax] = bounded(car.spring_front_min, 10, finiteOr(car.spring_front_max, 120));
  const [rearSpringMin, rearSpringMax] = bounded(car.spring_rear_min, 10, finiteOr(car.spring_rear_max, 120));
  const frontSpring = clamp(calculateDirectSpringKgfMm(frontWheelMass, frontFrequency), frontSpringMin, frontSpringMax);
  const rearSpring = clamp(calculateDirectSpringKgfMm(rearWheelMass, rearFrequency), rearSpringMin, rearSpringMax);

  const [frontHeightMin, frontHeightMax] = bounded(car.height_front_min, 10, finiteOr(car.height_front_max, 25));
  const [rearHeightMin, rearHeightMax] = bounded(car.height_rear_min, 10, finiteOr(car.height_rear_max, 25));

  const profile = DEV_CHASSIS_PROFILES[input.raceGoal];
  const weightBias = (frontPercent - 0.5) * 8;
  const [frontArbMin, frontArbMax] = bounded(car.arb_front_min, 1, finiteOr(car.arb_front_max, 65));
  const [rearArbMin, rearArbMax] = bounded(car.arb_rear_min, 1, finiteOr(car.arb_rear_max, 65));
  const frontArb = clamp(1 + 64 * profile.frontArb * frontPercent + weightBias, frontArbMin, frontArbMax);
  const rearArb = clamp(1 + 64 * profile.rearArb * (1 - frontPercent) - weightBias, rearArbMin, rearArbMax);

  // 1. Physical damping layer (N·s/m)
  const frontCriticalNsM = round(calculateCriticalDampingNsM(frontWheelMass, frontSpring), 1);
  const rearCriticalNsM = round(calculateCriticalDampingNsM(rearWheelMass, rearSpring), 1);
  const frontDampingRatio = clamp(finiteOr(input.dampingRatioFront, 0.70), 0.30, 1.20);
  const rearDampingRatio = clamp(finiteOr(input.dampingRatioRear, 0.70), 0.30, 1.20);
  const bumpToReboundRatio = 0.55;

  const frontReboundDampingNsM = round(frontCriticalNsM * frontDampingRatio, 1);
  const rearReboundDampingNsM = round(rearCriticalNsM * rearDampingRatio, 1);
  const frontBumpDampingNsM = round(frontReboundDampingNsM * bumpToReboundRatio, 1);
  const rearBumpDampingNsM = round(rearReboundDampingNsM * bumpToReboundRatio, 1);

  // 2. Advisory slider mapping layer (display mapping onto FH6 1..20 scale)
  const frontSliderValue = round(clamp(1 + frontDampingRatio * 16 + (frontFrequency - 2) * 1.5, 1, 20), 1);
  const rearSliderValue = round(clamp(1 + rearDampingRatio * 16 + (rearFrequency - 2) * 1.5, 1, 20), 1);

  return {
    springs: {
      modelType: 'direct_wheel_load_approx',
      assumedMotionRatio: 1.0,
      frontKgfMm: round(frontSpring),
      rearKgfMm: round(rearSpring),
      frontRideHeightCm: calculateHeight(input.raceGoal, frontHeightMin, frontHeightMax, 'front'),
      rearRideHeightCm: calculateHeight(input.raceGoal, rearHeightMin, rearHeightMax, 'rear')
    },
    damping: {
      // Flat backwards-compatible fields
      frontCriticalNsM,
      rearCriticalNsM,
      frontSliderValue,
      rearSliderValue,
      bumpToReboundRatio,

      // Explicit separated layers
      physical: {
        frontCriticalNsM,
        rearCriticalNsM,
        frontReboundDampingNsM,
        rearReboundDampingNsM,
        frontBumpDampingNsM,
        rearBumpDampingNsM
      },
      priors: {
        frontDampingRatio,
        rearDampingRatio,
        bumpToReboundRatio,
        source: 'calibration-prior/v1'
      },
      sliderMapping: {
        frontSliderValue,
        rearSliderValue,
        mappingSource: 'advisory_heuristic_v1'
      }
    },
    arb: { front: round(frontArb, 1), rear: round(rearArb, 1) }
  };
}
