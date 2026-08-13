/**
 * Experimental typed façade for the developer tuning workflow.
 *
 * Formula ownership lives under domain/tuning. This module owns the public
 * input/output contract consumed by TuningView_dev and keeps the legacy
 * tuningMath implementation out of the developer path.
 */

import { DEV_ALIGNMENT_PROFILES } from '../domain/tuning/constants';
import { calculateDevChassis } from '../domain/tuning/chassis/suspensionSolver';
import { calculateDevDifferential } from '../domain/tuning/chassis/differentialSolver';
import { calculateDevGearing } from '../domain/tuning/gearing/gearSpeed';
import { getDevTirePrior as getTirePrior } from '../domain/tuning/tires/tireModel';

export type DevRaceGoal = 'Road' | 'Rally' | 'Drag' | 'Drift';
export type DevSurface = 'tarmac' | 'gravel' | 'snow' | 'dragStrip';

export interface DevCarInput {
  weight: number;
  weight_distribution: number;
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  maxHp: number;
  maxHpRpm: number;
  maxTorqueRpm: number;
  tireType?: string;
  frontTireWidth?: number;
  frontTireAspect?: number;
  frontTireRim?: number;
  rearTireWidth?: number;
  rearTireAspect?: number;
  rearTireRim?: number;
  adjustability?: {
    gears?: number;
    suspension?: string;
    arb?: string;
    gearbox?: string;
    diff?: string;
  };
  spring_front_min?: number;
  spring_front_max?: number;
  spring_rear_min?: number;
  spring_rear_max?: number;
  height_front_min?: number;
  height_front_max?: number;
  height_rear_min?: number;
  height_rear_max?: number;
  arb_front_min?: number;
  arb_front_max?: number;
  arb_rear_min?: number;
  arb_rear_max?: number;
}

export interface DevTuningInput {
  raceGoal: DevRaceGoal;
  surface: DevSurface;
  car: DevCarInput;
  targetTopSpeedKmh: number;
  targetRideFrequencyFrontHz: number;
  targetRideFrequencyRearHz: number;
  dampingRatioFront: number;
  dampingRatioRear: number;
}

export interface DevTireOutput {
  compound: string;
  surface: DevSurface;
  muLongitudinal: number;
  muLateral: number;
  temperatureMultiplier: number;
  pressureMultiplier: number;
  loadSensitivity: number;
  peakSlipRatio: number;
  peakSlipAngleDeg: number;
  source: 'calibration-prior';
}

export interface DevChassisOutput {
  springs: { frontKgfMm: number; rearKgfMm: number; frontRideHeightCm: number; rearRideHeightCm: number };
  damping: { frontCriticalNsM: number; rearCriticalNsM: number; frontSliderValue: number; rearSliderValue: number; bumpToReboundRatio: number };
  arb: { front: number; rear: number };
}

export interface DevAlignmentOutput {
  pressureColdFrontPsi: number;
  pressureColdRearPsi: number;
  targetHotPressurePsi: number;
  camberFrontDeg: number;
  camberRearDeg: number;
  toeFrontDeg: number;
  toeRearDeg: number;
  casterDeg: number;
}

export interface DevGearingOutput {
  finalDrive: number;
  gears: number[];
  tireCircumferenceM: number;
  topSpeedAtPeakHpKmh: number;
}

export interface DevDifferentialOutput {
  frontAccelPercent: number;
  frontDecelPercent: number;
  rearAccelPercent: number;
  rearDecelPercent: number;
  centerToRearPercent: number;
}

export interface DevTuningOutput {
  schemaVersion: 'tuning-dev/v1';
  inputSummary: { raceGoal: DevRaceGoal; surface: DevSurface; drivetrain: DevCarInput['drivetrain'] };
  tire: DevTireOutput;
  chassis: DevChassisOutput;
  alignment: DevAlignmentOutput;
  gearing: DevGearingOutput;
  differential: DevDifferentialOutput;
  warnings: string[];
}

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
    'Damping slider values are a display mapping; critical damping remains the physical reference output.',
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
