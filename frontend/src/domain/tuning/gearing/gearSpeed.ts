import type { DevGearingOutput, DevTuningInput } from '../../../utils/tuningMath_dev';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finiteOr = (value: number | undefined, fallback: number): number => Number.isFinite(value) ? (value as number) : fallback;
const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function calculateTireCircumferenceM(car: DevTuningInput['car']): number {
  const width = car.drivetrain === 'FWD' ? finiteOr(car.frontTireWidth, 245) : finiteOr(car.rearTireWidth, 245);
  const aspect = car.drivetrain === 'FWD' ? finiteOr(car.frontTireAspect, 40) : finiteOr(car.rearTireAspect, 40);
  const rim = car.drivetrain === 'FWD' ? finiteOr(car.frontTireRim, 18) : finiteOr(car.rearTireRim, 18);
  return (((width * aspect / 100) * 2 + rim * 25.4) * Math.PI) / 1000;
}

export function calculateDevGearing(input: DevTuningInput): DevGearingOutput {
  const circumference = calculateTireCircumferenceM(input.car);
  const rpmAtPower = Math.max(3000, finiteOr(input.car.maxHpRpm, 7500));
  const targetSpeed = clamp(finiteOr(input.targetTopSpeedKmh, 280), 80, 450);
  const topGear = input.raceGoal === 'Drag' || input.raceGoal === 'Drift' ? 1.00 : input.raceGoal === 'Rally' ? 0.84 : 0.78;
  const finalDrive = clamp((rpmAtPower * circumference * 60) / (targetSpeed * 1000 * topGear), 2.00, 6.50);
  const gearCount = clamp(Math.round(finiteOr(input.car.adjustability?.gears, 6)), 4, 10);
  const firstGearTargetKmh = input.raceGoal === 'Drag' ? 105 : input.raceGoal === 'Drift' ? 115 : 100;
  const firstGear = clamp((rpmAtPower * circumference * 60) / (firstGearTargetKmh * finalDrive * 1000), 2.20, 4.80);
  const spacing = Math.pow(firstGear / topGear, 1 / (gearCount - 1));
  const gears = Array.from({ length: gearCount }, (_, index) => round(firstGear / Math.pow(spacing, index)));
  const topSpeedAtPeakHpKmh = (rpmAtPower * circumference * 60) / (gears[gearCount - 1] * finalDrive * 1000);
  return { finalDrive: round(finalDrive), gears, tireCircumferenceM: round(circumference, 3), topSpeedAtPeakHpKmh: round(topSpeedAtPeakHpKmh, 1) };
}
