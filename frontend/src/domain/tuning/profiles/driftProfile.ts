/**
 * Drift Profile Solver (Phase 5C)
 *
 * Implements typed `tuning-profile/v1` schema supporting:
 * - Profiles: `street_drift`, `pro_drift`, `tandem`, `grassroots`
 * - Target Drift Angle & Tolerance evaluation
 * - Rear Differential presets (spool/locked, 100/20, progressive, open/mild) with min/max/recommended ranges
 * - Drift Alignment: Aggressive front camber (-3.5° to -5.0°), mild rear camber (-0.5° to -1.0°), front toe-out, rear toe-in, high caster (7.0°)
 * - Drift Pressures & ARB: Soft front ARB (10-20), stiff rear ARB (45-58), high front pressure / low rear pressure
 * - Telemetry Integration:
 *   - Body sideslip angle beta = atan2(velocityY, abs(velocityZ)) in degrees
 *   - Separate front/rear tire slip angle means (alpha)
 *   - Rear slip ratio & rear combined slip
 *   - Yaw rate from direct AngularVelocityY or unwrapped Yaw delta over timestamp delta
 *   - Integration over positive timestamp deltas only within target drift angle tolerance window
 *   - Weighted mean beta, variance beta, stability score
 *   - Filtering for low speed, zero/duplicate/out-of-order timestamps, missing arrays, angle wrap
 *
 * NOTE: Telemetry thresholds and tuning priors are engineering heuristics and calibration priors.
 * They are NOT claimed as live Forza Horizon 6 physics truths.
 */

import { DEV_SURFACE_MULTIPLIERS, DEV_TIRE_PRIORS } from '../constants';
import type { DevCarInput, DevSurface } from '../../../utils/tuningMath_dev';
import type { TuningCaptureSample } from '../telemetryCapture';
import { calculateTireGeometry } from '../tires/tireGeometry';
import { calculateFrictionEllipse } from '../tires/tireModel';

export type DriftProfileType = 'street_drift' | 'pro_drift' | 'tandem' | 'grassroots';
export type TuningProfileStatus = 'empirical-prior' | 'estimated' | 'calibrated';
export type RearDiffPreset = 'spool_100_100' | 'aggressive_100_20' | 'progressive_90_30' | 'open_mild';
export type DriftTelemetrySample = Partial<TuningCaptureSample> & Record<string, any>;

export interface PowerCurvePoint {
  rpm: number;
  torqueNm?: number;
  powerHp?: number;
  powerKw?: number;
}

export interface DriftDifferentialRange {
  min: number;
  max: number;
  recommended: number;
}

export interface DriftDifferentialTarget {
  strategy: 'drift_rear_bias_prior';
  preset: RearDiffPreset | string;
  frontAccelPercent?: number;
  frontDecelPercent?: number;
  rearAccelPercent: number;
  rearDecelPercent: number;
  centerToRearPercent?: number;
  ranges: {
    rearAccel: DriftDifferentialRange;
    rearDecel: DriftDifferentialRange;
    frontAccel?: DriftDifferentialRange;
    frontDecel?: DriftDifferentialRange;
    centerToRear?: DriftDifferentialRange;
  };
  notes: string;
}

export interface DriftAlignmentTarget {
  frontCamberDeg: number;
  rearCamberDeg: number;
  frontToeDeg: number;
  rearToeDeg: number;
  casterDeg: number;
  notes: string;
}

export interface DriftPressureTarget {
  coldFrontPsi: number;
  coldRearPsi: number;
  targetHotFrontPsi: number;
  targetHotRearPsi: number;
  notes: string;
}

export interface DriftArbTarget {
  front: number;
  rear: number;
  rollStiffnessFrontPct: number;
  mode: 'drift_stiff_rear_rotation';
}

export interface DriftSpringsTarget {
  modelType: 'direct_wheel_load_approx';
  frontKgfMm: number;
  rearKgfMm: number;
  frontRideHeightCm: number;
  rearRideHeightCm: number;
  targetFrequencyFrontHz: number;
  targetFrequencyRearHz: number;
}

export interface DriftDampingTarget {
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

export interface DriftChassisTargets {
  springs: DriftSpringsTarget;
  damping: DriftDampingTarget;
  arb: DriftArbTarget;
  differential: DriftDifferentialTarget;
}

export interface DriftTireTargets {
  compound: string;
  surface: DevSurface | string;
  alignment: DriftAlignmentTarget;
  pressures: DriftPressureTarget;
  muLongitudinal: number;
  muLateral: number;
  frictionEllipseCapacityN: {
    frontPerTireN: number;
    rearPerTireN: number;
  };
}

export interface DriftGearShiftAdvice {
  fromGear: number;
  toGear: number;
  shiftRpm: number;
  postShiftRpm: number;
  postShiftForceN?: number;
  shiftSpeedKmh: number;
  reason: 'wheel_force_crossover' | 'redline_optimal' | 'estimated_peak_hp_prior';
}

export interface DriftGearingOutput {
  gearingStrategy: 'drift_wide_powerband_spacing';
  finalDrive: number;
  gears: number[];
  gearCount: number;
  tireCircumferenceM: number;
  topSpeedAtPeakHpKmh: number;
  gearSpeedsKmh: number[];
  shiftAdvice: DriftGearShiftAdvice[];
  spacingRatio: number;
}

export interface DriftTelemetryMetrics {
  status: 'estimated';
  isHeuristic: true;
  sampleCount: number;
  validSampleCount: number;
  driftSampleCount: number;
  totalDurationSeconds: number;
  driftDurationSeconds: number;
  driftRatio: number; // fraction [0, 1] of time in sustained drift window
  meanBodyBetaDeg: number; // weighted mean of |body beta| in drift window
  varianceBodyBeta: number; // weighted variance of |body beta| in drift window
  stdDevBodyBetaDeg: number;
  stabilityScore: number; // [0, 100] higher = less angle variance / smoother drift
  peakBodyBetaDeg: number;
  meanFrontTireSlipAngleDeg: number; // tire alpha front mean (FL/FR)
  meanRearTireSlipAngleDeg: number; // tire alpha rear mean (RL/RR)
  peakFrontTireSlipAngleDeg: number;
  peakRearTireSlipAngleDeg: number;
  meanRearSlipRatio: number;
  peakRearSlipRatio: number;
  meanRearCombinedSlip: number;
  peakRearCombinedSlip: number;
  meanYawRateDegPerSec: number;
  peakYawRateDegPerSec: number;
  yawRateSource: 'direct_angular_velocity' | 'estimated_unwrapped_yaw' | 'unknown';
  droppedOrOutOfOrderTimestamps: number;
  lowSpeedSamplesFiltered: number;
  notes: string;
}

export interface DriftProfileInput {
  profile?: DriftProfileType;
  targetDriftAngleDeg?: number;
  angleToleranceDeg?: number;
  surface?: DevSurface | string;
  car: DevCarInput;
  gearCount?: number;
  targetTopSpeedKmh?: number;
  rearDiffPreset?: RearDiffPreset | string;
  powerCurve?: PowerCurvePoint[];
  telemetrySamples?: DriftTelemetrySample[];
  minSpeedMps?: number;
}

export interface DriftProfileOutput {
  schemaVersion: 'tuning-profile/v1';
  profile: DriftProfileType;
  source: TuningProfileStatus;
  status: TuningProfileStatus;
  targetDriftAngleDeg: number;
  angleToleranceDeg: number;
  rearDiffPreset: RearDiffPreset | string;
  chassis: DriftChassisTargets;
  tireTargets: DriftTireTargets;
  gearing: DriftGearingOutput;
  telemetryMetrics?: DriftTelemetryMetrics;
  warnings: string[];
}

// -----------------------------------------------------------------------------
// Math & Helper Utilities
// -----------------------------------------------------------------------------

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finiteOr = (value: any, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
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
 */
function calculateDirectSpringKgfMm(massKg: number, frequencyHz: number): number {
  return ((2 * Math.PI * frequencyHz) ** 2 * massKg) / 9806.65;
}

/**
 * Calculates physical critical damping in N·s/m: Cc = 2 * sqrt(K_spring_N_per_m * mass_kg)
 */
function calculateCriticalDampingNsM(massKg: number, springKgfMm: number): number {
  const springNPerM = springKgfMm * 9806.65;
  return 2 * Math.sqrt(springNPerM * massKg);
}

/**
 * Calculates tire rolling circumference in metres using tireGeometry module.
 */
export function calculateDriftTireCircumferenceM(car: DevCarInput): number {
  const isFwd = car.drivetrain === 'FWD';
  const widthMm = finiteOr(isFwd ? car.frontTireWidth : car.rearTireWidth, 245);
  const aspectRatio = finiteOr(isFwd ? car.frontTireAspect : car.rearTireAspect, 40);
  const rimDiameterIn = finiteOr(isFwd ? car.frontTireRim : car.rearTireRim, 18);

  const geom = calculateTireGeometry({ widthMm, aspectRatio, rimDiameterIn });
  return geom.rollingCircumferenceM;
}

/**
 * Validates drift profile input for finite values, positive domains, and bounds.
 */
export function validateDriftProfileInput(input: DriftProfileInput): string[] {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return ['Input must be a valid object.'];
  }

  if (input.profile !== undefined) {
    const validProfiles: DriftProfileType[] = ['street_drift', 'pro_drift', 'tandem', 'grassroots'];
    if (!validProfiles.includes(input.profile)) {
      errors.push(`Invalid profile: '${input.profile}'. Must be one of: ${validProfiles.join(', ')}.`);
    }
  }

  if (input.targetDriftAngleDeg !== undefined) {
    if (!Number.isFinite(input.targetDriftAngleDeg)) {
      errors.push('targetDriftAngleDeg must be a finite number.');
    } else if (input.targetDriftAngleDeg < 5 || input.targetDriftAngleDeg > 75) {
      errors.push(`targetDriftAngleDeg (${input.targetDriftAngleDeg}) is outside typical range [5, 75] degrees.`);
    }
  }

  if (input.angleToleranceDeg !== undefined) {
    if (!Number.isFinite(input.angleToleranceDeg) || input.angleToleranceDeg <= 0) {
      errors.push('angleToleranceDeg must be a positive finite number.');
    } else if (input.angleToleranceDeg > 30) {
      errors.push(`angleToleranceDeg (${input.angleToleranceDeg}) is too large (> 30 deg).`);
    }
  }

  if (!input.car || typeof input.car !== 'object') {
    errors.push('car object is required.');
    return errors;
  }

  if (!Number.isFinite(input.car.weight) || input.car.weight <= 0) {
    errors.push('car.weight must be a positive finite number.');
  }

  if (
    !Number.isFinite(input.car.weight_distribution) ||
    input.car.weight_distribution <= 0 ||
    input.car.weight_distribution >= 100
  ) {
    errors.push('car.weight_distribution must be a number between 0 and 100 (exclusive).');
  }

  if (input.targetTopSpeedKmh !== undefined) {
    if (!Number.isFinite(input.targetTopSpeedKmh) || input.targetTopSpeedKmh <= 0) {
      errors.push('targetTopSpeedKmh must be a positive finite number when specified.');
    }
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Telemetry Analysis Engine
// -----------------------------------------------------------------------------

/**
 * Analyzes capture telemetry for drift dynamics:
 * - Computes body beta = atan2(velocityY, abs(velocityZ)) in degrees for each sample
 * - Computes front/rear tire slip-angle means separately (tire alpha FL/FR vs RL/RR)
 * - Computes rear slip ratio & combined slip (RL/RR)
 * - Estimates yaw rate from unwrapped Yaw delta over dt if no AngularVelocityY is present
 * - Integrates positive timestamp deltas only when body beta is within target drift angle tolerance
 * - Computes weighted mean and variance of beta to evaluate drift angle stability
 * - Safely handles low speed, zero/duplicate/out-of-order timestamps, missing arrays, and angle wrap
 */
export function analyzeDriftTelemetry(
  samples?: DriftTelemetrySample[],
  targetDriftAngleDeg = 35,
  angleToleranceDeg = 8,
  minSpeedMps = 3.0
): DriftTelemetryMetrics | undefined {
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return undefined;
  }

  const sampleCount = samples.length;
  let validSampleCount = 0;
  let driftSampleCount = 0;
  let droppedOrOutOfOrderTimestamps = 0;
  let lowSpeedSamplesFiltered = 0;

  let totalDurationSeconds = 0;
  let driftDurationSeconds = 0;

  let peakBodyBetaDeg = 0;
  let peakFrontAlphaDeg = 0;
  let peakRearAlphaDeg = 0;
  let peakRearSlipRatio = 0;
  let peakRearCombinedSlip = 0;
  let peakYawRateDegPerSec = 0;

  let sumFrontAlphaDeg = 0;
  let sumRearAlphaDeg = 0;
  let sumRearSlipRatio = 0;
  let sumRearCombinedSlip = 0;
  let sumYawRateDegPerSec = 0;
  let yawRateSampleCount = 0;

  // Weighted integration accumulators for drift window
  let weightSum = 0;
  let weightedBetaSum = 0;
  let weightedBetaSqSum = 0;

  let yawRateSource: 'direct_angular_velocity' | 'estimated_unwrapped_yaw' | 'unknown' = 'unknown';

  let prevTimestampMS: number | undefined = undefined;
  let prevYawRad: number | undefined = undefined;

  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    if (!s || typeof s !== 'object') continue;

    const rawTimestampMS = finiteOr(s.timestampMS ?? s.TimestampMS, undefined as any);
    const speedMps = finiteOr(
      s.speedMps ?? s.SpeedMetersPerSecond,
      Math.hypot(finiteOr(s.velocityX ?? s.VelocityX, 0), finiteOr(s.velocityY ?? s.VelocityY, 0), finiteOr(s.velocityZ ?? s.VelocityZ, 0))
    );

    // 1. Timestamp Delta validation (positive dt integration)
    let dt = 0;
    if (prevTimestampMS !== undefined && rawTimestampMS !== undefined) {
      const deltaMs = rawTimestampMS - prevTimestampMS;
      if (deltaMs <= 0) {
        droppedOrOutOfOrderTimestamps++;
        dt = 0;
      } else if (deltaMs > 2000) {
        // Gap too large, do not integrate huge artificial dt
        dt = 0;
      } else {
        dt = deltaMs / 1000;
      }
    }
    if (rawTimestampMS !== undefined) {
      prevTimestampMS = rawTimestampMS;
    }

    // 2. Low speed filter
    if (speedMps < minSpeedMps) {
      lowSpeedSamplesFiltered++;
      // Still update previous yaw for unwrapping continuity
      const rawYaw = finiteOr(s.yaw ?? s.Yaw, undefined as any);
      if (rawYaw !== undefined) {
        prevYawRad = Math.abs(rawYaw) <= Math.PI * 2 ? rawYaw : (rawYaw * Math.PI) / 180;
      }
      continue;
    }

    validSampleCount++;
    totalDurationSeconds += dt;

    // 3. Body sideslip angle beta = atan2(velocityY, abs(velocityZ)) in degrees
    const vy = finiteOr(s.velocityY ?? s.VelocityY, 0);
    const vz = finiteOr(s.velocityZ ?? s.VelocityZ, 0);
    const absVz = Math.abs(vz);

    let bodyBetaDeg = 0;
    if (absVz > 0.001 || Math.abs(vy) > 0.001) {
      bodyBetaDeg = (Math.atan2(vy, absVz) * 180) / Math.PI;
    }
    const absBetaDeg = Math.abs(bodyBetaDeg);
    if (absBetaDeg > peakBodyBetaDeg) {
      peakBodyBetaDeg = absBetaDeg;
    }

    // 4. Separate front / rear tire slip angle alpha means
    const rawSlipAngles: any[] = Array.isArray(s.tireSlipAngle ?? s.TireSlipAngle)
      ? (s.tireSlipAngle ?? s.TireSlipAngle)
      : [];

    // Front tires (FL = 0, FR = 1)
    const alphaFL = finiteOr(rawSlipAngles[0], 0);
    const alphaFR = finiteOr(rawSlipAngles[1], 0);
    const alphaFLDeg = Math.abs(alphaFL) <= Math.PI * 2 ? (Math.abs(alphaFL) * 180) / Math.PI : Math.abs(alphaFL);
    const alphaFRDeg = Math.abs(alphaFR) <= Math.PI * 2 ? (Math.abs(alphaFR) * 180) / Math.PI : Math.abs(alphaFR);
    const frontAlphaMeanDeg = (alphaFLDeg + alphaFRDeg) / 2;

    // Rear tires (RL = 2, RR = 3)
    const alphaRL = finiteOr(rawSlipAngles[2], 0);
    const alphaRR = finiteOr(rawSlipAngles[3], 0);
    const alphaRLDeg = Math.abs(alphaRL) <= Math.PI * 2 ? (Math.abs(alphaRL) * 180) / Math.PI : Math.abs(alphaRL);
    const alphaRRDeg = Math.abs(alphaRR) <= Math.PI * 2 ? (Math.abs(alphaRR) * 180) / Math.PI : Math.abs(alphaRR);
    const rearAlphaMeanDeg = (alphaRLDeg + alphaRRDeg) / 2;

    if (frontAlphaMeanDeg > peakFrontAlphaDeg) peakFrontAlphaDeg = frontAlphaMeanDeg;
    if (rearAlphaMeanDeg > peakRearAlphaDeg) peakRearAlphaDeg = rearAlphaMeanDeg;

    sumFrontAlphaDeg += frontAlphaMeanDeg;
    sumRearAlphaDeg += rearAlphaMeanDeg;

    // 5. Rear tire slip ratio & combined slip
    const rawSlipRatios: any[] = Array.isArray(s.tireSlipRatio ?? s.TireSlipRatio)
      ? (s.tireSlipRatio ?? s.TireSlipRatio)
      : [];
    const srRL = Math.abs(finiteOr(rawSlipRatios[2], 0));
    const srRR = Math.abs(finiteOr(rawSlipRatios[3], 0));
    const rearSlipRatioMean = (srRL + srRR) / 2;
    if (rearSlipRatioMean > peakRearSlipRatio) peakRearSlipRatio = rearSlipRatioMean;
    sumRearSlipRatio += rearSlipRatioMean;

    const rawCombinedSlip: any[] = Array.isArray(s.tireCombinedSlip ?? s.TireCombinedSlip)
      ? (s.tireCombinedSlip ?? s.TireCombinedSlip)
      : [];
    const csRL = Math.abs(finiteOr(rawCombinedSlip[2], 0));
    const csRR = Math.abs(finiteOr(rawCombinedSlip[3], 0));
    const rearCombinedSlipMean = (csRL + csRR) / 2;
    if (rearCombinedSlipMean > peakRearCombinedSlip) peakRearCombinedSlip = rearCombinedSlipMean;
    sumRearCombinedSlip += rearCombinedSlipMean;

    // 6. Yaw Rate calculation (direct AngularVelocityY or unwrapped Yaw)
    let sampleYawRateDegPerSec = 0;
    const directAngVelY = finiteOr(s.angularVelocityY ?? s.AngularVelocityY ?? s.yawRate ?? s.YawRate, undefined as any);

    if (directAngVelY !== undefined) {
      yawRateSource = 'direct_angular_velocity';
      const absAngVel = Math.abs(directAngVelY);
      sampleYawRateDegPerSec = absAngVel <= 25 ? (absAngVel * 180) / Math.PI : absAngVel;
    } else {
      const rawYaw = finiteOr(s.yaw ?? s.Yaw, undefined as any);
      if (rawYaw !== undefined) {
        const currentYawRad = Math.abs(rawYaw) <= Math.PI * 2 ? rawYaw : (rawYaw * Math.PI) / 180;
        if (prevYawRad !== undefined && dt > 0) {
          // Angle unwrap in radians [-pi, pi]
          let deltaYawRad = currentYawRad - prevYawRad;
          while (deltaYawRad > Math.PI) deltaYawRad -= 2 * Math.PI;
          while (deltaYawRad < -Math.PI) deltaYawRad += 2 * Math.PI;

          const deltaYawDeg = (Math.abs(deltaYawRad) * 180) / Math.PI;
          sampleYawRateDegPerSec = deltaYawDeg / dt;
          if (yawRateSource === 'unknown') {
            yawRateSource = 'estimated_unwrapped_yaw';
          }
        }
        prevYawRad = currentYawRad;
      }
    }

    if (sampleYawRateDegPerSec > 0) {
      if (sampleYawRateDegPerSec > peakYawRateDegPerSec) {
        peakYawRateDegPerSec = sampleYawRateDegPerSec;
      }
      sumYawRateDegPerSec += sampleYawRateDegPerSec;
      yawRateSampleCount++;
    }

    // 7. Drift Target Angle Window Evaluation & Integration
    const minTargetAngle = Math.max(0, targetDriftAngleDeg - angleToleranceDeg);
    const maxTargetAngle = targetDriftAngleDeg + angleToleranceDeg;
    const inDriftWindow = absBetaDeg >= minTargetAngle - 1e-6 && absBetaDeg <= maxTargetAngle + 1e-6;

    if (inDriftWindow) {
      driftSampleCount++;
      driftDurationSeconds += dt;

      // Weight timestamped samples by their positive interval. For the first
      // sample, use the forward interval so alternating-angle fixtures do not
      // bias the weighted mean; samples without timestamps retain unit weight.
      const nextTimestampMS = i + 1 < sampleCount
        ? finiteOr(samples[i + 1]?.timestampMS ?? samples[i + 1]?.TimestampMS, undefined as any)
        : undefined;
      const nextDt = rawTimestampMS !== undefined && nextTimestampMS !== undefined
        ? (nextTimestampMS - rawTimestampMS) / 1000
        : 0;
      const w = dt > 0 ? dt : nextDt > 0 ? nextDt : rawTimestampMS === undefined ? 1.0 : 0;
      weightSum += w;
      weightedBetaSum += absBetaDeg * w;
      weightedBetaSqSum += absBetaDeg * absBetaDeg * w;
    }
  }

  if (validSampleCount === 0) {
    return {
      status: 'estimated',
      isHeuristic: true,
      sampleCount,
      validSampleCount: 0,
      driftSampleCount: 0,
      totalDurationSeconds: 0,
      driftDurationSeconds: 0,
      driftRatio: 0,
      meanBodyBetaDeg: 0,
      varianceBodyBeta: 0,
      stdDevBodyBetaDeg: 0,
      stabilityScore: 0,
      peakBodyBetaDeg: 0,
      meanFrontTireSlipAngleDeg: 0,
      meanRearTireSlipAngleDeg: 0,
      peakFrontTireSlipAngleDeg: 0,
      peakRearTireSlipAngleDeg: 0,
      meanRearSlipRatio: 0,
      peakRearSlipRatio: 0,
      meanRearCombinedSlip: 0,
      peakRearCombinedSlip: 0,
      meanYawRateDegPerSec: 0,
      peakYawRateDegPerSec: 0,
      yawRateSource,
      droppedOrOutOfOrderTimestamps,
      lowSpeedSamplesFiltered,
      notes: 'All samples were filtered due to low speed or invalid data.'
    };
  }

  // Calculate weighted mean and variance of beta in drift window
  let meanBodyBetaDeg = 0;
  let varianceBodyBeta = 0;
  let stdDevBodyBetaDeg = 0;
  let stabilityScore = 0;

  if (weightSum > 0 && driftSampleCount > 0) {
    const rawMean = weightedBetaSum / weightSum;
    meanBodyBetaDeg = round(rawMean, 2);
    const rawVar = weightedBetaSqSum / weightSum - rawMean * rawMean;
    varianceBodyBeta = round(Math.max(0, rawVar), 3);
    stdDevBodyBetaDeg = round(Math.sqrt(varianceBodyBeta), 2);

    // Stability Score [0, 100]: rewards low standard deviation around target drift angle
    // stdDev of 0 -> 100, stdDev of 2 -> 76, stdDev of 4 -> 52, stdDev >= 8.33 -> 0
    const rawStability = clamp(100 - stdDevBodyBetaDeg * 12, 0, 100);
    stabilityScore = round(rawStability, 1);
  }

  const driftRatio = totalDurationSeconds > 0 ? round(driftDurationSeconds / totalDurationSeconds, 3) : 0;

  return {
    status: 'estimated',
    isHeuristic: true,
    sampleCount,
    validSampleCount,
    driftSampleCount,
    totalDurationSeconds: round(totalDurationSeconds, 3),
    driftDurationSeconds: round(driftDurationSeconds, 3),
    driftRatio,
    meanBodyBetaDeg,
    varianceBodyBeta,
    stdDevBodyBetaDeg,
    stabilityScore,
    peakBodyBetaDeg: round(peakBodyBetaDeg, 2),
    meanFrontTireSlipAngleDeg: round(sumFrontAlphaDeg / validSampleCount, 2),
    meanRearTireSlipAngleDeg: round(sumRearAlphaDeg / validSampleCount, 2),
    peakFrontTireSlipAngleDeg: round(peakFrontAlphaDeg, 2),
    peakRearTireSlipAngleDeg: round(peakRearAlphaDeg, 2),
    meanRearSlipRatio: round(sumRearSlipRatio / validSampleCount, 3),
    peakRearSlipRatio: round(peakRearSlipRatio, 3),
    meanRearCombinedSlip: round(sumRearCombinedSlip / validSampleCount, 3),
    peakRearCombinedSlip: round(peakRearCombinedSlip, 3),
    meanYawRateDegPerSec: yawRateSampleCount > 0 ? round(sumYawRateDegPerSec / yawRateSampleCount, 1) : 0,
    peakYawRateDegPerSec: round(peakYawRateDegPerSec, 1),
    yawRateSource,
    droppedOrOutOfOrderTimestamps,
    lowSpeedSamplesFiltered,
    notes:
      driftSampleCount > 0
        ? `Sustained drift held for ${round(driftDurationSeconds, 2)}s (${round(driftRatio * 100, 1)}% of valid time) with mean body beta ${meanBodyBetaDeg}° and stability ${stabilityScore}/100.`
        : 'No samples met target drift angle tolerance window.'
  };
}

// -----------------------------------------------------------------------------
// Component Calculators (Diff, Alignment, Pressures, ARB, Chassis, Gearing)
// -----------------------------------------------------------------------------

/**
 * Calculates drift differential settings with min/max/recommended ranges based on preset.
 */
export function calculateDriftDifferential(
  car: DevCarInput,
  presetInput?: RearDiffPreset | string
): DriftDifferentialTarget {
  const isAwd = car.drivetrain === 'AWD';
  const isFwd = car.drivetrain === 'FWD';
  const preset: RearDiffPreset =
    presetInput === 'spool_100_100' || presetInput === 'welded'
      ? 'spool_100_100'
      : presetInput === 'progressive_90_30' || presetInput === 'street_drift'
      ? 'progressive_90_30'
      : presetInput === 'open_mild' || presetInput === 'grassroots'
      ? 'open_mild'
      : 'aggressive_100_20';

  let rearAccelRange: DriftDifferentialRange;
  let rearDecelRange: DriftDifferentialRange;
  let notes = '';

  switch (preset) {
    case 'spool_100_100':
      rearAccelRange = { min: 100, max: 100, recommended: 100 };
      rearDecelRange = { min: 100, max: 100, recommended: 100 };
      notes = 'Spool / 100% locked differential for predictable breakaway and locked tandem consistency.';
      break;
    case 'progressive_90_30':
      rearAccelRange = { min: 80, max: 95, recommended: 90 };
      rearDecelRange = { min: 20, max: 40, recommended: 30 };
      notes = 'Progressive 1.5-way drift setup balancing on-power drive with moderate off-power rotation.';
      break;
    case 'open_mild':
      rearAccelRange = { min: 70, max: 85, recommended: 75 };
      rearDecelRange = { min: 10, max: 25, recommended: 15 };
      notes = 'Grassroots / mild lock setup offering lenient transitions for lower power builds.';
      break;
    case 'aggressive_100_20':
    default:
      rearAccelRange = { min: 90, max: 100, recommended: 100 };
      rearDecelRange = { min: 10, max: 35, recommended: 20 };
      notes = 'Pro competition 2-way LSD with 100% acceleration lock and low decel lock for nimble initiation.';
      break;
  }

  const result: DriftDifferentialTarget = {
    strategy: 'drift_rear_bias_prior',
    preset,
    rearAccelPercent: rearAccelRange.recommended,
    rearDecelPercent: rearDecelRange.recommended,
    ranges: {
      rearAccel: rearAccelRange,
      rearDecel: rearDecelRange
    },
    notes
  };

  if (isAwd) {
    const frontAccelRange = { min: 25, max: 55, recommended: 40 };
    const frontDecelRange = { min: 0, max: 15, recommended: 0 };
    const centerToRearRange = { min: 75, max: 92, recommended: 85 };

    result.frontAccelPercent = frontAccelRange.recommended;
    result.frontDecelPercent = frontDecelRange.recommended;
    result.centerToRearPercent = centerToRearRange.recommended;
    result.ranges.frontAccel = frontAccelRange;
    result.ranges.frontDecel = frontDecelRange;
    result.ranges.centerToRear = centerToRearRange;
    result.notes += ' AWD center torque heavily biased to rear (85%) for rear-drive drift dynamics.';
  } else if (isFwd) {
    result.frontAccelPercent = 45;
    result.frontDecelPercent = 0;
    result.notes += ' (FWD notice: Front differential tuned for line correction).';
  }

  return result;
}

/**
 * Calculates drift alignment targets (camber, toe, caster).
 */
export function calculateDriftAlignment(
  car: DevCarInput,
  targetDriftAngleDeg = 35
): DriftAlignmentTarget {
  void car;
  // Front Camber: Highly negative to maintain flat contact patch at countersteer angle
  // Base -3.5°, scaling dynamically with target drift angle
  const angleDelta = Math.max(0, targetDriftAngleDeg - 35);
  const frontCamberDeg = round(clamp(-3.5 - angleDelta * 0.035, -5.0, -3.0), 2);

  // Rear Camber: Mild negative (-0.8°) to maximize contact patch during lateral slide
  const rearCamberDeg = -0.8;

  // Front Toe: Slight toe-out (-0.15°) to improve turn-in agility and transition responsiveness
  const frontToeDeg = -0.15;

  // Rear Toe: Slight toe-in (+0.15°) to stabilize forward traction during sustained sideways drift
  const rearToeDeg = 0.15;

  // Caster: High positive caster (+7.0°) for strong self-aligning countersteer return torque
  const casterDeg = 7.0;

  return {
    frontCamberDeg,
    rearCamberDeg,
    frontToeDeg,
    rearToeDeg,
    casterDeg,
    notes:
      'Aggressive front camber counteracts caster-induced positive dynamic camber during full countersteer lock.'
  };
}

/**
 * Calculates drift tire pressures.
 */
export function calculateDriftPressures(car: DevCarInput): DriftPressureTarget {
  const hp = finiteOr(car.maxHp, 400);

  // Front pressure is higher (30.5 psi) for sharp steering response and sidewall firmness
  const coldFrontPsi = 30.5;
  const targetHotFrontPsi = 32.0;

  // Rear pressure: lower (24.0 psi) for big power/grip cars; slightly higher for lower hp to break traction
  let coldRearPsi = 24.0;
  if (hp < 300) {
    coldRearPsi = 28.0;
  } else if (hp < 500) {
    coldRearPsi = 25.5;
  }
  const targetHotRearPsi = round(coldRearPsi + 2.0, 1);

  return {
    coldFrontPsi: round(coldFrontPsi, 1),
    coldRearPsi: round(coldRearPsi, 1),
    targetHotFrontPsi,
    targetHotRearPsi,
    notes:
      'Lower rear tire pressure widens the contact patch for progressive throttle-modulating traction.'
  };
}

/**
 * Calculates drift chassis targets (Springs, Damping, ARB).
 */
export function calculateDriftChassis(
  car: DevCarInput,
  diffTarget: DriftDifferentialTarget
): DriftChassisTargets {
  const weight = Math.max(600, finiteOr(car.weight, 1350));
  const frontPercent = clamp(finiteOr(car.weight_distribution, 53), 20, 80) / 100;
  const sprungMass = weight * 0.86;
  const frontWheelMass = (sprungMass * frontPercent) / 2;
  const rearWheelMass = (sprungMass * (1 - frontPercent)) / 2;

  // Natural frequencies: front 2.2 Hz, rear 2.3 Hz
  const targetFrequencyFrontHz = 3.0;
  const targetFrequencyRearHz = 3.1;

  const [frontSpringMin, frontSpringMax] = bounded(car.spring_front_min, 10, finiteOr(car.spring_front_max, 120));
  const [rearSpringMin, rearSpringMax] = bounded(car.spring_rear_min, 10, finiteOr(car.spring_rear_max, 120));

  const frontSpringKgfMm = round(
    clamp(calculateDirectSpringKgfMm(frontWheelMass, targetFrequencyFrontHz), frontSpringMin, frontSpringMax),
    2
  );
  const rearSpringKgfMm = round(
    clamp(calculateDirectSpringKgfMm(rearWheelMass, targetFrequencyRearHz), rearSpringMin, rearSpringMax),
    2
  );

  // Ride Height: low ride height (20% of travel) to lower center of gravity while avoiding bottoming
  const [frontHeightMin, frontHeightMax] = bounded(car.height_front_min, 10, finiteOr(car.height_front_max, 25));
  const [rearHeightMin, rearHeightMax] = bounded(car.height_rear_min, 10, finiteOr(car.height_rear_max, 25));
  const frontRideHeightCm = round(frontHeightMin + (frontHeightMax - frontHeightMin) * 0.20, 1);
  const rearRideHeightCm = round(rearHeightMin + (rearHeightMax - rearHeightMin) * 0.20, 1);

  // Anti-Roll Bars (ARB):
  // Front ARB: soft (0.30 profile) to maximize front mechanical grip during lock
  // Rear ARB: stiff (0.90 profile) to encourage rear rotation and reduce rear roll compliance
  const weightBias = (frontPercent - 0.5) * 8;
  const [frontArbMin, frontArbMax] = bounded(car.arb_front_min, 1, finiteOr(car.arb_front_max, 65));
  const [rearArbMin, rearArbMax] = bounded(car.arb_rear_min, 1, finiteOr(car.arb_rear_max, 65));

  const frontArb = round(clamp(1 + 64 * 0.30 * frontPercent + weightBias, frontArbMin, frontArbMax), 1);
  const rearArb = round(clamp(1 + 64 * 1.40 * (1 - frontPercent) - weightBias, rearArbMin, rearArbMax), 1);
  const rollStiffnessFrontPct = round((frontArb / (frontArb + rearArb)) * 100, 1);

  // Damping: Critical damping calculation
  const frontCriticalNsM = round(calculateCriticalDampingNsM(frontWheelMass, frontSpringKgfMm), 1);
  const rearCriticalNsM = round(calculateCriticalDampingNsM(rearWheelMass, rearSpringKgfMm), 1);

  const frontDampingRatio = 0.70;
  const rearDampingRatio = 0.70;
  const bumpToReboundRatio = 0.50; // Drift uses 0.50 bump:rebound ratio

  const frontReboundNsM = round(frontCriticalNsM * frontDampingRatio, 1);
  const rearReboundNsM = round(rearCriticalNsM * rearDampingRatio, 1);
  const frontBumpNsM = round(frontReboundNsM * bumpToReboundRatio, 1);
  const rearBumpNsM = round(rearReboundNsM * bumpToReboundRatio, 1);

  // Advisory Slider values (1..20 scale)
  const frontSlider = round(clamp(1 + frontDampingRatio * 16 + (targetFrequencyFrontHz - 2) * 1.5, 1, 20), 1);
  const rearSlider = round(clamp(1 + rearDampingRatio * 16 + (targetFrequencyRearHz - 2) * 1.5, 1, 20), 1);

  return {
    springs: {
      modelType: 'direct_wheel_load_approx',
      frontKgfMm: frontSpringKgfMm,
      rearKgfMm: rearSpringKgfMm,
      frontRideHeightCm,
      rearRideHeightCm,
      targetFrequencyFrontHz,
      targetFrequencyRearHz
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
      frontDampingRatio,
      rearDampingRatio
    },
    arb: {
      front: frontArb,
      rear: rearArb,
      rollStiffnessFrontPct,
      mode: 'drift_stiff_rear_rotation'
    },
    differential: diffTarget
  };
}

/**
 * Calculates drift gearing with wide usable powerband gear steps.
 */
export function calculateDriftGearing(
  car: DevCarInput,
  targetTopSpeedKmh = 230,
  gearCount = 6
): DriftGearingOutput {
  const circM = calculateDriftTireCircumferenceM(car);
  const maxRpm = Math.max(5000, finiteOr(car.maxHpRpm, 6500) + 700);
  const peakHpRpm = Math.max(4500, finiteOr(car.maxHpRpm, 6500));

  const validGearCount = clamp(Math.round(gearCount), 3, 10);
  const finalDrive = 3.90;

  // Gearing spaced for mid-gear wheel speed sustain (gears 2-4 primary drift gears)
  const ratios: number[] = [];
  const topGearRatio = (peakHpRpm * circM * 60) / (targetTopSpeedKmh * 1000 * finalDrive);
  const firstGearRatio = topGearRatio * 3.3;

  for (let g = 0; g < validGearCount; g++) {
    const t = g / (validGearCount - 1);
    // Logarithmic / geometric gear step spacing
    const ratio = firstGearRatio * Math.pow(topGearRatio / firstGearRatio, t);
    ratios.push(round(ratio, 2));
  }

  const gearSpeedsKmh = ratios.map((ratio) => {
    const spd = (peakHpRpm * circM * 60) / (ratio * finalDrive * 1000);
    return round(spd, 1);
  });

  const shiftAdvice: DriftGearShiftAdvice[] = [];
  for (let g = 0; g < validGearCount - 1; g++) {
    const shiftRpm = maxRpm - 200;
    const postShiftRpm = round(shiftRpm * (ratios[g + 1] / ratios[g]));
    const shiftSpeedKmh = round((shiftRpm * circM * 60) / (ratios[g] * finalDrive * 1000), 1);
    shiftAdvice.push({
      fromGear: g + 1,
      toGear: g + 2,
      shiftRpm,
      postShiftRpm,
      shiftSpeedKmh,
      reason: 'estimated_peak_hp_prior'
    });
  }

  return {
    gearingStrategy: 'drift_wide_powerband_spacing',
    finalDrive,
    gears: ratios,
    gearCount: validGearCount,
    tireCircumferenceM: round(circM, 4),
    topSpeedAtPeakHpKmh: targetTopSpeedKmh,
    gearSpeedsKmh,
    shiftAdvice,
    spacingRatio: round(ratios[0] / ratios[validGearCount - 1], 2)
  };
}

// -----------------------------------------------------------------------------
// Primary Solver Entry Point
// -----------------------------------------------------------------------------

/**
 * Solves complete Drift Tuning Profile according to schemaVersion `tuning-profile/v1`.
 */
export function calculateDriftProfile(input: DriftProfileInput): DriftProfileOutput {
  const warnings: string[] = [];

  const validationErrors = validateDriftProfileInput(input);
  if (validationErrors.length > 0) {
    warnings.push(...validationErrors);
  }

  const car = input.car;
  const profile: DriftProfileType = input.profile ?? 'pro_drift';
  const targetDriftAngleDeg = finiteOr(input.targetDriftAngleDeg, 35);
  const angleToleranceDeg = finiteOr(input.angleToleranceDeg, 8);
  const rearDiffPreset = input.rearDiffPreset ?? 'aggressive_100_20';
  const surface = (input.surface as DevSurface) || 'tarmac';
  const targetTopSpeedKmh = finiteOr(input.targetTopSpeedKmh, 230);
  const gearCount = input.gearCount ?? (car.adjustability?.gears ? car.adjustability.gears : 6);

  if (car.drivetrain === 'FWD') {
    warnings.push('FWD drivetrain detected: Front-wheel drive is not optimal for sustained drift. RWD or AWD conversion recommended.');
  }

  if (targetDriftAngleDeg < 15) {
    warnings.push(`targetDriftAngleDeg (${targetDriftAngleDeg}°) is unusually shallow for drift tuning.`);
  } else if (targetDriftAngleDeg > 60) {
    warnings.push(`targetDriftAngleDeg (${targetDriftAngleDeg}°) is very extreme and will require maximum steering angle kit.`);
  }

  // 1. Differential Target
  const differential = calculateDriftDifferential(car, rearDiffPreset);

  // 2. Chassis Targets (Springs, Damping, ARB)
  const chassis = calculateDriftChassis(car, differential);

  // 3. Alignment & Pressures
  const alignment = calculateDriftAlignment(car, targetDriftAngleDeg);
  const pressures = calculateDriftPressures(car);

  // 4. Tire Model & Capacities
  const tireCompound = car.tireType || 'Drift';
  const basePrior = DEV_TIRE_PRIORS[tireCompound] || DEV_TIRE_PRIORS.Drift || DEV_TIRE_PRIORS.Default;
  const surfaceMultiplier = DEV_SURFACE_MULTIPLIERS[surface] || DEV_SURFACE_MULTIPLIERS.tarmac;

  const muLongitudinal = round(basePrior.muLongitudinal * surfaceMultiplier.muLongitudinal, 2);
  const muLateral = round(basePrior.muLateral * surfaceMultiplier.muLateral, 2);

  const weightN = Math.max(600, finiteOr(car.weight, 1350)) * 9.80665;
  const frontWeightRatio = clamp(finiteOr(car.weight_distribution, 53), 20, 80) / 100;
  const frontLoadPerTireN = (weightN * frontWeightRatio) / 2;
  const rearLoadPerTireN = (weightN * (1 - frontWeightRatio)) / 2;

  const frontCapacity = calculateFrictionEllipse({
    muLongitudinal,
    muLateral,
    normalForceN: frontLoadPerTireN,
    longitudinalDemandN: 0,
    lateralDemandN: 0
  });
  const rearCapacity = calculateFrictionEllipse({
    muLongitudinal,
    muLateral,
    normalForceN: rearLoadPerTireN,
    longitudinalDemandN: 0,
    lateralDemandN: 0
  });

  const tireTargets: DriftTireTargets = {
    compound: tireCompound,
    surface,
    alignment,
    pressures,
    muLongitudinal,
    muLateral,
    frictionEllipseCapacityN: {
      frontPerTireN: round(frontCapacity.maxLateralForceN, 1),
      rearPerTireN: round(rearCapacity.maxLateralForceN, 1)
    }
  };

  // 5. Gearing Target
  const gearing = calculateDriftGearing(car, targetTopSpeedKmh, gearCount);

  // 6. Telemetry Analysis (if samples provided)
  let telemetryMetrics: DriftTelemetryMetrics | undefined = undefined;
  let status: TuningProfileStatus = 'empirical-prior';
  let source: TuningProfileStatus = 'empirical-prior';

  if (input.telemetrySamples && Array.isArray(input.telemetrySamples) && input.telemetrySamples.length > 0) {
    telemetryMetrics = analyzeDriftTelemetry(
      input.telemetrySamples,
      targetDriftAngleDeg,
      angleToleranceDeg,
      input.minSpeedMps
    );

    if (telemetryMetrics) {
      status = 'estimated';
      source = 'estimated';

      if (telemetryMetrics.driftSampleCount === 0 && telemetryMetrics.validSampleCount > 0) {
        warnings.push('No telemetry samples met target drift angle tolerance window.');
      }

      if (telemetryMetrics.droppedOrOutOfOrderTimestamps > telemetryMetrics.sampleCount * 0.2) {
        warnings.push(
          `High timestamp anomaly count (${telemetryMetrics.droppedOrOutOfOrderTimestamps}/${telemetryMetrics.sampleCount}) detected in telemetry stream.`
        );
      }

      if (telemetryMetrics.lowSpeedSamplesFiltered > telemetryMetrics.sampleCount * 0.5) {
        warnings.push(
          `More than 50% of telemetry samples were filtered due to low speed (< ${input.minSpeedMps ?? 3.0} m/s).`
        );
      }
    }
  }

  return {
    schemaVersion: 'tuning-profile/v1',
    profile,
    source,
    status,
    targetDriftAngleDeg,
    angleToleranceDeg,
    rearDiffPreset,
    chassis,
    tireTargets,
    gearing,
    telemetryMetrics,
    warnings
  };
}
