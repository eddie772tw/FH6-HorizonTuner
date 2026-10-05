// Frozen characterization reference. Never import at runtime from product code.
import type { DevRaceGoal, DevSurface, DevTuningInput, DevCarInput, DevTuningOutput, DevTireOutput, DevChassisOutput, DevChassisSpringsOutput, DevDampingOutput, DevDampingPhysical, DevDampingPriors, DevDampingSliderMapping, DevAlignmentOutput, DevGearingOutput, DevDifferentialOutput } from '../../../src/domain/tuning/types';
export type { DevRaceGoal, DevSurface, DevTuningInput, DevCarInput, DevTuningOutput, DevTireOutput, DevChassisOutput, DevChassisSpringsOutput, DevDampingOutput, DevDampingPhysical, DevDampingPriors, DevDampingSliderMapping, DevAlignmentOutput, DevGearingOutput, DevDifferentialOutput } from '../../../src/domain/tuning/types';
/**
 * Experimental typed façade for the developer tuning workflow.
 *
 * Formula ownership lives under domain/tuning. This module owns the public
 * input/output contract consumed by TuningView_dev and keeps the legacy
 * tuningMath implementation out of the developer path.
 */

import { DEV_ALIGNMENT_PROFILES } from "../domain/tuning/constants";
import { calculateDevChassis } from "../domain/tuning/chassis/suspensionSolver";
import { calculateDevDifferential } from "../domain/tuning/chassis/differentialSolver";
import { calculateDevGearing } from "../domain/tuning/gearing/gearSpeed";
import { getDevTirePrior as getTirePrior } from "../domain/tuning/tires/tireModel";

export {
  calculateLoadTransfer,
  type LoadTransferInput,
  type LoadTransferOutput,
  type WheelLoadsN,
  type AxleLoadsN,
  type LoadTransferDetails
} from "../domain/tuning/chassis/loadTransfer";

export {
  calculateTireGeometry,
  calculateTireVerticalStiffnessPrior,
  type TireGeometryInput,
  type TireGeometryOutput,
  type TireVerticalStiffnessPriorOptions,
  type TireVerticalStiffnessPriorOutput
} from "../domain/tuning/tires/tireGeometry";






























const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function getDevTirePrior(tireType: string | undefined, surface: DevSurface): DevTireOutput {
  return getTirePrior(tireType, surface);
}

function calculateAlignment(input: DevTuningInput): DevAlignmentOutput {
  const profile = DEV_ALIGNMENT_PROFILES[input.raceGoal];
  const surfaceAdjustment = input.surface === 'snow' ? -1.0 : input.surface === 'gravel' ? -0.5 : 0;
  const hot = profile.hot + surfaceAdjustment;
  return {
    pressureColdFrontPsi: round(hot - 3.0),
    pressureColdRearPsi: round(hot - 3.0),
    targetHotPressurePsi: round(hot),
    camberFrontDeg: profile.frontCamber,
    camberRearDeg: profile.rearCamber,
    toeFrontDeg: profile.frontToe,
    toeRearDeg: profile.rearToe,
    casterDeg: profile.caster
  };
}

function collectWarnings(input: DevTuningInput): string[] {
  const warnings = [
    'Experimental TuningMath: coefficients are calibration priors and require telemetry or in-game validation.',
    'Spring calculations use a direct wheel-load approximation (MR=1.0 assumed); vehicle-specific suspension motion ratios and tire vertical stiffness are not yet calibrated.',
    'Damping is resolved into explicit physical critical damping (N·s/m), damping-ratio priors, and advisory FH6 slider mappings.',
    'FH6 slider increments and upgrade locks are not inferred from this calculation layer; verify against the selected part.'
  ];
  const adjustability = input.car.adjustability;
  if (adjustability?.suspension === 'Fixed') warnings.push('Suspension is marked Fixed; spring, height, and damping outputs may not be editable.');
  if (adjustability?.arb === 'Fixed') warnings.push('Anti-roll bars are marked Fixed; ARB outputs may not be editable.');
  if (adjustability?.gearbox === 'Fixed') warnings.push('Gearbox is marked Fixed; gearing output is advisory only.');
  if (adjustability?.diff === 'Fixed') warnings.push('Differential is marked Fixed; differential output is advisory only.');
  return warnings;
}

export function calculateDevTuning(input: DevTuningInput): DevTuningOutput {
  return {
    schemaVersion: 'tuning-dev/v1',
    inputSummary: { raceGoal: input.raceGoal, surface: input.surface, drivetrain: input.car.drivetrain },
    tire: getDevTirePrior(input.car.tireType, input.surface),
    chassis: calculateDevChassis(input),
    alignment: calculateAlignment(input),
    gearing: calculateDevGearing(input),
    differential: calculateDevDifferential(input),
    warnings: collectWarnings(input)
  };
}
