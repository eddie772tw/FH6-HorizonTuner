/**
 * Road/Circuit Profile Solver (Phase 5A)
 *
 * Implements typed `tuning-profile/v1` schema supporting:
 * - Profiles: `technical`, `balanced`, `high_speed`
 * - Gearing: Tire circumference, wheel speed, target top speed at peak HP, monotonic ratio progression
 * - Power Curve Shift Advice: Post-shift wheel force crossover or advisory prior with explicit warning
 * - AWD Circuit Rotation: Explicit 1/65 ARB empirical prior (not universal formula)
 * - Chassis & Tires: Natural frequencies, critical damping, camber, toe, pressures
 * - Optional Bicycle Model Cornering Advisory: Steady-state lateral force, yaw moment balance, steer angle
 * - Strict Input Validation: Finite numbers, bounds, monotonic ratios, zero-division protection
 */

import {
  DEV_ALIGNMENT_PROFILES,
  DEV_SURFACE_MULTIPLIERS,
  DEV_TIRE_PRIORS,
  DEV_CHASSIS_PROFILES
} from '../constants';
import type { DevCarInput, DevSurface } from '../../../utils/tuningMath_dev';

export type RoadProfileType = 'technical' | 'balanced' | 'high_speed';
export type TuningProfileStatus = 'empirical-prior' | 'estimated' | 'calibrated';

export interface RoadProfileAeroState {
  frontDownforceLevel?: 'stock' | 'low' | 'medium' | 'high' | 'race';
  rearDownforceLevel?: 'stock' | 'low' | 'medium' | 'high' | 'race';
  frontDownforceKg?: number;
  rearDownforceKg?: number;
  frontDownforceN?: number;
  rearDownforceN?: number;
  installedFrontWing?: boolean;
  installedRearWing?: boolean;
}

export interface PowerCurvePoint {
  rpm: number;
  torqueNm?: number;
  powerHp?: number;
  powerKw?: number;
}

export interface RoadCorneringGeometryInput {
  cornerRadiusM: number;
  cornerSpeedKmh?: number;
  wheelbaseM?: number;
  frontWeightRatio?: number;
  tireGripMu?: number;
  frontCorneringStiffnessNPerRad?: number;
  rearCorneringStiffnessNPerRad?: number;
}

export interface RoadProfileInput {
  profile: RoadProfileType;
  targetTopSpeedKmh: number;
  slowestCornerSpeedKmh?: number;
  straightRatio: number; // [0, 1]
  surface: DevSurface | string;
  aeroState?: RoadProfileAeroState;
  powerCurve?: PowerCurvePoint[];
  awdCircuitRotationPrior?: boolean;
  corneringGeometry?: RoadCorneringGeometryInput;
  car: DevCarInput;
  gearCount?: number;
}

export interface RoadGearShiftAdvice {
  fromGear: number;
  toGear: number;
  shiftRpm: number;
  postShiftRpm: number;
  postShiftForceN?: number;
  shiftSpeedKmh: number;
  reason: 'wheel_force_crossover' | 'redline_optimal' | 'estimated_peak_hp_prior';
}

export interface RoadGearingOutput {
  finalDrive: number;
  gears: number[];
  gearCount: number;
  tireCircumferenceM: number;
  topSpeedAtPeakHpKmh: number;
  gearSpeedsKmh: number[];
  shiftAdvice: RoadGearShiftAdvice[];
  spacingRatio: number;
}

export interface RoadSpringsTarget {
  modelType: 'direct_wheel_load_approx';
  frontKgfMm: number;
  rearKgfMm: number;
  frontRideHeightCm: number;
  rearRideHeightCm: number;
  targetFrequencyFrontHz: number;
  targetFrequencyRearHz: number;
}

export interface RoadDampingTarget {
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
}

export interface RoadArbTarget {
  front: number;
  rear: number;
  mode: 'standard' | 'circuit_rotation_1_65';
}

export interface RoadDifferentialTarget {
  frontAccelPercent: number;
  frontDecelPercent: number;
  rearAccelPercent: number;
  rearDecelPercent: number;
  centerToRearPercent: number;
}

export interface RoadChassisTargets {
  springs: RoadSpringsTarget;
  damping: RoadDampingTarget;
  arb: RoadArbTarget;
  differential: RoadDifferentialTarget;
}

export interface RoadTireTargets {
  compound: string;
  surface: DevSurface | string;
  coldPressureFrontPsi: number;
  coldPressureRearPsi: number;
  targetHotPressurePsi: number;
  camberFrontDeg: number;
  camberRearDeg: number;
  toeFrontDeg: number;
  toeRearDeg: number;
  casterDeg: number;
  muLongitudinal: number;
  muLateral: number;
}

export interface RoadCorneringAdvisory {
  model: 'linear_bicycle_model_estimated';
  status: 'estimated';
  cornerRadiusM: number;
  maxCornerSpeedKmh: number;
  evaluatedSpeedKmh: number;
  totalLateralForceN: number;
  frontLateralForceN: number;
  rearLateralForceN: number;
  frontSlipAngleDeg: number;
  rearSlipAngleDeg: number;
  steerAngleDeg: number;
  ackermannSteerAngleDeg: number;
  understeerGradientDeg: number;
  balance: 'understeer' | 'neutral' | 'oversteer';
}

export interface RoadProfileOutput {
  schemaVersion: 'tuning-profile/v1';
  profile: RoadProfileType;
  source: TuningProfileStatus;
  status: TuningProfileStatus;
  gearing: RoadGearingOutput;
  chassis: RoadChassisTargets;
  tireTargets: RoadTireTargets;
  corneringAdvisory?: RoadCorneringAdvisory;
  warnings: string[];
}

// -----------------------------------------------------------------------------
// Math & Helper Utilities
// -----------------------------------------------------------------------------

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
 * Calculates tire rolling circumference in metres.
 * Formula: C = pi * (rimDiameterM + 2 * sidewallHeightM)
 * where rimDiameterM = rimInches * 0.0254, sidewallHeightM = (widthMm / 1000) * (aspectRatio / 100).
 */
export function calculateRoadTireCircumferenceM(car: DevCarInput): number {
  const isFwd = car.drivetrain === 'FWD';
  const widthMm = finiteOr(isFwd ? car.frontTireWidth : car.rearTireWidth, 245);
  const aspect = finiteOr(isFwd ? car.frontTireAspect : car.rearTireAspect, 40);
  const rimInches = finiteOr(isFwd ? car.frontTireRim : car.rearTireRim, 18);

  const rimDiameterM = rimInches * 0.0254;
  const sidewallM = (widthMm / 1000) * (aspect / 100);
  const outerDiameterM = rimDiameterM + 2 * sidewallM;
  return Math.PI * outerDiameterM;
}

/**
 * Validates road profile input for finite values, positive domains, and bounds.
 */
export function validateRoadProfileInput(input: RoadProfileInput): string[] {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return ['Input must be a valid object.'];
  }

  const validProfiles: RoadProfileType[] = ['technical', 'balanced', 'high_speed'];
  if (!validProfiles.includes(input.profile)) {
    errors.push(`Invalid profile: '${input.profile}'. Must be one of: ${validProfiles.join(', ')}.`);
  }

  if (!Number.isFinite(input.targetTopSpeedKmh) || input.targetTopSpeedKmh <= 0) {
    errors.push('targetTopSpeedKmh must be a positive finite number.');
  } else if (input.targetTopSpeedKmh < 50 || input.targetTopSpeedKmh > 550) {
    errors.push(`targetTopSpeedKmh (${input.targetTopSpeedKmh}) is out of reasonable range [50, 550] km/h.`);
  }

  if (input.slowestCornerSpeedKmh !== undefined) {
    if (!Number.isFinite(input.slowestCornerSpeedKmh) || input.slowestCornerSpeedKmh <= 0) {
      errors.push('slowestCornerSpeedKmh must be a positive finite number when specified.');
    } else if (input.slowestCornerSpeedKmh >= input.targetTopSpeedKmh) {
      errors.push(
        `slowestCornerSpeedKmh (${input.slowestCornerSpeedKmh}) must be less than targetTopSpeedKmh (${input.targetTopSpeedKmh}).`
      );
    }
  }

  if (!Number.isFinite(input.straightRatio) || input.straightRatio < 0 || input.straightRatio > 1) {
    errors.push(`straightRatio (${input.straightRatio}) must be a finite number between 0.0 and 1.0.`);
  }

  if (!input.car || typeof input.car !== 'object') {
    errors.push('car object is required.');
    return errors;
  }

  if (!Number.isFinite(input.car.weight) || input.car.weight <= 0) {
    errors.push('car.weight must be a positive finite number.');
  }

  if (!Number.isFinite(input.car.weight_distribution) || input.car.weight_distribution <= 0 || input.car.weight_distribution >= 100) {
    errors.push('car.weight_distribution must be between 0 and 100.');
  }

  const validDrivetrains = ['FWD', 'RWD', 'AWD'];
  if (!validDrivetrains.includes(input.car.drivetrain)) {
    errors.push(`car.drivetrain must be one of: ${validDrivetrains.join(', ')}.`);
  }

  if (!Number.isFinite(input.car.maxHp) || input.car.maxHp <= 0) {
    errors.push('car.maxHp must be a positive finite number.');
  }

  if (!Number.isFinite(input.car.maxHpRpm) || input.car.maxHpRpm <= 0) {
    errors.push('car.maxHpRpm must be a positive finite number.');
  }

  if (!Number.isFinite(input.car.maxTorqueRpm) || input.car.maxTorqueRpm <= 0) {
    errors.push('car.maxTorqueRpm must be a positive finite number.');
  }

  const gearCount = input.gearCount ?? input.car.adjustability?.gears ?? 6;
  if (!Number.isFinite(gearCount) || !Number.isInteger(gearCount) || gearCount < 4 || gearCount > 10) {
    errors.push(`gearCount (${gearCount}) must be an integer between 4 and 10.`);
  }

  if (input.corneringGeometry) {
    const geom = input.corneringGeometry;
    if (!Number.isFinite(geom.cornerRadiusM) || geom.cornerRadiusM <= 0) {
      errors.push('corneringGeometry.cornerRadiusM must be a positive finite number.');
    }
    if (geom.cornerSpeedKmh !== undefined && (!Number.isFinite(geom.cornerSpeedKmh) || geom.cornerSpeedKmh <= 0)) {
      errors.push('corneringGeometry.cornerSpeedKmh must be a positive finite number when specified.');
    }
    if (geom.wheelbaseM !== undefined && (!Number.isFinite(geom.wheelbaseM) || geom.wheelbaseM <= 0)) {
      errors.push('corneringGeometry.wheelbaseM must be a positive finite number when specified.');
    }
    if (geom.tireGripMu !== undefined && (!Number.isFinite(geom.tireGripMu) || geom.tireGripMu <= 0)) {
      errors.push('corneringGeometry.tireGripMu must be a positive finite number when specified.');
    }
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Gearing & Shift Force Solver
// -----------------------------------------------------------------------------

/**
 * Interpolates engine torque in N*m from a given power curve at a specific RPM.
 */
function interpolateTorqueNm(powerCurve: PowerCurvePoint[], rpm: number): number {
  if (powerCurve.length === 0) return 0;

  const normalized = powerCurve
    .map((p) => {
      let torque = p.torqueNm;
      if (torque === undefined) {
        if (p.powerKw !== undefined && p.rpm > 0) {
          torque = (p.powerKw * 1000 * 60) / (2 * Math.PI * p.rpm);
        } else if (p.powerHp !== undefined && p.rpm > 0) {
          torque = (p.powerHp * 745.699872 * 60) / (2 * Math.PI * p.rpm);
        }
      }
      return { rpm: p.rpm, torqueNm: torque ?? 0 };
    })
    .filter((p) => Number.isFinite(p.rpm) && p.rpm > 0 && Number.isFinite(p.torqueNm) && p.torqueNm >= 0)
    .sort((a, b) => a.rpm - b.rpm);

  if (normalized.length === 0) return 0;
  if (rpm <= normalized[0].rpm) return normalized[0].torqueNm;
  if (rpm >= normalized[normalized.length - 1].rpm) return normalized[normalized.length - 1].torqueNm;

  for (let i = 0; i < normalized.length - 1; i++) {
    const p1 = normalized[i];
    const p2 = normalized[i + 1];
    if (rpm >= p1.rpm && rpm <= p2.rpm) {
      const span = p2.rpm - p1.rpm;
      if (span <= 0) return p1.torqueNm;
      const t = (rpm - p1.rpm) / span;
      return p1.torqueNm + t * (p2.torqueNm - p1.torqueNm);
    }
  }

  return normalized[normalized.length - 1].torqueNm;
}

function solveRoadGearing(input: RoadProfileInput, tireCircumferenceM: number): { gearing: RoadGearingOutput; warnings: string[] } {
  const warnings: string[] = [];
  const car = input.car;
  const rpmAtPower = Math.max(3000, finiteOr(car.maxHpRpm, 7500));
  const targetTopSpeedKmh = input.targetTopSpeedKmh;
  const gearCount = clamp(Math.round(input.gearCount ?? car.adjustability?.gears ?? 6), 4, 10);
  const straightRatio = clamp(input.straightRatio, 0, 1);

  // Top gear ratio selection based on profile and straight ratio
  let baseTopGear = 0.78;
  if (input.profile === 'technical') {
    baseTopGear = 0.86 - 0.04 * straightRatio;
  } else if (input.profile === 'high_speed') {
    baseTopGear = 0.73 - 0.05 * straightRatio;
  } else {
    baseTopGear = 0.80 - 0.04 * straightRatio;
  }
  const topGear = round(clamp(baseTopGear, 0.65, 0.95), 2);

  // Target Final Drive calculation: target FD = (rpmTarget * C * 60) / (vTarget * 1000 * topGear)
  // vTarget in km/h -> vTarget in m/s is (vTarget / 3.6), so rpm * C / (60 * (v/3.6) * topGear) = rpm * C * 60 / (v * 1000 * topGear)
  const targetFinalDriveRaw = (rpmAtPower * tireCircumferenceM * 60) / (targetTopSpeedKmh * 1000 * topGear);
  const finalDrive = round(clamp(targetFinalDriveRaw, 2.0, 6.5), 2);

  // First gear exit speed target
  let firstGearSpeedTargetKmh = 90;
  if (input.slowestCornerSpeedKmh !== undefined && input.slowestCornerSpeedKmh > 0) {
    firstGearSpeedTargetKmh = clamp(input.slowestCornerSpeedKmh * 1.12, 50, 120);
  } else if (input.profile === 'technical') {
    firstGearSpeedTargetKmh = 72;
  } else if (input.profile === 'high_speed') {
    firstGearSpeedTargetKmh = 105;
  } else {
    firstGearSpeedTargetKmh = 88;
  }

  // Calculate 1st gear ratio from first gear target speed
  const rawFirstGear = (rpmAtPower * tireCircumferenceM * 60) / (firstGearSpeedTargetKmh * finalDrive * 1000);
  const firstGear = round(clamp(rawFirstGear, Math.max(2.4, topGear + 1.2), 4.8), 2);

  // Progressive geometric ratio spacing (guarantees strictly positive monotonic decreasing ratios)
  const spacingStep = Math.pow(firstGear / topGear, 1 / (gearCount - 1));
  const rawGears = Array.from({ length: gearCount }, (_, index) => firstGear / Math.pow(spacingStep, index));

  // Ensure strict monotonicity after rounding
  const gears: number[] = [];
  for (let i = 0; i < rawGears.length; i++) {
    const rounded = round(rawGears[i], 2);
    if (i > 0 && rounded >= gears[i - 1]) {
      gears.push(round(gears[i - 1] - 0.05, 2));
    } else {
      gears.push(rounded);
    }
  }

  // Speeds in each gear at peak power RPM (km/h)
  const gearSpeedsKmh = gears.map((g) => round((rpmAtPower * tireCircumferenceM * 60) / (g * finalDrive * 1000), 1));
  const topSpeedAtPeakHpKmh = gearSpeedsKmh[gearCount - 1];

  // Shift advice calculation
  const shiftAdvice: RoadGearShiftAdvice[] = [];
  const tireRadiusM = tireCircumferenceM / (2 * Math.PI);
  const drivetrainEfficiency = 0.92;

  if (input.powerCurve && input.powerCurve.length >= 2) {
    const maxRpmInCurve = Math.max(...input.powerCurve.map((p) => p.rpm));
    const redlineRpm = Math.min(maxRpmInCurve, rpmAtPower + 800);

    for (let gIdx = 0; gIdx < gearCount - 1; gIdx++) {
      const curRatio = gears[gIdx];
      const nextRatio = gears[gIdx + 1];
      const fromGear = gIdx + 1;
      const toGear = gIdx + 2;

      let optimalShiftRpm = redlineRpm;
      let foundCrossover = false;

      // Scan RPM from maxTorqueRpm to redline to check wheel tractive force crossover
      const scanStart = Math.max(3000, finiteOr(car.maxTorqueRpm, 4500));
      for (let scanRpm = scanStart; scanRpm <= redlineRpm; scanRpm += 50) {
        const nextRpm = scanRpm * (nextRatio / curRatio);
        const curTorque = interpolateTorqueNm(input.powerCurve, scanRpm);
        const nextTorque = interpolateTorqueNm(input.powerCurve, nextRpm);

        const curWheelForceN = (curTorque * curRatio * finalDrive * drivetrainEfficiency) / tireRadiusM;
        const nextWheelForceN = (nextTorque * nextRatio * finalDrive * drivetrainEfficiency) / tireRadiusM;

        if (nextWheelForceN >= curWheelForceN) {
          optimalShiftRpm = scanRpm;
          foundCrossover = true;
          break;
        }
      }

      const postShiftRpm = round(optimalShiftRpm * (nextRatio / curRatio), 0);
      const shiftSpeedKmh = round((optimalShiftRpm * tireCircumferenceM * 60) / (curRatio * finalDrive * 1000), 1);
      const postShiftTorque = interpolateTorqueNm(input.powerCurve, postShiftRpm);
      const postShiftForceN = round((postShiftTorque * nextRatio * finalDrive * drivetrainEfficiency) / tireRadiusM, 1);

      shiftAdvice.push({
        fromGear,
        toGear,
        shiftRpm: optimalShiftRpm,
        postShiftRpm,
        postShiftForceN,
        shiftSpeedKmh,
        reason: foundCrossover ? 'wheel_force_crossover' : 'redline_optimal'
      });
    }
  } else {
    warnings.push('Power curve missing: shift advice is based on estimated peak power RPM prior rather than post-shift wheel force optimization.');
    const estimatedShiftRpm = Math.round(rpmAtPower * 1.05);

    for (let gIdx = 0; gIdx < gearCount - 1; gIdx++) {
      const curRatio = gears[gIdx];
      const nextRatio = gears[gIdx + 1];
      const fromGear = gIdx + 1;
      const toGear = gIdx + 2;

      const postShiftRpm = Math.round(estimatedShiftRpm * (nextRatio / curRatio));
      const shiftSpeedKmh = round((estimatedShiftRpm * tireCircumferenceM * 60) / (curRatio * finalDrive * 1000), 1);

      shiftAdvice.push({
        fromGear,
        toGear,
        shiftRpm: estimatedShiftRpm,
        postShiftRpm,
        shiftSpeedKmh,
        reason: 'estimated_peak_hp_prior'
      });
    }
  }

  return {
    gearing: {
      finalDrive,
      gears,
      gearCount,
      tireCircumferenceM: round(tireCircumferenceM, 3),
      topSpeedAtPeakHpKmh,
      gearSpeedsKmh,
      shiftAdvice,
      spacingRatio: round(spacingStep, 3)
    },
    warnings
  };
}

// -----------------------------------------------------------------------------
// Chassis & Tire Target Solvers
// -----------------------------------------------------------------------------

function calculateDirectSpringKgfMm(massKg: number, frequencyHz: number): number {
  return ((2 * Math.PI * frequencyHz) ** 2 * massKg) / 9806.65;
}

function calculateCriticalDampingNsM(massKg: number, springKgfMm: number): number {
  const springNPerM = springKgfMm * 9806.65;
  return 2 * Math.sqrt(springNPerM * massKg);
}

function solveRoadChassis(input: RoadProfileInput): { chassis: RoadChassisTargets; warnings: string[] } {
  const warnings: string[] = [];
  const car = input.car;
  const weight = Math.max(400, finiteOr(car.weight, 1400));
  const frontPercent = clamp(finiteOr(car.weight_distribution, 50), 20, 80) / 100;
  const sprungMass = weight * 0.86;
  const frontWheelMass = (sprungMass * frontPercent) / 2;
  const rearWheelMass = (sprungMass * (1 - frontPercent)) / 2;

  // Natural frequencies based on road profile
  let targetFreqFrontHz = 2.2;
  let targetFreqRearHz = 2.3;
  let dampingRatioFront = 0.70;
  let dampingRatioRear = 0.70;

  if (input.profile === 'technical') {
    targetFreqFrontHz = 2.4;
    targetFreqRearHz = 2.5;
    dampingRatioFront = 0.75;
    dampingRatioRear = 0.75;
  } else if (input.profile === 'high_speed') {
    targetFreqFrontHz = 2.3;
    targetFreqRearHz = 2.4;
    dampingRatioFront = 0.72;
    dampingRatioRear = 0.72;
  }

  const [frontSpringMin, frontSpringMax] = bounded(car.spring_front_min, 10, finiteOr(car.spring_front_max, 150));
  const [rearSpringMin, rearSpringMax] = bounded(car.spring_rear_min, 10, finiteOr(car.spring_rear_max, 150));

  const frontSpringKgfMm = round(clamp(calculateDirectSpringKgfMm(frontWheelMass, targetFreqFrontHz), frontSpringMin, frontSpringMax), 1);
  const rearSpringKgfMm = round(clamp(calculateDirectSpringKgfMm(rearWheelMass, targetFreqRearHz), rearSpringMin, rearSpringMax), 1);

  const [frontHeightMin, frontHeightMax] = bounded(car.height_front_min, 8, finiteOr(car.height_front_max, 25));
  const [rearHeightMin, rearHeightMax] = bounded(car.height_rear_min, 8, finiteOr(car.height_rear_max, 25));

  let frontHeightFraction = 0.12;
  let rearHeightFraction = 0.14;
  if (input.profile === 'technical') {
    frontHeightFraction = 0.15;
    rearHeightFraction = 0.18;
  } else if (input.profile === 'high_speed') {
    frontHeightFraction = 0.08;
    rearHeightFraction = 0.10;
  }

  const frontRideHeightCm = round(frontHeightMin + (frontHeightMax - frontHeightMin) * frontHeightFraction, 1);
  const rearRideHeightCm = round(rearHeightMin + (rearHeightMax - rearHeightMin) * rearHeightFraction, 1);

  // Damping calculations
  const frontCriticalNsM = round(calculateCriticalDampingNsM(frontWheelMass, frontSpringKgfMm), 1);
  const rearCriticalNsM = round(calculateCriticalDampingNsM(rearWheelMass, rearSpringKgfMm), 1);
  const bumpToReboundRatio = 0.55;

  const frontReboundNsM = round(frontCriticalNsM * dampingRatioFront, 1);
  const rearReboundNsM = round(rearCriticalNsM * dampingRatioRear, 1);
  const frontBumpNsM = round(frontReboundNsM * bumpToReboundRatio, 1);
  const rearBumpNsM = round(rearReboundNsM * bumpToReboundRatio, 1);

  const frontSlider = round(clamp(1 + dampingRatioFront * 16 + (targetFreqFrontHz - 2) * 1.5, 1, 20), 1);
  const rearSlider = round(clamp(1 + dampingRatioRear * 16 + (targetFreqRearHz - 2) * 1.5, 1, 20), 1);

  // Anti-roll bar (ARB) calculations
  const [frontArbMin, frontArbMax] = bounded(car.arb_front_min, 1, finiteOr(car.arb_front_max, 65));
  const [rearArbMin, rearArbMax] = bounded(car.arb_rear_min, 1, finiteOr(car.arb_rear_max, 65));

  let arbOutput: RoadArbTarget;
  let diffOutput: RoadDifferentialTarget;

  const isAwd = car.drivetrain === 'AWD';
  const isFwd = car.drivetrain === 'FWD';
  const isRwd = car.drivetrain === 'RWD';

  if (isAwd && input.awdCircuitRotationPrior) {
    // Explicit AWD 1/65 rotation prior
    arbOutput = {
      front: 1.0,
      rear: 65.0,
      mode: 'circuit_rotation_1_65'
    };
    diffOutput = {
      frontAccelPercent: 20,
      frontDecelPercent: 5,
      rearAccelPercent: 80,
      rearDecelPercent: 18,
      centerToRearPercent: 70
    };
    warnings.push('AWD circuit_rotation preset (1/65 ARB) applied: this is an empirical rotation prior for agile turn-in, not a universal physics formula.');
  } else {
    // Standard baseline formula ARBs
    let arbProfile = DEV_CHASSIS_PROFILES.Road;
    if (input.profile === 'technical') {
      arbProfile = { frontArb: 0.55, rearArb: 0.85 };
    } else if (input.profile === 'high_speed') {
      arbProfile = { frontArb: 0.68, rearArb: 0.72 };
    }

    const weightBias = (frontPercent - 0.5) * 8;
    const frontArb = clamp(1 + 64 * arbProfile.frontArb * frontPercent + weightBias, frontArbMin, frontArbMax);
    const rearArb = clamp(1 + 64 * arbProfile.rearArb * (1 - frontPercent) - weightBias, rearArbMin, rearArbMax);

    arbOutput = {
      front: round(frontArb, 1),
      rear: round(rearArb, 1),
      mode: 'standard'
    };

    if (input.profile === 'technical') {
      diffOutput = {
        frontAccelPercent: isFwd ? 40 : 25,
        frontDecelPercent: isFwd ? 10 : 8,
        rearAccelPercent: isRwd ? 60 : 55,
        rearDecelPercent: isRwd ? 20 : 16,
        centerToRearPercent: isAwd ? 65 : 50
      };
    } else if (input.profile === 'high_speed') {
      diffOutput = {
        frontAccelPercent: isFwd ? 45 : 30,
        frontDecelPercent: isFwd ? 15 : 12,
        rearAccelPercent: isRwd ? 65 : 60,
        rearDecelPercent: isRwd ? 25 : 22,
        centerToRearPercent: isAwd ? 55 : 50
      };
    } else {
      diffOutput = {
        frontAccelPercent: isFwd ? 35 : 25,
        frontDecelPercent: 10,
        rearAccelPercent: isRwd ? 55 : 45,
        rearDecelPercent: 18,
        centerToRearPercent: isAwd ? 60 : 50
      };
    }
  }

  return {
    chassis: {
      springs: {
        modelType: 'direct_wheel_load_approx',
        frontKgfMm: frontSpringKgfMm,
        rearKgfMm: rearSpringKgfMm,
        frontRideHeightCm,
        rearRideHeightCm,
        targetFrequencyFrontHz: targetFreqFrontHz,
        targetFrequencyRearHz: targetFreqRearHz
      },
      damping: {
        frontCriticalNsM,
        rearCriticalNsM,
        frontReboundNsM,
        rearReboundNsM,
        frontBumpNsM,
        rearBumpNsM,
        frontSlider,
        rearSlider,
        bumpToReboundRatio,
        frontDampingRatio: dampingRatioFront,
        rearDampingRatio: dampingRatioRear
      },
      arb: arbOutput,
      differential: diffOutput
    },
    warnings
  };
}

function solveRoadTires(input: RoadProfileInput): RoadTireTargets {
  const surfaceKey = (input.surface as DevSurface) || 'tarmac';
  const surfaceMultiplier = DEV_SURFACE_MULTIPLIERS[surfaceKey] ?? DEV_SURFACE_MULTIPLIERS.tarmac;
  const tireCompoundKey = input.car.tireType ?? 'Default';
  const compoundPrior = DEV_TIRE_PRIORS[tireCompoundKey] ?? DEV_TIRE_PRIORS.Default;

  const muLongitudinal = round(compoundPrior.muLongitudinal * surfaceMultiplier.muLongitudinal, 2);
  const muLateral = round(compoundPrior.muLateral * surfaceMultiplier.muLateral, 2);

  const baseAlignment = DEV_ALIGNMENT_PROFILES.Road;
  const surfaceOffset = input.surface === 'snow' ? -1.0 : input.surface === 'gravel' ? -0.5 : 0;

  let hotPressure = baseAlignment.hot + surfaceOffset;
  let camberFrontDeg = baseAlignment.frontCamber;
  let camberRearDeg = baseAlignment.rearCamber;
  let toeFrontDeg = baseAlignment.frontToe;
  let toeRearDeg = baseAlignment.rearToe;
  let casterDeg = baseAlignment.caster;

  if (input.profile === 'technical') {
    camberFrontDeg = -1.8;
    camberRearDeg = -1.0;
    toeFrontDeg = 0.0;
    toeRearDeg = 0.05;
    casterDeg = 6.8;
    hotPressure = 30.0 + surfaceOffset;
  } else if (input.profile === 'high_speed') {
    camberFrontDeg = -1.2;
    camberRearDeg = -0.6;
    toeFrontDeg = 0.0;
    toeRearDeg = 0.02;
    casterDeg = 6.0;
    hotPressure = 31.0 + surfaceOffset;
  }

  const coldPressureFrontPsi = round(hotPressure - 3.0, 1);
  const coldPressureRearPsi = round(hotPressure - 3.0, 1);

  return {
    compound: tireCompoundKey,
    surface: input.surface,
    coldPressureFrontPsi,
    coldPressureRearPsi,
    targetHotPressurePsi: round(hotPressure, 1),
    camberFrontDeg,
    camberRearDeg,
    toeFrontDeg,
    toeRearDeg,
    casterDeg,
    muLongitudinal,
    muLateral
  };
}

// -----------------------------------------------------------------------------
// Optional Bicycle Cornering Advisory Solver
// -----------------------------------------------------------------------------

function solveCorneringAdvisory(input: RoadProfileInput, tireTargets: RoadTireTargets): RoadCorneringAdvisory | undefined {
  if (!input.corneringGeometry) return undefined;

  const geom = input.corneringGeometry;
  const radiusM = geom.cornerRadiusM;
  if (!Number.isFinite(radiusM) || radiusM <= 0) return undefined;

  const car = input.car;
  const massKg = Math.max(400, finiteOr(car.weight, 1400));
  const wheelbaseM = finiteOr(geom.wheelbaseM, 2.6);
  const frontWeightRatio = clamp(finiteOr(geom.frontWeightRatio, finiteOr(car.weight_distribution, 50) / 100), 0.2, 0.8);
  const rearWeightRatio = 1 - frontWeightRatio;

  // Wheelbase distances to CG: a is front axle to CG, b is rear axle to CG
  const a = wheelbaseM * rearWeightRatio;
  const b = wheelbaseM * frontWeightRatio;

  const g = 9.80665;
  const mu = finiteOr(geom.tireGripMu, tireTargets.muLateral);

  // Maximum steady-state cornering speed: V_max = sqrt(mu * g * R)
  const maxCornerSpeedMs = Math.sqrt(mu * g * radiusM);
  const maxCornerSpeedKmh = round(maxCornerSpeedMs * 3.6, 1);

  // Evaluated speed in m/s
  let evalSpeedMs = maxCornerSpeedMs * 0.95;
  if (geom.cornerSpeedKmh !== undefined && geom.cornerSpeedKmh > 0) {
    evalSpeedMs = Math.min((geom.cornerSpeedKmh / 3.6), maxCornerSpeedMs);
  } else if (input.slowestCornerSpeedKmh !== undefined && input.slowestCornerSpeedKmh > 0) {
    evalSpeedMs = Math.min((input.slowestCornerSpeedKmh / 3.6), maxCornerSpeedMs);
  }
  evalSpeedMs = Math.max(0.1, evalSpeedMs);
  const evaluatedSpeedKmh = round(evalSpeedMs * 3.6, 1);

  // Total centripetal force: sumFy = m * V^2 / R
  const totalLateralForceN = (massKg * evalSpeedMs * evalSpeedMs) / radiusM;

  // Yaw moment balance in steady-state: a * Fyf = b * Fyr
  // with Fyf + Fyr = sumFy => Fyf = (b / L) * sumFy, Fyr = (a / L) * sumFy
  const frontLateralForceN = (b / wheelbaseM) * totalLateralForceN;
  const rearLateralForceN = (a / wheelbaseM) * totalLateralForceN;

  // Cornering stiffness (N/rad), default ~14 rad^-1 * Fz
  const frontFzN = massKg * frontWeightRatio * g;
  const rearFzN = massKg * rearWeightRatio * g;
  const frontStiffness = finiteOr(geom.frontCorneringStiffnessNPerRad, 14.0 * frontFzN);
  const rearStiffness = finiteOr(geom.rearCorneringStiffnessNPerRad, 14.0 * rearFzN);

  // Slip angles: alpha = Fy / C_alpha (radians)
  const frontSlipAngleRad = frontLateralForceN / Math.max(1, frontStiffness);
  const rearSlipAngleRad = rearLateralForceN / Math.max(1, rearStiffness);

  const radToDeg = 180 / Math.PI;
  const frontSlipAngleDeg = round(frontSlipAngleRad * radToDeg, 2);
  const rearSlipAngleDeg = round(rearSlipAngleRad * radToDeg, 2);

  // Steer angle: delta = L/R + alphaF - alphaR
  const ackermannRad = wheelbaseM / radiusM;
  const steerAngleRad = ackermannRad + frontSlipAngleRad - rearSlipAngleRad;

  const steerAngleDeg = round(steerAngleRad * radToDeg, 2);
  const ackermannSteerAngleDeg = round(ackermannRad * radToDeg, 2);
  const understeerGradientDeg = round((frontSlipAngleRad - rearSlipAngleRad) * radToDeg, 2);

  let balance: 'understeer' | 'neutral' | 'oversteer' = 'neutral';
  if (understeerGradientDeg > 0.05) {
    balance = 'understeer';
  } else if (understeerGradientDeg < -0.05) {
    balance = 'oversteer';
  }

  return {
    model: 'linear_bicycle_model_estimated',
    status: 'estimated',
    cornerRadiusM: round(radiusM, 1),
    maxCornerSpeedKmh,
    evaluatedSpeedKmh,
    totalLateralForceN: round(totalLateralForceN, 2),
    frontLateralForceN: round(frontLateralForceN, 2),
    rearLateralForceN: round(rearLateralForceN, 2),
    frontSlipAngleDeg,
    rearSlipAngleDeg,
    steerAngleDeg,
    ackermannSteerAngleDeg,
    understeerGradientDeg,
    balance
  };
}

// -----------------------------------------------------------------------------
// Main Solver Entry Point
// -----------------------------------------------------------------------------

/**
 * Solves the Road/Circuit tuning profile (`tuning-profile/v1`).
 *
 * @throws Error if input validation fails.
 */
export function calculateRoadProfile(input: RoadProfileInput): RoadProfileOutput {
  const validationErrors = validateRoadProfileInput(input);
  if (validationErrors.length > 0) {
    throw new Error(`Road profile input validation failed:\n- ${validationErrors.join('\n- ')}`);
  }

  const allWarnings: string[] = [];

  // Aero state checks and warnings
  if (!input.aeroState) {
    allWarnings.push('Aero state not provided: downforce calculations assume stock vehicle aerodynamics.');
  }

  const tireCircumferenceM = calculateRoadTireCircumferenceM(input.car);

  // Solve Gearing
  const gearingResult = solveRoadGearing(input, tireCircumferenceM);
  allWarnings.push(...gearingResult.warnings);

  // Solve Chassis
  const chassisResult = solveRoadChassis(input);
  allWarnings.push(...chassisResult.warnings);

  // Solve Tires
  const tireTargets = solveRoadTires(input);

  // Optional Bicycle Cornering Advisory
  const corneringAdvisory = solveCorneringAdvisory(input, tireTargets);

  const status: TuningProfileStatus = 'empirical-prior';

  return {
    schemaVersion: 'tuning-profile/v1',
    profile: input.profile,
    source: status,
    status,
    gearing: gearingResult.gearing,
    chassis: chassisResult.chassis,
    tireTargets,
    corneringAdvisory,
    warnings: allWarnings
  };
}
