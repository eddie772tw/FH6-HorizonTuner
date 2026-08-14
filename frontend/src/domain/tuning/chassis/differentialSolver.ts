import type { DevDifferentialOutput, DevTuningInput } from '../../../utils/tuningMath_dev';

export function calculateDevDifferential(input: DevTuningInput): DevDifferentialOutput {
  const isFwd = input.car.drivetrain === 'FWD';
  const isRwd = input.car.drivetrain === 'RWD';
  if (input.raceGoal === 'Drag') return { frontAccelPercent: isFwd ? 80 : 0, frontDecelPercent: isFwd ? 20 : 0, rearAccelPercent: isRwd ? 100 : 0, rearDecelPercent: isRwd ? 25 : 0, centerToRearPercent: 50 };
  if (input.raceGoal === 'Drift') return { frontAccelPercent: isFwd ? 45 : 0, frontDecelPercent: 0, rearAccelPercent: isRwd ? 100 : 85, rearDecelPercent: isRwd ? 20 : 15, centerToRearPercent: 75 };
  if (input.raceGoal === 'Rally') return { frontAccelPercent: isFwd ? 55 : 35, frontDecelPercent: 15, rearAccelPercent: isRwd ? 65 : 55, rearDecelPercent: 20, centerToRearPercent: 58 };
  return { frontAccelPercent: isFwd ? 35 : 25, frontDecelPercent: 10, rearAccelPercent: isRwd ? 55 : 45, rearDecelPercent: 18, centerToRearPercent: 60 };
}
