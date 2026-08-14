/**
 * Drag Launch Traction and Distance Profile Solver (Phase 5D)
 *
 * Implements typed `tuning-profile/v1` schema supporting:
 * - Profiles: `quarter_mile`, `half_mile`, `eighth_mile`, `custom_strip`, `unrestricted`
 * - Longitudinal Load Transfer: deltaFz = m * a * hCG / L (front-to-rear load shift)
 * - Axle Traction Allocation:
 *   - FWD: Fx,max = muLong * (Fz_front,static - deltaFz) (traction drops under launch squat)
 *   - RWD: Fx,max = muLong * (Fz_rear,static + deltaFz) (traction rises under launch squat)
 *   - AWD: Fx,max = muLong * m * g (torque split / combined front+rear axle capacity)
 * - Wheel Force & Wheelspin:
 *   - F_wheel = efficiency * T(rpm) * gearRatio * finalDrive / r_tire
 *   - a = (min(F_wheel, Fx,max) - F_drag - F_roll) / m
 *   - F_drag = 0.5 * rho * CdA * v^2, F_roll = Crr * m * g
 *   - Traction-limited vs power-limited regime identification and wheelspin duration
 * - Dynamic Gearing Optimization:
 *   - No hardcoded 4th gear 1.00; optimizes active top gear by strip length, power curve, and top speed
 *   - Supports 4 to 10 monotonic gears with progressive spacing
 * - Power Curve Shift Advice:
 *   - Post-shift wheel force crossover evaluation or peak HP / redline prior
 * - Distance Numerical Integration (Simulated / Estimated):
 *   - Fixed dt step simulation with milestone detection (60-ft, 100-m, 1/8-mile, 1/4-mile, terminal speed)
 * - Drag Chassis & Alignment Targets:
 *   - 0 camber / zero toe, soft front ARB / stiff rear ARB, drag diff spool lock, low rear tire pressure
 * - Explicit Validation & Warning System:
 *   - Zero false precision; warns when geometry, power curve, or aero priors are defaulted.
 *
 * NOTE: All simulated times, forces, and tuning presets are engineering calibration priors and
 * quasi-static models. They are NOT claimed as live Forza Horizon 6 in-game ground truth.
 */

import {
  DEV_ALIGNMENT_PROFILES,
  DEV_SURFACE_MULTIPLIERS,
  DEV_TIRE_PRIORS
} from '../constants';
import type { DevCarInput, DevSurface } from '../../../utils/tuningMath_dev';
import { calculateTireGeometry } from '../tires/tireGeometry';

export type DragProfileType = 'quarter_mile' | 'half_mile' | 'eighth_mile' | 'custom_strip' | 'unrestricted';
export type TuningProfileStatus = 'empirical-prior' | 'estimated' | 'calibrated';

export interface PowerCurvePoint {
  rpm: number;
  torqueNm?: number;
  powerHp?: number;
  powerKw?: number;
}

export interface DragGeometryInput {
  massKg?: number;
  cgHeightM?: number;
  hCGm?: number;
  wheelbaseM?: number;
  weightDistributionFrontPct?: number;
  staticWeightDistributionFrontPct?: number;
  trackFrontM?: number;
  trackRearM?: number;
}

export interface DragAeroPriorInput {
  CdA?: number;
  Crr?: number;
  airDensity?: number;
  rho?: number;
  drivetrainEfficiency?: number;
  efficiency?: number;
  gravityMPerS2?: number;
}

export interface DragProfileInput {
  profile?: DragProfileType;
  targetStripLengthM?: number;
  stripLengthM?: number;
  targetTopSpeedKmh?: number;
  car: DevCarInput;
  drivetrain?: 'FWD' | 'RWD' | 'AWD';
  gearCount?: number;
  powerCurve?: PowerCurvePoint[];
  geometry?: DragGeometryInput;
  aero?: DragAeroPriorInput;
  surface?: DevSurface | string;
  tireType?: string;
  launchRpm?: number;
  awdFrontSplitPct?: number;
  straightRatio?: number;
}

export interface DragGearShiftAdvice {
  fromGear: number;
  toGear: number;
  shiftRpm: number;
  postShiftRpm: number;
  postShiftForceN?: number;
  shiftSpeedKmh: number;
  reason: 'wheel_force_crossover' | 'redline_optimal' | 'estimated_peak_hp_prior';
}

export interface DragGearingOutput {
  gearingStrategy: 'drag_strip_optimized_spacing';
  finalDrive: number;
  gears: number[];
  gearCount: number;
  activeTopGear: number;
  activeTopGearRatio: number;
  tireCircumferenceM: number;
  tireRadiusM: number;
  topSpeedAtPeakHpKmh: number;
  gearSpeedsKmh: number[];
  shiftAdvice: DragGearShiftAdvice[];
  spacingRatio: number;
}

export interface DragLaunchTractionOutput {
  status: TuningProfileStatus;
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  staticNormalLoadFrontN: number;
  staticNormalLoadRearN: number;
  totalStaticNormalLoadN: number;
  dynamicLaunchNormalLoadFrontN: number;
  dynamicLaunchNormalLoadRearN: number;
  longitudinalLoadTransferLaunchN: number;
  loadTransferDirection: 'rearward';
  muLongitudinal: number;
  maxTractionForceLaunchN: number;
  frontAxleTractionCapacityN: number;
  rearAxleTractionCapacityN: number;
  engineLaunchWheelForceN: number;
  isTractionLimited: boolean;
  hasWheelspin: boolean;
  tractionUtilization: number;
  launchAccelerationMps2: number;
  launchAccelerationG: number;
  tractionModeNotes: string;
}

export interface DragMilestoneMetric {
  label: string;
  distanceM: number;
  timeSeconds: number;
  speedKmh: number;
  speedMps: number;
  gear: number;
  rpm: number;
  reached: boolean;
}

export interface DragDistanceSimulation {
  status: 'estimated';
  simulated: true;
  integrationDtSeconds: number;
  targetStripLengthM: number;
  stripTimeSeconds: number;
  terminalSpeedKmh: number;
  terminalSpeedMps: number;
  sixtyFootTimeSeconds: number;
  sixtyFootSpeedKmh: number;
  hundredMeterTimeSeconds: number;
  hundredMeterSpeedKmh: number;
  eighthMileTimeSeconds: number;
  eighthMileSpeedKmh: number;
  quarterMileTimeSeconds: number;
  quarterMileSpeedKmh: number;
  zeroToHundredKmhTimeSeconds?: number;
  zeroToTwoHundredKmhTimeSeconds?: number;
  wheelspinDurationSeconds: number;
  milestones: DragMilestoneMetric[];
  notes: string;
}

export interface DragSpringsTarget {
  modelType: 'direct_wheel_load_approx';
  frontKgfMm: number;
  rearKgfMm: number;
  frontRideHeightCm: number;
  rearRideHeightCm: number;
  targetFrequencyFrontHz: number;
  targetFrequencyRearHz: number;
  notes: string;
}

export interface DragDampingTarget {
  frontCriticalNsM: number;
  rearCriticalNsM: number;
  frontReboundNsM: number;
  rearReboundNsM: number;
  frontBumpNsM: number;
  rearBumpNsM: number;
  frontSlider: number;
  rearSlider: number;
  bumpToReboundRatio: number;
  frontDampingRatio: number;
  rearDampingRatio: number;
  notes: string;
}

export interface DragArbTarget {
  front: number;
  rear: number;
  rollStiffnessFrontPct: number;
  mode: 'drag_launch_anti_roll_stiff_rear';
  notes: string;
}

export interface DragDifferentialTarget {
  strategy: 'drag_spool_high_lock_prior';
  frontAccelPercent: number;
  frontDecelPercent: number;
  rearAccelPercent: number;
  rearDecelPercent: number;
  centerToRearPercent: number;
  notes: string;
}

export interface DragAlignmentTarget {
  frontCamberDeg: number;
  rearCamberDeg: number;
  frontToeDeg: number;
  rearToeDeg: number;
  casterDeg: number;
  notes: string;
}

export interface DragPressureTarget {
  coldFrontPsi: number;
  coldRearPsi: number;
  targetHotFrontPsi: number;
  targetHotRearPsi: number;
  notes: string;
}

export interface DragChassisTargets {
  springs: DragSpringsTarget;
  damping: DragDampingTarget;
  arb: DragArbTarget;
  differential: DragDifferentialTarget;
}

export interface DragTireTargets {
  compound: string;
  surface: DevSurface | string;
  alignment: DragAlignmentTarget;
  pressures: DragPressureTarget;
  muLongitudinal: number;
  muLateral: number;
  frictionCapacityN: {
    frontPerTireN: number;
    rearPerTireN: number;
    totalLaunchN: number;
  };
}

export interface DragProfileOutput {
  schemaVersion: 'tuning-profile/v1';
  profile: DragProfileType;
  status: TuningProfileStatus;
  source: 'empirical-prior' | 'estimated' | 'calibrated';
  targetStripLengthM: number;
  targetTopSpeedKmh: number;
  launchTraction: DragLaunchTractionOutput;
  gearing: DragGearingOutput;
  simulation: DragDistanceSimulation;
  chassis: DragChassisTargets;
  tires: DragTireTargets;
  warnings: string[];
  assumptions: string[];
}

export interface SanitizedDragInput {
  profile: DragProfileType;
  targetStripLengthM: number;
  targetTopSpeedKmh: number;
  car: DevCarInput;
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  gearCount: number;
  powerCurve?: PowerCurvePoint[];
  massKg: number;
  cgHeightM: number;
  wheelbaseM: number;
  weightDistributionFrontPct: number;
  trackFrontM: number;
  trackRearM: number;
  CdA: number;
  Crr: number;
  airDensity: number;
  drivetrainEfficiency: number;
  gravityMPerS2: number;
  surface: DevSurface | string;
  tireType: string;
  launchRpm: number;
  awdFrontSplitPct: number;
}

const DEFAULT_STRIP_LENGTH_M = 402.336; // 1/4 mile (1320 ft)
const DEFAULT_TOP_SPEED_KMH = 320;
const DEFAULT_MASS_KG = 1500;
const DEFAULT_WEIGHT_DIST_FRONT = 50;
const DEFAULT_WHEELBASE_M = 2.60;
const DEFAULT_CG_HEIGHT_M = 0.50;
const DEFAULT_TRACK_M = 1.60;
const DEFAULT_CDA_M2 = 0.70;
const DEFAULT_CRR = 0.015;
const DEFAULT_RHO_KG_M3 = 1.225;
const DEFAULT_GRAVITY = 9.80665;
const DEFAULT_EFFICIENCY_2WD = 0.88;
const DEFAULT_EFFICIENCY_AWD = 0.84;

const clamp = (val: number, min: number, max: number): number => Math.min(max, Math.max(min, val));
const finiteOr = (val: number | undefined, fallback: number): number =>
  Number.isFinite(val) ? (val as number) : fallback;
const round = (val: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(val * factor) / factor;
};

/**
 * Calculates rolling circumference of the driven axle's tires.
 */
export function calculateDragTireCircumferenceM(car: DevCarInput, drivetrain?: 'FWD' | 'RWD' | 'AWD'): number {
  const dt = drivetrain ?? car.drivetrain ?? 'RWD';
  const isFrontDriven = dt === 'FWD';
  const width = isFrontDriven ? finiteOr(car.frontTireWidth, 245) : finiteOr(car.rearTireWidth, 275);
  const aspect = isFrontDriven ? finiteOr(car.frontTireAspect, 40) : finiteOr(car.rearTireAspect, 35);
  const rim = isFrontDriven ? finiteOr(car.frontTireRim, 18) : finiteOr(car.rearTireRim, 18);

  const geom = calculateTireGeometry({
    widthMm: width,
    aspectRatio: aspect,
    rimDiameterIn: rim
  });
  return geom.rollingCircumferenceM;
}

/**
 * Validates and sanitizes drag profile input, returning warnings for fallbacks.
 */
export function validateDragProfileInput(input: DragProfileInput): {
  valid: boolean;
  warnings: string[];
  assumptions: string[];
  sanitized: SanitizedDragInput;
} {
  const warnings: string[] = [];
  const assumptions: string[] = [];

  // Strip Length
  const rawStrip = input.targetStripLengthM ?? input.stripLengthM;
  let targetStripLengthM: number;
  if (!Number.isFinite(rawStrip) || (rawStrip as number) <= 0) {
    targetStripLengthM = DEFAULT_STRIP_LENGTH_M;
    warnings.push(`Target strip length '${rawStrip}' invalid; defaulting to standard 1/4-mile (402.34m).`);
  } else if ((rawStrip as number) < 50 || (rawStrip as number) > 5000) {
    targetStripLengthM = clamp(rawStrip as number, 50, 5000);
    warnings.push(`Strip length ${rawStrip}m clamped to [50, 5000]m (${targetStripLengthM}m).`);
  } else {
    targetStripLengthM = rawStrip as number;
  }

  // Profile selection
  let profile: DragProfileType = input.profile ?? 'quarter_mile';
  if (Math.abs(targetStripLengthM - 201.168) < 10) profile = 'eighth_mile';
  else if (Math.abs(targetStripLengthM - 402.336) < 10) profile = 'quarter_mile';
  else if (Math.abs(targetStripLengthM - 804.672) < 10) profile = 'half_mile';
  else if (targetStripLengthM > 1000) profile = 'unrestricted';
  else profile = input.profile ?? 'custom_strip';

  // Target Top Speed
  const rawTopSpeed = input.targetTopSpeedKmh;
  let targetTopSpeedKmh: number;
  if (!Number.isFinite(rawTopSpeed) || (rawTopSpeed as number) <= 0) {
    targetTopSpeedKmh = DEFAULT_TOP_SPEED_KMH;
    warnings.push(`Target top speed '${rawTopSpeed}' invalid; defaulting to ${DEFAULT_TOP_SPEED_KMH} km/h.`);
  } else if ((rawTopSpeed as number) < 80 || (rawTopSpeed as number) > 550) {
    targetTopSpeedKmh = clamp(rawTopSpeed as number, 80, 550);
    warnings.push(`Target top speed ${rawTopSpeed} km/h clamped to [80, 550] km/h (${targetTopSpeedKmh} km/h).`);
  } else {
    targetTopSpeedKmh = rawTopSpeed as number;
  }

  // Drivetrain
  const drivetrain: 'FWD' | 'RWD' | 'AWD' =
    input.drivetrain ?? input.car.drivetrain ?? 'RWD';

  // Gear count
  const rawGears = input.gearCount ?? input.car.adjustability?.gears;
  let gearCount: number;
  if (!Number.isFinite(rawGears)) {
    gearCount = 6;
  } else if ((rawGears as number) < 4 || (rawGears as number) > 10) {
    gearCount = clamp(Math.round(rawGears as number), 4, 10);
    warnings.push(`Gear count ${rawGears} clamped to supported range [4, 10] (${gearCount}).`);
  } else {
    gearCount = Math.round(rawGears as number);
  }

  // Geometry
  const rawMass = input.geometry?.massKg ?? input.car.weight;
  let massKg: number;
  if (!Number.isFinite(rawMass) || (rawMass as number) <= 0) {
    massKg = DEFAULT_MASS_KG;
    warnings.push(`Vehicle mass '${rawMass}' invalid; defaulting to ${DEFAULT_MASS_KG} kg.`);
  } else if ((rawMass as number) < 300 || (rawMass as number) > 6000) {
    massKg = clamp(rawMass as number, 300, 6000);
    warnings.push(`Vehicle mass ${rawMass} kg clamped to [300, 6000] kg (${massKg} kg).`);
  } else {
    massKg = rawMass as number;
  }

  const rawDist =
    input.geometry?.weightDistributionFrontPct ??
    input.geometry?.staticWeightDistributionFrontPct ??
    input.car.weight_distribution;
  let weightDistributionFrontPct: number;
  if (!Number.isFinite(rawDist)) {
    weightDistributionFrontPct = DEFAULT_WEIGHT_DIST_FRONT;
    warnings.push(`Weight distribution '${rawDist}' invalid; defaulting to ${DEFAULT_WEIGHT_DIST_FRONT}%.`);
  } else if ((rawDist as number) < 10 || (rawDist as number) > 90) {
    weightDistributionFrontPct = clamp(rawDist as number, 10, 90);
    warnings.push(`Weight distribution ${rawDist}% clamped to [10, 90]% (${weightDistributionFrontPct}%).`);
  } else {
    weightDistributionFrontPct = rawDist as number;
  }

  const rawWb = input.geometry?.wheelbaseM;
  let wheelbaseM: number;
  if (!Number.isFinite(rawWb) || (rawWb as number) <= 0) {
    wheelbaseM = DEFAULT_WHEELBASE_M;
    assumptions.push(`Vehicle wheelbase not explicitly specified; using empirical prior (${DEFAULT_WHEELBASE_M}m).`);
  } else if ((rawWb as number) < 1.0 || (rawWb as number) > 5.0) {
    wheelbaseM = clamp(rawWb as number, 1.0, 5.0);
    warnings.push(`Wheelbase ${rawWb}m clamped to [1.0, 5.0]m (${wheelbaseM}m).`);
  } else {
    wheelbaseM = rawWb as number;
  }

  const rawCg = input.geometry?.cgHeightM ?? input.geometry?.hCGm;
  let cgHeightM: number;
  if (!Number.isFinite(rawCg) || (rawCg as number) <= 0) {
    cgHeightM = DEFAULT_CG_HEIGHT_M;
    assumptions.push(`Vehicle CG height (hCG) not specified; using empirical prior (${DEFAULT_CG_HEIGHT_M}m).`);
  } else if ((rawCg as number) < 0.1 || (rawCg as number) > 1.5) {
    cgHeightM = clamp(rawCg as number, 0.1, 1.5);
    warnings.push(`CG height ${rawCg}m clamped to [0.1, 1.5]m (${cgHeightM}m).`);
  } else {
    cgHeightM = rawCg as number;
  }

  const trackFrontM = finiteOr(input.geometry?.trackFrontM, DEFAULT_TRACK_M);
  const trackRearM = finiteOr(input.geometry?.trackRearM, DEFAULT_TRACK_M);

  // Aero / Resistance priors
  const rawCdA = input.aero?.CdA;
  let CdA: number;
  if (!Number.isFinite(rawCdA) || (rawCdA as number) <= 0) {
    CdA = DEFAULT_CDA_M2;
    assumptions.push(`Aerodynamic drag area (CdA) not specified; using default drag prior (${DEFAULT_CDA_M2} m^2).`);
  } else {
    CdA = rawCdA as number;
  }

  const rawCrr = input.aero?.Crr;
  let Crr: number;
  if (!Number.isFinite(rawCrr) || (rawCrr as number) <= 0) {
    Crr = DEFAULT_CRR;
    assumptions.push(`Rolling resistance coefficient (Crr) not specified; using default prior (${DEFAULT_CRR}).`);
  } else {
    Crr = rawCrr as number;
  }

  const airDensity = finiteOr(input.aero?.airDensity ?? input.aero?.rho, DEFAULT_RHO_KG_M3);
  const gravityMPerS2 = finiteOr(input.aero?.gravityMPerS2, DEFAULT_GRAVITY);

  const defaultEff = drivetrain === 'AWD' ? DEFAULT_EFFICIENCY_AWD : DEFAULT_EFFICIENCY_2WD;
  const rawEff = input.aero?.drivetrainEfficiency ?? input.aero?.efficiency;
  let drivetrainEfficiency: number;
  if (!Number.isFinite(rawEff) || (rawEff as number) <= 0) {
    drivetrainEfficiency = defaultEff;
    assumptions.push(`Drivetrain efficiency not specified; using ${defaultEff * 100}% prior for ${drivetrain}.`);
  } else {
    drivetrainEfficiency = clamp(rawEff as number, 0.60, 0.99);
  }

  // Surface & Tires
  const surface = input.surface ?? 'dragStrip';
  const tireType = input.tireType ?? input.car.tireType ?? 'Drag';

  // Launch RPM
  const maxTorqueRpm = finiteOr(input.car.maxTorqueRpm, 4500);
  const maxHpRpm = finiteOr(input.car.maxHpRpm, 7000);
  const rawLaunchRpm = input.launchRpm;
  let launchRpm: number;
  if (!Number.isFinite(rawLaunchRpm)) {
    launchRpm = clamp(maxTorqueRpm, 2500, maxHpRpm);
  } else {
    launchRpm = clamp(rawLaunchRpm as number, 1500, Math.max(3000, maxHpRpm));
  }

  // AWD Front Split Pct
  const awdFrontSplitPct = clamp(finiteOr(input.awdFrontSplitPct, 30), 10, 70);

  // Power curve check
  if (!input.powerCurve || input.powerCurve.length === 0) {
    assumptions.push('Power curve not provided; shift advice and launch torque derived from peak HP/torque priors.');
  }

  return {
    valid: true,
    warnings,
    assumptions,
    sanitized: {
      profile,
      targetStripLengthM,
      targetTopSpeedKmh,
      car: input.car,
      drivetrain,
      gearCount,
      powerCurve: input.powerCurve,
      massKg,
      cgHeightM,
      wheelbaseM,
      weightDistributionFrontPct,
      trackFrontM,
      trackRearM,
      CdA,
      Crr,
      airDensity,
      drivetrainEfficiency,
      gravityMPerS2,
      surface,
      tireType,
      launchRpm,
      awdFrontSplitPct
    }
  };
}

/**
 * Estimates engine torque at given RPM from power curve or peak HP/Torque model.
 */
export function estimateEngineTorqueNm(
  rpm: number,
  car: DevCarInput,
  powerCurve?: PowerCurvePoint[]
): number {
  const safeRpm = Math.max(800, rpm);

  if (powerCurve && powerCurve.length > 0) {
    const sorted = [...powerCurve].sort((a, b) => a.rpm - b.rpm);
    if (safeRpm <= sorted[0].rpm) {
      const p = sorted[0];
      if (Number.isFinite(p.torqueNm)) return p.torqueNm as number;
      const hp = p.powerHp ?? (p.powerKw ? (p.powerKw * 1.34102) : undefined);
      if (hp) return (hp * 745.699872) / (p.rpm * (Math.PI / 30));
    }
    if (safeRpm >= sorted[sorted.length - 1].rpm) {
      const p = sorted[sorted.length - 1];
      if (Number.isFinite(p.torqueNm)) return p.torqueNm as number;
      const hp = p.powerHp ?? (p.powerKw ? (p.powerKw * 1.34102) : undefined);
      if (hp) return (hp * 745.699872) / (p.rpm * (Math.PI / 30));
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      if (safeRpm >= p1.rpm && safeRpm <= p2.rpm) {
        const getT = (p: PowerCurvePoint): number => {
          if (Number.isFinite(p.torqueNm)) return p.torqueNm as number;
          const hp = p.powerHp ?? (p.powerKw ? (p.powerKw * 1.34102) : undefined);
          if (hp) return (hp * 745.699872) / (p.rpm * (Math.PI / 30));
          return 400;
        };
        const t1 = getT(p1);
        const t2 = getT(p2);
        const ratio = (safeRpm - p1.rpm) / (p2.rpm - p1.rpm);
        return t1 + ratio * (t2 - t1);
      }
    }
  }

  // Fallback parametric torque curve based on maxHp, maxHpRpm, maxTorqueRpm
  const maxHp = finiteOr(car.maxHp, 400);
  const maxHpRpm = Math.max(3000, finiteOr(car.maxHpRpm, 6500));
  const maxTorqueRpm = clamp(finiteOr(car.maxTorqueRpm, 4200), 1500, maxHpRpm);

  // Peak torque estimation: T_hp = (HP * 745.7) / (rpm * 2pi/60)
  const torqueAtMaxHp = (maxHp * 745.699872) / (maxHpRpm * (Math.PI / 30));
  const peakTorqueNm = Math.max(torqueAtMaxHp * 1.18, 300);

  if (safeRpm <= maxTorqueRpm) {
    const fraction = (safeRpm - 800) / Math.max(500, maxTorqueRpm - 800);
    const rise = 0.70 + 0.30 * Math.sin(Math.max(0, fraction) * (Math.PI / 2));
    return peakTorqueNm * rise;
  } else if (safeRpm <= maxHpRpm) {
    const fraction = (safeRpm - maxTorqueRpm) / (maxHpRpm - maxTorqueRpm);
    return peakTorqueNm - fraction * (peakTorqueNm - torqueAtMaxHp);
  } else {
    const fraction = (safeRpm - maxHpRpm) / 2000;
    return Math.max(torqueAtMaxHp * 0.5, torqueAtMaxHp * (1 - 0.35 * fraction));
  }
}

/**
 * Calculates longitudinal load transfer and available launch traction for FWD, RWD, and AWD.
 */
export function calculateDragTractionAndLoadTransfer(params: {
  massKg: number;
  weightDistributionFrontPct: number;
  wheelbaseM: number;
  cgHeightM: number;
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  muLongitudinal: number;
  engineLaunchTorqueNm: number;
  firstGearRatio: number;
  finalDriveRatio: number;
  tireRadiusM: number;
  drivetrainEfficiency: number;
  gravityMPerS2?: number;
  awdFrontSplitPct?: number;
}): DragLaunchTractionOutput {
  const g = params.gravityMPerS2 ?? DEFAULT_GRAVITY;
  const m = params.massKg;
  const Wf = params.weightDistributionFrontPct / 100;
  const L = Math.max(0.5, params.wheelbaseM);
  const hCG = Math.max(0.05, params.cgHeightM);
  const mu = Math.max(0.1, params.muLongitudinal);
  const eta = params.drivetrainEfficiency;

  // Static normal forces
  const staticFzTotal = m * g;
  const staticFzFront = staticFzTotal * Wf;
  const staticFzRear = staticFzTotal * (1 - Wf);

  // Engine launch wheel force
  const engineLaunchWheelForceN =
    (eta * params.engineLaunchTorqueNm * params.firstGearRatio * params.finalDriveRatio) /
    Math.max(0.1, params.tireRadiusM);

  // Solve quasi-static launch acceleration and load transfer
  let launchAccelMps2 = 0;
  let dynamicFzFront = staticFzFront;
  let dynamicFzRear = staticFzRear;
  let deltaFz = 0;
  let maxTractionLaunchN = 0;
  let frontAxleCapN = 0;
  let rearAxleCapN = 0;

  if (params.drivetrain === 'RWD') {
    // Under RWD traction limit: a = (mu * Fz_rear,static) / (m * (1 - mu * hCG / L))
    const denom = 1 - (mu * hCG) / L;
    const maxTractionAccel = denom > 0.05 ? (mu * staticFzRear) / (m * denom) : (mu * staticFzTotal) / m;
    const powerLimitedAccel = engineLaunchWheelForceN / m;

    if (powerLimitedAccel <= maxTractionAccel) {
      launchAccelMps2 = powerLimitedAccel;
      deltaFz = (m * launchAccelMps2 * hCG) / L;
      dynamicFzFront = Math.max(0, staticFzFront - deltaFz);
      dynamicFzRear = Math.min(staticFzTotal, staticFzRear + deltaFz);
      maxTractionLaunchN = mu * dynamicFzRear;
    } else {
      launchAccelMps2 = maxTractionAccel;
      deltaFz = (m * launchAccelMps2 * hCG) / L;
      dynamicFzFront = Math.max(0, staticFzFront - deltaFz);
      dynamicFzRear = Math.min(staticFzTotal, staticFzRear + deltaFz);
      maxTractionLaunchN = mu * dynamicFzRear;
    }
    frontAxleCapN = mu * dynamicFzFront;
    rearAxleCapN = mu * dynamicFzRear;
  } else if (params.drivetrain === 'FWD') {
    // Under FWD traction limit: a = (mu * Fz_front,static) / (m * (1 + mu * hCG / L))
    const denom = 1 + (mu * hCG) / L;
    const maxTractionAccel = (mu * staticFzFront) / (m * denom);
    const powerLimitedAccel = engineLaunchWheelForceN / m;

    if (powerLimitedAccel <= maxTractionAccel) {
      launchAccelMps2 = powerLimitedAccel;
      deltaFz = (m * launchAccelMps2 * hCG) / L;
      dynamicFzFront = Math.max(0, staticFzFront - deltaFz);
      dynamicFzRear = Math.min(staticFzTotal, staticFzRear + deltaFz);
      maxTractionLaunchN = mu * dynamicFzFront;
    } else {
      launchAccelMps2 = maxTractionAccel;
      deltaFz = (m * launchAccelMps2 * hCG) / L;
      dynamicFzFront = Math.max(0, staticFzFront - deltaFz);
      dynamicFzRear = Math.min(staticFzTotal, staticFzRear + deltaFz);
      maxTractionLaunchN = mu * dynamicFzFront;
    }
    frontAxleCapN = mu * dynamicFzFront;
    rearAxleCapN = mu * dynamicFzRear;
  } else {
    // AWD
    const maxTractionAccel = (mu * staticFzTotal) / m;
    const powerLimitedAccel = engineLaunchWheelForceN / m;

    launchAccelMps2 = Math.min(maxTractionAccel, powerLimitedAccel);
    deltaFz = (m * launchAccelMps2 * hCG) / L;
    dynamicFzFront = Math.max(0, staticFzFront - deltaFz);
    dynamicFzRear = Math.min(staticFzTotal, staticFzRear + deltaFz);

    frontAxleCapN = mu * dynamicFzFront;
    rearAxleCapN = mu * dynamicFzRear;

    const frontSplit = (params.awdFrontSplitPct ?? 30) / 100;
    const rearSplit = 1 - frontSplit;
    const splitLimitedTractionN = Math.min(frontAxleCapN / frontSplit, rearAxleCapN / rearSplit);
    maxTractionLaunchN = Math.min(mu * staticFzTotal, splitLimitedTractionN);
  }

  const isTractionLimited = engineLaunchWheelForceN > maxTractionLaunchN;
  const tractionUtilization = maxTractionLaunchN > 0 ? engineLaunchWheelForceN / maxTractionLaunchN : 1.0;
  const reportedLaunchAccelerationMps2 = round(launchAccelMps2, 2);
  const reportedDeltaFz = (m * reportedLaunchAccelerationMps2 * hCG) / L;

  let tractionNotes = '';
  if (params.drivetrain === 'FWD') {
    tractionNotes = 'FWD launch: dynamic load transfers away from front axle, reducing available traction under acceleration.';
  } else if (params.drivetrain === 'RWD') {
    tractionNotes = 'RWD launch: dynamic load transfers onto rear axle (+deltaFz), boosting launch grip.';
  } else {
    tractionNotes = 'AWD launch: dual axle traction distribution with dynamic weight shift maximizing total tractive grip.';
  }

  return {
    status: 'estimated',
    drivetrain: params.drivetrain,
    staticNormalLoadFrontN: round(staticFzFront, 1),
    staticNormalLoadRearN: round(staticFzRear, 1),
    totalStaticNormalLoadN: round(staticFzTotal, 1),
    dynamicLaunchNormalLoadFrontN: round(dynamicFzFront, 1),
    dynamicLaunchNormalLoadRearN: round(dynamicFzRear, 1),
    longitudinalLoadTransferLaunchN: round(reportedDeltaFz, 2),
    loadTransferDirection: 'rearward',
    muLongitudinal: round(mu, 3),
    maxTractionForceLaunchN: round(maxTractionLaunchN, 2),
    frontAxleTractionCapacityN: round(frontAxleCapN, 1),
    rearAxleTractionCapacityN: round(rearAxleCapN, 1),
    engineLaunchWheelForceN: round(engineLaunchWheelForceN, 1),
    isTractionLimited,
    hasWheelspin: isTractionLimited,
    tractionUtilization: round(tractionUtilization, 3),
    launchAccelerationMps2: reportedLaunchAccelerationMps2,
    launchAccelerationG: round(reportedLaunchAccelerationMps2 / g, 3),
    tractionModeNotes: tractionNotes
  };
}

/**
 * Solves optimized drag gearing ratios with monotonic progression and active top gear matching strip length.
 */
export function calculateDragGearing(params: {
  car: DevCarInput;
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  gearCount: number;
  targetStripLengthM: number;
  targetTopSpeedKmh: number;
  powerCurve?: PowerCurvePoint[];
  drivetrainEfficiency: number;
}): DragGearingOutput {
  const circumference = calculateDragTireCircumferenceM(params.car, params.drivetrain);
  const tireRadiusM = circumference / (2 * Math.PI);
  const rpmAtPower = Math.max(3000, finiteOr(params.car.maxHpRpm, 7000));
  const gearCount = clamp(params.gearCount, 4, 10);

  // Active top gear optimization based on strip length & target speed
  // 1/8 mi (~200m): finish in lower gear or shorter top gear
  // 1/4 mi (~400m): finish in gear 4-5 of 6, or 6 of 8
  // 1/2 mi+ (~800m+): use full gear range to reach targetTopSpeed
  let topGearRatio: number;
  let activeTopGear = gearCount;

  if (params.targetStripLengthM <= 250) {
    // 1/8-mile setup
    topGearRatio = 1.15;
    activeTopGear = Math.min(gearCount, 4);
  } else if (params.targetStripLengthM <= 500) {
    // 1/4-mile setup
    topGearRatio = 0.95;
    activeTopGear = Math.min(gearCount, 5);
  } else if (params.targetStripLengthM <= 1000) {
    // 1/2-mile setup
    topGearRatio = 0.82;
    activeTopGear = gearCount;
  } else {
    // Unrestricted / Standing Mile
    topGearRatio = 0.72;
    activeTopGear = gearCount;
  }

  // Calculate final drive so that top active gear matches targetTopSpeed at peak HP RPM
  const finalDrive = clamp(
    (rpmAtPower * circumference * 60) / (params.targetTopSpeedKmh * 1000 * topGearRatio),
    2.20,
    6.00
  );

  // 1st gear ratio tailored for drag launch (speed around 85-110 km/h)
  const firstGearTargetKmh = params.drivetrain === 'AWD' ? 90 : params.drivetrain === 'FWD' ? 105 : 98;
  const firstGearRatio = clamp(
    (rpmAtPower * circumference * 60) / (firstGearTargetKmh * finalDrive * 1000),
    2.40,
    4.50
  );

  // Strictly monotonic progressive spacing: ratio_k = firstGear * (topGear / firstGear)^((k-1)/(N-1))
  const spacingStep = Math.pow(topGearRatio / firstGearRatio, 1 / (gearCount - 1));
  const rawGears: number[] = [];
  for (let i = 0; i < gearCount; i++) {
    const g = firstGearRatio * Math.pow(spacingStep, i);
    rawGears.push(round(g, 2));
  }

  // Ensure strict monotonic decreasing
  for (let i = 1; i < rawGears.length; i++) {
    if (rawGears[i] >= rawGears[i - 1]) {
      rawGears[i] = round(rawGears[i - 1] - 0.05, 2);
    }
  }

  // Compute gear speeds at peak HP RPM
  const gearSpeedsKmh = rawGears.map((ratio) =>
    round((rpmAtPower * circumference * 60) / (ratio * finalDrive * 1000), 1)
  );

  const topSpeedAtPeakHpKmh = gearSpeedsKmh[gearCount - 1];

  // Shift advice calculation
  const shiftAdvice: DragGearShiftAdvice[] = [];
  const maxRpm = Math.max(rpmAtPower + 500, finiteOr(params.car.maxHpRpm, 7000) + 500);

  for (let i = 0; i < gearCount - 1; i++) {
    const fromG = i + 1;
    const toG = i + 2;
    const r1 = rawGears[i];
    const r2 = rawGears[i + 1];

    if (params.powerCurve && params.powerCurve.length > 2) {
      // Find wheel force crossover point if present
      let crossoverRpm: number | undefined;
      for (let testRpm = rpmAtPower - 500; testRpm <= maxRpm; testRpm += 50) {
        const postRpm = testRpm * (r2 / r1);
        const t1 = estimateEngineTorqueNm(testRpm, params.car, params.powerCurve);
        const t2 = estimateEngineTorqueNm(postRpm, params.car, params.powerCurve);
        const f1 = (t1 * r1 * finalDrive) / tireRadiusM;
        const f2 = (t2 * r2 * finalDrive) / tireRadiusM;
        if (f2 >= f1) {
          crossoverRpm = testRpm;
          break;
        }
      }
      if (crossoverRpm) {
        const postShiftRpm = round(crossoverRpm * (r2 / r1));
        const shiftSpeed = round((crossoverRpm * circumference * 60) / (r1 * finalDrive * 1000), 1);
        shiftAdvice.push({
          fromGear: fromG,
          toGear: toG,
          shiftRpm: crossoverRpm,
          postShiftRpm,
          shiftSpeedKmh: shiftSpeed,
          reason: 'wheel_force_crossover'
        });
        continue;
      }
    }

    // Default / Redline optimal shift advice
    const shiftRpm = Math.round(rpmAtPower + 300);
    const postShiftRpm = Math.round(shiftRpm * (r2 / r1));
    const shiftSpeedKmh = round((shiftRpm * circumference * 60) / (r1 * finalDrive * 1000), 1);

    shiftAdvice.push({
      fromGear: fromG,
      toGear: toG,
      shiftRpm,
      postShiftRpm,
      shiftSpeedKmh,
      reason: params.powerCurve ? 'redline_optimal' : 'estimated_peak_hp_prior'
    });
  }

  return {
    gearingStrategy: 'drag_strip_optimized_spacing',
    finalDrive: round(finalDrive, 2),
    gears: rawGears,
    gearCount,
    activeTopGear,
    activeTopGearRatio: rawGears[activeTopGear - 1],
    tireCircumferenceM: round(circumference, 3),
    tireRadiusM: round(tireRadiusM, 3),
    topSpeedAtPeakHpKmh,
    gearSpeedsKmh,
    shiftAdvice,
    spacingRatio: round(spacingStep, 3)
  };
}

/**
 * Forward numerical integration of drag launch and strip distance with milestone interpolation.
 */
export function simulateDragDistance(params: {
  massKg: number;
  weightDistributionFrontPct: number;
  wheelbaseM: number;
  cgHeightM: number;
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  gearing: DragGearingOutput;
  car: DevCarInput;
  powerCurve?: PowerCurvePoint[];
  targetStripLengthM: number;
  muLongitudinal: number;
  CdA: number;
  Crr: number;
  airDensity: number;
  drivetrainEfficiency: number;
  gravityMPerS2: number;
  launchRpm: number;
  awdFrontSplitPct: number;
  dtSeconds?: number;
}): DragDistanceSimulation {
  const dt = params.dtSeconds ?? 0.005;
  const maxSteps = 50000; // max 250 seconds safety bound
  const g = params.gravityMPerS2;
  const m = params.massKg;
  const r = params.gearing.tireRadiusM;
  const FD = params.gearing.finalDrive;
  const gears = params.gearing.gears;
  const gearCount = params.gearing.gearCount;
  const shiftAdvice = params.gearing.shiftAdvice;
  const mu = params.muLongitudinal;
  const CdA = params.CdA;
  const Crr = params.Crr;
  const rho = params.airDensity;
  const eta = params.drivetrainEfficiency;
  const L = params.wheelbaseM;
  const hCG = params.cgHeightM;
  const Wf = params.weightDistributionFrontPct / 100;
  const targetDist = params.targetStripLengthM;

  // Milestone targets
  const milestones: { label: string; distM: number; metric: DragMilestoneMetric }[] = [
    { label: '60-foot (18.29m)', distM: 18.288, metric: { label: '60-ft', distanceM: 18.288, timeSeconds: 0, speedKmh: 0, speedMps: 0, gear: 1, rpm: 0, reached: false } },
    { label: '100-meter', distM: 100.0, metric: { label: '100-m', distanceM: 100.0, timeSeconds: 0, speedKmh: 0, speedMps: 0, gear: 1, rpm: 0, reached: false } },
    { label: '1/8-mile (201.17m)', distM: 201.168, metric: { label: '1/8-mile', distanceM: 201.168, timeSeconds: 0, speedKmh: 0, speedMps: 0, gear: 1, rpm: 0, reached: false } },
    { label: '1/4-mile (402.34m)', distM: 402.336, metric: { label: '1/4-mile', distanceM: 402.336, timeSeconds: 0, speedKmh: 0, speedMps: 0, gear: 1, rpm: 0, reached: false } },
    { label: 'Target Strip Length', distM: targetDist, metric: { label: 'Finish', distanceM: targetDist, timeSeconds: 0, speedKmh: 0, speedMps: 0, gear: 1, rpm: 0, reached: false } }
  ];

  let t = 0;
  let x = 0;
  let v = 0; // m/s
  let currentGearIdx = 0; // 0-indexed (gear 1)
  let wheelspinDurationSeconds = 0;
  let shiftCooldown = 0;

  const staticFzTotal = m * g;
  const staticFzFront = staticFzTotal * Wf;
  const staticFzRear = staticFzTotal * (1 - Wf);

  let zeroToHundredTime: number | undefined;
  let zeroToTwoHundredTime: number | undefined;

  for (let step = 0; step < maxSteps; step++) {
    const prevT = t;
    const prevX = x;
    const prevV = v;

    const currentGearRatio = gears[currentGearIdx];

    // Compute wheel rotational speed and engine RPM
    const wheelOmega = v / r;
    const wheelRpm = (wheelOmega * 60) / (2 * Math.PI);
    let engineRpm = wheelRpm * currentGearRatio * FD;

    // Launch clutch slip: holds RPM at launchRpm when wheel RPM is low in 1st gear
    if (currentGearIdx === 0 && engineRpm < params.launchRpm) {
      engineRpm = params.launchRpm;
    }

    // Check shift advice
    if (shiftCooldown <= 0 && currentGearIdx < gearCount - 1) {
      const advice = shiftAdvice[currentGearIdx];
      const targetShiftRpm = advice?.shiftRpm ?? (params.car.maxHpRpm ? params.car.maxHpRpm + 300 : 7200);
      if (engineRpm >= targetShiftRpm) {
        currentGearIdx++;
        shiftCooldown = 0.05; // 50ms simulated power shift duration
        continue;
      }
    } else if (shiftCooldown > 0) {
      shiftCooldown -= dt;
    }

    // Torque & Wheel force
    const torqueNm = estimateEngineTorqueNm(engineRpm, params.car, params.powerCurve);
    const engineWheelForceN = (eta * torqueNm * currentGearRatio * FD) / r;

    // Resistances
    const fDrag = 0.5 * rho * CdA * v * v;
    const fRoll = Crr * m * g;
    const fResist = fDrag + fRoll;

    // Dynamic load transfer & traction limit
    // Solve quasi-static Fx_max
    let fTractionMaxN = 0;
    if (params.drivetrain === 'RWD') {
      const aEst = Math.max(0, (engineWheelForceN - fResist) / m);
      const deltaFz = (m * aEst * hCG) / L;
      const fzRearDyn = Math.min(staticFzTotal, staticFzRear + deltaFz);
      fTractionMaxN = mu * fzRearDyn;
    } else if (params.drivetrain === 'FWD') {
      const aEst = Math.max(0, (engineWheelForceN - fResist) / m);
      const deltaFz = (m * aEst * hCG) / L;
      const fzFrontDyn = Math.max(0, staticFzFront - deltaFz);
      fTractionMaxN = mu * fzFrontDyn;
    } else {
      fTractionMaxN = mu * staticFzTotal;
    }

    const isWheelspin = engineWheelForceN > fTractionMaxN;
    if (isWheelspin) {
      wheelspinDurationSeconds += dt;
    }

    const tractiveForceN = Math.min(engineWheelForceN, fTractionMaxN);
    const fNet = Math.max(0, tractiveForceN - fResist);
    const a = fNet / m;

    // Euler-Cromer integration step
    v = v + a * dt;
    x = x + v * dt;
    t = t + dt;

    // Milestone speed checks
    if (!zeroToHundredTime && v >= 27.7778) {
      // 100 km/h = 27.7778 m/s
      const ratio = (27.7778 - prevV) / Math.max(0.001, v - prevV);
      zeroToHundredTime = round(prevT + ratio * dt, 3);
    }
    if (!zeroToTwoHundredTime && v >= 55.5556) {
      // 200 km/h = 55.5556 m/s
      const ratio = (55.5556 - prevV) / Math.max(0.001, v - prevV);
      zeroToTwoHundredTime = round(prevT + ratio * dt, 3);
    }

    // Milestone distance checks
    for (const ms of milestones) {
      if (!ms.metric.reached && x >= ms.distM) {
        const ratio = (ms.distM - prevX) / Math.max(0.001, x - prevX);
        const exactT = prevT + ratio * dt;
        const exactV = prevV + ratio * (v - prevV);
        ms.metric.timeSeconds = round(exactT, 3);
        ms.metric.speedMps = round(exactV, 2);
        ms.metric.speedKmh = round(exactV * 3.6, 1);
        ms.metric.gear = currentGearIdx + 1;
        ms.metric.rpm = Math.round(engineRpm);
        ms.metric.reached = true;
      }
    }

    if (x >= targetDist) {
      break;
    }
  }

  // Finish metric fallback if simulation ended
  const finishMs = milestones.find((m) => m.label === 'Target Strip Length');
  const stripTimeSeconds = finishMs?.metric.reached ? finishMs.metric.timeSeconds : round(t, 3);
  const terminalSpeedKmh = finishMs?.metric.reached ? finishMs.metric.speedKmh : round(v * 3.6, 1);
  const terminalSpeedMps = finishMs?.metric.reached ? finishMs.metric.speedMps : round(v, 2);

  const sixtyFoot = milestones.find((m) => m.metric.label === '60-ft')?.metric;
  const hundredMeter = milestones.find((m) => m.metric.label === '100-m')?.metric;
  const eighthMile = milestones.find((m) => m.metric.label === '1/8-mile')?.metric;
  const quarterMile = milestones.find((m) => m.metric.label === '1/4-mile')?.metric;

  return {
    status: 'estimated',
    simulated: true,
    integrationDtSeconds: dt,
    targetStripLengthM: round(targetDist, 2),
    stripTimeSeconds,
    terminalSpeedKmh,
    terminalSpeedMps,
    sixtyFootTimeSeconds: sixtyFoot?.timeSeconds ?? 0,
    sixtyFootSpeedKmh: sixtyFoot?.speedKmh ?? 0,
    hundredMeterTimeSeconds: hundredMeter?.timeSeconds ?? 0,
    hundredMeterSpeedKmh: hundredMeter?.speedKmh ?? 0,
    eighthMileTimeSeconds: eighthMile?.timeSeconds ?? 0,
    eighthMileSpeedKmh: eighthMile?.speedKmh ?? 0,
    quarterMileTimeSeconds: quarterMile?.timeSeconds ?? 0,
    quarterMileSpeedKmh: quarterMile?.speedKmh ?? 0,
    zeroToHundredKmhTimeSeconds: zeroToHundredTime,
    zeroToTwoHundredKmhTimeSeconds: zeroToTwoHundredTime,
    wheelspinDurationSeconds: round(wheelspinDurationSeconds, 3),
    milestones: milestones.map((m) => m.metric),
    notes: `Simulated via quasi-static load transfer and torque-limited forward integration (dt = ${dt}s).`
  };
}

/**
 * Computes drag chassis targets: soft front ARB, stiff rear ARB, drag differential spool, launch suspension.
 */
export function calculateDragChassis(car: DevCarInput, drivetrain: 'FWD' | 'RWD' | 'AWD'): DragChassisTargets {
  const Wf = finiteOr(car.weight_distribution, 50) / 100;
  const mass = finiteOr(car.weight, 1500);

  // Drag suspension: soft rear springs to absorb squat, moderate front
  const frontFreqHz = 1.8;
  const rearFreqHz = 1.6;

  const frontSprNPerM = mass * Wf * Math.pow(2 * Math.PI * frontFreqHz, 2) / 2;
  const rearSprNPerM = mass * (1 - Wf) * Math.pow(2 * Math.PI * rearFreqHz, 2) / 2;

  const frontKgfMm = round((frontSprNPerM / 9.80665) / 1000, 1);
  const rearKgfMm = round((rearSprNPerM / 9.80665) / 1000, 1);

  const frontRideHeightCm = round(finiteOr(car.height_front_min, 12) + 2.0, 1);
  const rearRideHeightCm = round(finiteOr(car.height_rear_min, 12) + 0.5, 1); // low rear rake for launch squat

  // Damping: low rear bump for squat, stiff front rebound to prevent bounce
  const frontCrit = 2 * Math.sqrt(frontSprNPerM * (mass * Wf / 2));
  const rearCrit = 2 * Math.sqrt(rearSprNPerM * (mass * (1 - Wf) / 2));

  const frontReboundNsM = round(frontCrit * 0.75, 0);
  const frontBumpNsM = round(frontCrit * 0.40, 0);
  const rearReboundNsM = round(rearCrit * 0.65, 0);
  const rearBumpNsM = round(rearCrit * 0.35, 0);

  // ARB: Soft front (1.0-5.0) for independent front lift, stiff rear (50-65) to eliminate body roll twist
  const arbFront = 2.0;
  const arbRear = 58.0;

  // Differential
  const diff = calculateDragDifferential(car, drivetrain);

  return {
    springs: {
      modelType: 'direct_wheel_load_approx',
      frontKgfMm,
      rearKgfMm,
      frontRideHeightCm,
      rearRideHeightCm,
      targetFrequencyFrontHz: frontFreqHz,
      targetFrequencyRearHz: rearFreqHz,
      notes: 'Soft rear spring rate promotes longitudinal squat and load transfer onto drive axle.'
    },
    damping: {
      frontCriticalNsM: round(frontCrit, 0),
      rearCriticalNsM: round(rearCrit, 0),
      frontReboundNsM,
      rearReboundNsM,
      frontBumpNsM,
      rearBumpNsM,
      frontSlider: 11.5,
      rearSlider: 8.5,
      bumpToReboundRatio: 0.55,
      frontDampingRatio: 0.75,
      rearDampingRatio: 0.65,
      notes: 'Asymmetric damping: soft rear bump facilitates squat, stiff front rebound prevents porpoising.'
    },
    arb: {
      front: arbFront,
      rear: arbRear,
      rollStiffnessFrontPct: round((arbFront / (arbFront + arbRear)) * 100, 1),
      mode: 'drag_launch_anti_roll_stiff_rear',
      notes: 'Extremely soft front ARB enables independent weight transfer; stiff rear ARB counteracts driveshaft torque twist.'
    },
    differential: diff
  };
}

/**
 * Computes drag differential settings (100% accel lock / spool for maximum traction).
 */
export function calculateDragDifferential(
  car: DevCarInput,
  drivetrain: 'FWD' | 'RWD' | 'AWD'
): DragDifferentialTarget {
  void car;
  if (drivetrain === 'FWD') {
    return {
      strategy: 'drag_spool_high_lock_prior',
      frontAccelPercent: 100,
      frontDecelPercent: 0,
      rearAccelPercent: 0,
      rearDecelPercent: 0,
      centerToRearPercent: 0,
      notes: '100% front acceleration lock prevents single-wheel spin on launch; 0% decel for straight tracking.'
    };
  } else if (drivetrain === 'RWD') {
    return {
      strategy: 'drag_spool_high_lock_prior',
      frontAccelPercent: 0,
      frontDecelPercent: 0,
      rearAccelPercent: 100,
      rearDecelPercent: 10,
      centerToRearPercent: 100,
      notes: '100% rear accel lock acts as spool for simultaneous dual-tire traction launch.'
    };
  } else {
    // AWD
    return {
      strategy: 'drag_spool_high_lock_prior',
      frontAccelPercent: 100,
      frontDecelPercent: 0,
      rearAccelPercent: 100,
      rearDecelPercent: 0,
      centerToRearPercent: 75,
      notes: '100% front/rear lock with 75% rear center bias to align with longitudinal launch weight transfer.'
    };
  }
}

/**
 * Computes drag tire alignment and pressure targets.
 */
export function calculateDragTires(
  car: DevCarInput,
  surface: DevSurface | string,
  tireType: string,
  massKg: number,
  weightDistributionFrontPct: number
): DragTireTargets {
  void car;
  const compound = tireType && DEV_TIRE_PRIORS[tireType] ? tireType : 'Drag';
  const baseTire = DEV_TIRE_PRIORS[compound] ?? DEV_TIRE_PRIORS.Drag;
  const surfKey = surface in DEV_SURFACE_MULTIPLIERS ? (surface as DevSurface) : 'dragStrip';
  const surfFactor = DEV_SURFACE_MULTIPLIERS[surfKey];

  const muLongitudinal = round(baseTire.muLongitudinal * surfFactor.muLongitudinal, 3);
  const muLateral = round(baseTire.muLateral * surfFactor.muLateral, 3);

  const alignPrior = DEV_ALIGNMENT_PROFILES.Drag;

  const alignment: DragAlignmentTarget = {
    frontCamberDeg: alignPrior.frontCamber,
    rearCamberDeg: alignPrior.rearCamber,
    frontToeDeg: alignPrior.frontToe,
    rearToeDeg: alignPrior.rearToe,
    casterDeg: alignPrior.caster,
    notes: 'Zero camber and toe ensure perpendicular flat tire contact patch for maximum straight-line contact.'
  };

  const pressures: DragPressureTarget = {
    coldFrontPsi: 38.0,
    coldRearPsi: 21.0,
    targetHotFrontPsi: 40.0,
    targetHotRearPsi: 23.5,
    notes: 'Low rear pressure (21-23 PSI) maximizes launch contact patch; high front pressure minimizes rolling resistance.'
  };

  const Wf = weightDistributionFrontPct / 100;
  const fzTotal = massKg * DEFAULT_GRAVITY;
  const frontPerTire = (fzTotal * Wf * muLongitudinal) / 2;
  const rearPerTire = (fzTotal * (1 - Wf) * muLongitudinal) / 2;

  return {
    compound,
    surface: surfKey,
    alignment,
    pressures,
    muLongitudinal,
    muLateral,
    frictionCapacityN: {
      frontPerTireN: round(frontPerTire, 1),
      rearPerTireN: round(rearPerTire, 1),
      totalLaunchN: round(frontPerTire * 2 + rearPerTire * 2, 1)
    }
  };
}

/**
 * Main Drag Profile Solver (Phase 5D).
 *
 * Implements typed `tuning-profile/v1` schema with:
 * - Pure physics solvers for longitudinal load transfer and drive-axle traction limits
 * - Dynamic strip gearing matching target length & power curve without hardcoding 4th gear 1.00
 * - Numerical distance integration with 60ft, 100m, 1/8mi, 1/4mi milestones
 * - Drag chassis and tire targets
 * - Clear distinction of empirical-prior / estimated / simulated status
 */
export function calculateDragProfile(input: DragProfileInput): DragProfileOutput {
  const { warnings, assumptions, sanitized } = validateDragProfileInput(input);

  // 1. Gearing optimization
  const gearing = calculateDragGearing({
    car: sanitized.car,
    drivetrain: sanitized.drivetrain,
    gearCount: sanitized.gearCount,
    targetStripLengthM: sanitized.targetStripLengthM,
    targetTopSpeedKmh: sanitized.targetTopSpeedKmh,
    powerCurve: sanitized.powerCurve,
    drivetrainEfficiency: sanitized.drivetrainEfficiency
  });

  // 2. Tire & Grip model
  const tires = calculateDragTires(
    sanitized.car,
    sanitized.surface,
    sanitized.tireType,
    sanitized.massKg,
    sanitized.weightDistributionFrontPct
  );

  // 3. Engine launch torque & first gear force
  const launchTorqueNm = estimateEngineTorqueNm(sanitized.launchRpm, sanitized.car, sanitized.powerCurve);

  // 4. Launch traction & longitudinal load transfer
  const launchTraction = calculateDragTractionAndLoadTransfer({
    massKg: sanitized.massKg,
    weightDistributionFrontPct: sanitized.weightDistributionFrontPct,
    wheelbaseM: sanitized.wheelbaseM,
    cgHeightM: sanitized.cgHeightM,
    drivetrain: sanitized.drivetrain,
    muLongitudinal: tires.muLongitudinal,
    engineLaunchTorqueNm: launchTorqueNm,
    firstGearRatio: gearing.gears[0],
    finalDriveRatio: gearing.finalDrive,
    tireRadiusM: gearing.tireRadiusM,
    drivetrainEfficiency: sanitized.drivetrainEfficiency,
    gravityMPerS2: sanitized.gravityMPerS2,
    awdFrontSplitPct: sanitized.awdFrontSplitPct
  });

  // 5. Distance & terminal speed simulation
  const simulation = simulateDragDistance({
    massKg: sanitized.massKg,
    weightDistributionFrontPct: sanitized.weightDistributionFrontPct,
    wheelbaseM: sanitized.wheelbaseM,
    cgHeightM: sanitized.cgHeightM,
    drivetrain: sanitized.drivetrain,
    gearing,
    car: sanitized.car,
    powerCurve: sanitized.powerCurve,
    targetStripLengthM: sanitized.targetStripLengthM,
    muLongitudinal: tires.muLongitudinal,
    CdA: sanitized.CdA,
    Crr: sanitized.Crr,
    airDensity: sanitized.airDensity,
    drivetrainEfficiency: sanitized.drivetrainEfficiency,
    gravityMPerS2: sanitized.gravityMPerS2,
    launchRpm: sanitized.launchRpm,
    awdFrontSplitPct: sanitized.awdFrontSplitPct
  });

  // 6. Drag chassis targets
  const chassis = calculateDragChassis(sanitized.car, sanitized.drivetrain);

  return {
    schemaVersion: 'tuning-profile/v1',
    profile: sanitized.profile,
    status: 'estimated',
    source: 'estimated',
    targetStripLengthM: sanitized.targetStripLengthM,
    targetTopSpeedKmh: sanitized.targetTopSpeedKmh,
    launchTraction,
    gearing,
    simulation,
    chassis,
    tires,
    warnings,
    assumptions
  };
}
