import type { DevChassisOutput, DevRaceGoal, DevTuningInput } from '../../../utils/tuningMath_dev';
import { DEV_CHASSIS_PROFILES } from '../constants';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finiteOr = (value: number | undefined, fallback: number): number => Number.isFinite(value) ? (value as number) : fallback;
const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};
const bounded = (value: number | undefined, fallbackMin: number, fallbackMax: number): [number, number] => {
  const min = finiteOr(value, fallbackMin);
  return min <= fallbackMax ? [min, fallbackMax] : [fallbackMin, fallbackMax];
};

function calculateSpringKgfMm(massKg: number, frequencyHz: number): number {
  return ((2 * Math.PI * frequencyHz) ** 2 * massKg) / 9806.65;
}

function calculateCriticalDamping(massKg: number, springKgfMm: number): number {
  return 2 * Math.sqrt(springKgfMm * 9806.65 * massKg);
}

function calculateHeight(raceGoal: DevRaceGoal, min: number, max: number, axle: 'front' | 'rear'): number {
  const fraction = raceGoal === 'Rally' ? 0.90 : raceGoal === 'Drag' ? (axle === 'front' ? 0.05 : 0.70) : raceGoal === 'Drift' ? 0.20 : 0.12;
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
  const frontSpring = clamp(calculateSpringKgfMm(frontWheelMass, frontFrequency), frontSpringMin, frontSpringMax);
  const rearSpring = clamp(calculateSpringKgfMm(rearWheelMass, rearFrequency), rearSpringMin, rearSpringMax);
  const [frontHeightMin, frontHeightMax] = bounded(car.height_front_min, 10, finiteOr(car.height_front_max, 25));
  const [rearHeightMin, rearHeightMax] = bounded(car.height_rear_min, 10, finiteOr(car.height_rear_max, 25));
  const profile = DEV_CHASSIS_PROFILES[input.raceGoal];
  const weightBias = (frontPercent - 0.5) * 8;
  const [frontArbMin, frontArbMax] = bounded(car.arb_front_min, 1, finiteOr(car.arb_front_max, 65));
  const [rearArbMin, rearArbMax] = bounded(car.arb_rear_min, 1, finiteOr(car.arb_rear_max, 65));
  const frontArb = clamp(1 + 64 * profile.frontArb * frontPercent + weightBias, frontArbMin, frontArbMax);
  const rearArb = clamp(1 + 64 * profile.rearArb * (1 - frontPercent) - weightBias, rearArbMin, rearArbMax);
  const frontDampingRatio = clamp(finiteOr(input.dampingRatioFront, 0.70), 0.30, 1.20);
  const rearDampingRatio = clamp(finiteOr(input.dampingRatioRear, 0.70), 0.30, 1.20);
  return {
    springs: {
      frontKgfMm: round(frontSpring),
      rearKgfMm: round(rearSpring),
      frontRideHeightCm: calculateHeight(input.raceGoal, frontHeightMin, frontHeightMax, 'front'),
      rearRideHeightCm: calculateHeight(input.raceGoal, rearHeightMin, rearHeightMax, 'rear')
    },
    damping: {
      frontCriticalNsM: round(calculateCriticalDamping(frontWheelMass, frontSpring), 1),
      rearCriticalNsM: round(calculateCriticalDamping(rearWheelMass, rearSpring), 1),
      frontSliderValue: round(clamp(1 + frontDampingRatio * 16 + (frontFrequency - 2) * 1.5, 1, 20), 1),
      rearSliderValue: round(clamp(1 + rearDampingRatio * 16 + (rearFrequency - 2) * 1.5, 1, 20), 1),
      bumpToReboundRatio: 0.55
    },
    arb: { front: round(frontArb, 1), rear: round(rearArb, 1) }
  };
}
