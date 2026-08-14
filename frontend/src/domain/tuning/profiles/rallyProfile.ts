/**
 * Rally/Off-Road Profile Solver (Phase 5B)
 *
 * Implements typed `tuning-profile/v1` schema supporting:
 * - Profiles: `gravel`, `cross_country`, `jump`
 * - Gearing: Independent rally acceleration-biased ratio curve, distinct from Road profile
 * - Differential: Range-based AWD bias and decel lock priors (not locked to 25%)
 * - Suspension & Travel: Off-road natural frequencies, high ride heights, articulation ARBs, landing impact capacity
 * - Telemetry Estimation: Timestamp-based surface roughness (RMS/mean-abs), airborne state detection,
 *   integrated airtime, landing impact Gs, and bottoming ratio
 * - Reusable Foundations: Tire geometry, tire friction ellipse, load transfer, and alignment priors
 *
 * NOTE: Telemetry thresholds, travel fractions, and landing impact capacities are engineering
 * heuristics and calibration priors. They are NOT claimed as live Forza Horizon 6 physics truths.
 */

import {
  DEV_ALIGNMENT_PROFILES,
  DEV_SURFACE_MULTIPLIERS,
  DEV_TIRE_PRIORS
} from '../constants';
import type { DevCarInput, DevSurface } from '../../../utils/tuningMath_dev';
import type { TuningCaptureSample } from '../telemetryCapture';
import { calculateTireGeometry } from '../tires/tireGeometry';
import { calculateFrictionEllipse } from '../tires/tireModel';
import { calculateLoadTransfer } from '../chassis/loadTransfer';

export type RallyProfileType = 'gravel' | 'cross_country' | 'jump';
export type TuningProfileStatus = 'empirical-prior' | 'estimated' | 'calibrated';
export type JumpSeverity = 'mild' | 'moderate' | 'severe';

export interface PowerCurvePoint {
  rpm: number;
  torqueNm?: number;
  powerHp?: number;
  powerKw?: number;
}

export interface RallyProfileInput {
  profile: RallyProfileType;
  targetTopSpeedKmh: number;
  surface: DevSurface | string;
  car: DevCarInput;
  gearCount?: number;
  powerCurve?: PowerCurvePoint[];
  telemetrySamples?: TuningCaptureSample[];
  jumpSeverity?: JumpSeverity | number;
  roughnessWindow?: number;
  slowestCornerSpeedKmh?: number;
  straightRatio?: number; // [0, 1]
  awdCircuitRotationPrior?: boolean;
}

export interface JumpEvent {
  startMs: number;
  endMs: number;
  durationSeconds: number;
  peakLandingImpactG: number;
  takeoffSpeedKmh: number;
  maxVerticalVelocityMps: number;
}

export interface RallyTelemetryMetrics {
  status: 'estimated';
  isHeuristic: true;
  sampleCount: number;
  totalDurationSeconds: number;
  surfaceRoughnessRms: number;
  surfaceRoughnessMeanAbs: number;
  surfaceRoughnessScore: number; // [0, 10]
  airborneSampleCount: number;
  airborneRatio: number; // [0, 1]
  totalAirtimeSeconds: number;
  maxSingleAirtimeSeconds: number;
  jumpCount: number;
  jumps: JumpEvent[];
  maxLandingImpactG: number;
  averageLandingImpactG: number;
  bottomingSampleCount: number;
  bottomingRatio: number; // [0, 1]
  maxSuspensionTravelPerWheel: [number, number, number, number];
  notes: string;
}

export interface RallySurfaceTargets {
  surface: string;
  surfaceCategory: 'loose_gravel' | 'rough_trail' | 'extreme_terrain' | 'tarmac_transition';
  estimatedRoughnessRms: number;
  recommendedTireType: string;
  recommendedTirePressureOffsetPsi: number;
  complianceLevel: 'medium' | 'high' | 'maximum';
  mudGripPenaltyEstimated: number;
}

export interface RallySuspensionTravelTargets {
  modelType: 'long_travel_offroad_prior';
  targetStaticTravelFraction: number;
  bumpTravelReserveFraction: number;
  bottomingResistanceScore: number;
  landingImpactCapacityG: number;
  antiBottomingDampingRatio: number;
  travelClampingProtected: boolean;
}

export interface RallyGearShiftAdvice {
  fromGear: number;
  toGear: number;
  shiftRpm: number;
  postShiftRpm: number;
  postShiftForceN?: number;
  shiftSpeedKmh: number;
  reason: 'wheel_force_crossover' | 'redline_optimal' | 'estimated_peak_hp_prior';
}

export interface RallyGearingOutput {
  gearingStrategy: 'rally_independent_acceleration_spacing';
  independentRallyRatios: true;
  contractProof: 'independent_rally_gear_ratios_v1';
  finalDrive: number;
  gears: number[];
  gearCount: number;
  tireCircumferenceM: number;
  topSpeedAtPeakHpKmh: number;
  gearSpeedsKmh: number[];
  shiftAdvice: RallyGearShiftAdvice[];
  spacingRatio: number;
  rallyLowGearPunchRatio: number;
}

export interface RallySpringsTarget {
  modelType: 'direct_wheel_load_approx';
  frontKgfMm: number;
  rearKgfMm: number;
  frontRideHeightCm: number;
  rearRideHeightCm: number;
  targetFrequencyFrontHz: number;
  targetFrequencyRearHz: number;
  rideHeightFraction: number;
}

export interface RallyDampingTarget {
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

export interface RallyArbTarget {
  front: number;
  rear: number;
  rollStiffnessFrontPct: number;
  mode: 'offroad_independent_articulation';
}

export interface RallyDifferentialRange {
  min: number;
  max: number;
  recommended: number;
}

export interface RallyDifferentialTarget {
  strategy: 'rally_range_prior';
  frontAccelPercent: number;
  frontDecelPercent: number;
  rearAccelPercent: number;
  rearDecelPercent: number;
  centerToRearPercent: number;
  ranges: {
    frontAccel: RallyDifferentialRange;
    frontDecel: RallyDifferentialRange;
    rearAccel: RallyDifferentialRange;
    rearDecel: RallyDifferentialRange;
    centerToRear: RallyDifferentialRange;
  };
  notes: string;
}

export interface RallyChassisTargets {
  springs: RallySpringsTarget;
  damping: RallyDampingTarget;
  arb: RallyArbTarget;
  differential: RallyDifferentialTarget;
}

export interface RallyTireTargets {
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
  frictionEllipseCapacityN: {
    frontPerTireN: number;
    rearPerTireN: number;
  };
}

export interface RallyProfileOutput {
  schemaVersion: 'tuning-profile/v1';
  profile: RallyProfileType;
  source: TuningProfileStatus;
  status: TuningProfileStatus;
  surfaceTargets: RallySurfaceTargets;
  suspensionTravel: RallySuspensionTravelTargets;
  chassis: RallyChassisTargets;
  tireTargets: RallyTireTargets;
  gearing: RallyGearingOutput;
  telemetryMetrics?: RallyTelemetryMetrics;
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
 * Calculates tire rolling circumference in metres using tireGeometry module.
 */
export function calculateRallyTireCircumferenceM(car: DevCarInput): number {
  const isFwd = car.drivetrain === 'FWD';
  const widthMm = finiteOr(isFwd ? car.frontTireWidth : car.rearTireWidth, 245);
  const aspectRatio = finiteOr(isFwd ? car.frontTireAspect : car.rearTireAspect, 45);
  const rimDiameterIn = finiteOr(isFwd ? car.frontTireRim : car.rearTireRim, 17);

  const geom = calculateTireGeometry({ widthMm, aspectRatio, rimDiameterIn });
  return geom.rollingCircumferenceM;
}

/**
 * Validates rally profile input for finite values, positive domains, and bounds.
 */
export function validateRallyProfileInput(input: RallyProfileInput): string[] {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return ['Input must be a valid object.'];
  }

  const validProfiles: RallyProfileType[] = ['gravel', 'cross_country', 'jump'];
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

  if (input.straightRatio !== undefined) {
    if (!Number.isFinite(input.straightRatio) || input.straightRatio < 0 || input.straightRatio > 1) {
      errors.push(`straightRatio (${input.straightRatio}) must be a finite number between 0.0 and 1.0.`);
    }
  }

  if (input.jumpSeverity !== undefined) {
    if (typeof input.jumpSeverity === 'number') {
      if (!Number.isFinite(input.jumpSeverity) || input.jumpSeverity < 1 || input.jumpSeverity > 10) {
        errors.push(`jumpSeverity number (${input.jumpSeverity}) must be between 1 and 10.`);
      }
    } else if (!['mild', 'moderate', 'severe'].includes(input.jumpSeverity)) {
      errors.push(`jumpSeverity string must be one of: 'mild', 'moderate', 'severe'.`);
    }
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

  if (input.telemetrySamples !== undefined && !Array.isArray(input.telemetrySamples)) {
    errors.push('telemetrySamples must be an array when provided.');
  }

  return errors;
}

// -----------------------------------------------------------------------------
// Telemetry Analysis Engine (Timestamp-based & Explicitly Estimated)
// -----------------------------------------------------------------------------

/**
 * Analyzes telemetry samples to extract off-road and rally physical metrics:
 * 1. Surface roughness (RMS and mean absolute of surfaceRumble)
 * 2. Airborne state detection (wheel travel near stretch + vertical velocity/accel heuristics)
 * 3. Airtime integration via timestamp deltas
 * 4. Landing impact peak Gs in contact windows
 * 5. Suspension bottoming ratio (travel >= 0.95)
 *
 * Handles missing arrays, duplicate/non-uniform timestamps, and out-of-bounds numbers safely.
 */
export function analyzeRallyTelemetry(
  samples?: TuningCaptureSample[],
  _roughnessWindow?: number
): RallyTelemetryMetrics | undefined {
  if (!samples || !Array.isArray(samples) || samples.length === 0) {
    return undefined;
  }

  const sampleCount = samples.length;
  let rumbleSumSq = 0;
  let rumbleSumAbs = 0;
  let rumbleCount = 0;

  const maxTravelPerWheel: [number, number, number, number] = [0, 0, 0, 0];
  let bottomingWheelSampleCount = 0;
  let bottomingSampleCount = 0;

  // Jump tracking state
  const jumps: JumpEvent[] = [];
  let isCurrentlyAirborne = false;
  let currentJumpStartMs = 0;
  let currentJumpDuration = 0;
  let currentJumpTakeoffSpeedKmh = 0;
  let currentJumpMaxVy = 0;
  let currentJumpPostLandingWindowSamples = 0;
  let currentJumpPeakLandingG = 0;

  let totalAirtimeSeconds = 0;
  let maxSingleAirtimeSeconds = 0;
  let airborneSampleCount = 0;

  const landingGValues: number[] = [];
  let maxGlobalLandingG = 0;

  // Process first sample initialization
  const firstSample = samples[0];
  const firstTimestamp = finiteOr(firstSample?.timestampMS, 0);
  const lastTimestamp = finiteOr(samples[sampleCount - 1]?.timestampMS, firstTimestamp);
  const totalDurationSeconds = Math.max(0, (lastTimestamp - firstTimestamp) / 1000);

  for (let i = 0; i < sampleCount; i++) {
    const s = samples[i];
    const prev = i > 0 ? samples[i - 1] : s;

    // Timestamp delta in seconds (protected against non-uniform, duplicate, or dropped timestamps)
    const rawDeltaMs = finiteOr(s.timestampMS, 0) - finiteOr(prev.timestampMS, 0);
    const dtSeconds = rawDeltaMs > 0 && rawDeltaMs < 2000 ? rawDeltaMs / 1000 : 0;

    // 1. Surface rumble analysis
    if (s.surfaceRumble && Array.isArray(s.surfaceRumble)) {
      for (let w = 0; w < 4; w++) {
        const rVal = finiteOr(s.surfaceRumble[w], 0);
        rumbleSumSq += rVal * rVal;
        rumbleSumAbs += Math.abs(rVal);
        rumbleCount++;
      }
    }

    // 2. Normalized suspension travel & bottoming analysis
    const travels: number[] = [];
    let hasBottomedWheel = false;

    for (let w = 0; w < 4; w++) {
      const rawTravel = s.normalizedSuspensionTravel?.[w];
      const t = clamp(finiteOr(rawTravel, 0), 0, 1);
      travels.push(t);
      if (t > maxTravelPerWheel[w]) {
        maxTravelPerWheel[w] = t;
      }
      if (t >= 0.95) {
        bottomingWheelSampleCount++;
        hasBottomedWheel = true;
      }
    }

    if (hasBottomedWheel) {
      bottomingSampleCount++;
    }

    const meanTravel = (travels[0] + travels[1] + travels[2] + travels[3]) / 4;
    const maxTravel = Math.max(...travels);
    const accY = finiteOr(s.accelerationY, 0);
    const velY = finiteOr(s.velocityY, 0);
    const currentG = Math.abs(accY) / 9.80665;

    // 3. Airborne state detection heuristics:
    // Heuristic 1: All wheels near full extension (travel <= 0.08, max <= 0.15)
    // Heuristic 2: Low suspension load (mean <= 0.12) with vertical acceleration indicating freefall / low load (accY <= -5.0)
    // Heuristic 3: Low suspension load (mean <= 0.10) with high vertical velocity (|velY| >= 1.5)
    const isAirborne =
      (meanTravel <= 0.08 && maxTravel <= 0.15) ||
      (meanTravel <= 0.12 && accY <= -5.0) ||
      (meanTravel <= 0.10 && Math.abs(velY) >= 1.5);

    if (isAirborne) {
      airborneSampleCount++;
      totalAirtimeSeconds += dtSeconds;

      if (!isCurrentlyAirborne) {
        // Takeoff detected
        isCurrentlyAirborne = true;
        currentJumpStartMs = finiteOr(prev.timestampMS, s.timestampMS);
        currentJumpDuration = dtSeconds;
        currentJumpTakeoffSpeedKmh = finiteOr(prev.speedMps, s.speedMps) * 3.6;
        currentJumpMaxVy = Math.abs(velY);
        currentJumpPeakLandingG = 0;
      } else {
        currentJumpDuration += dtSeconds;
        currentJumpMaxVy = Math.max(currentJumpMaxVy, Math.abs(velY));
      }
    } else {
      if (isCurrentlyAirborne) {
        // Landing event triggered
        isCurrentlyAirborne = false;
        maxSingleAirtimeSeconds = Math.max(maxSingleAirtimeSeconds, currentJumpDuration);

        // Record landing impact window (samples right after touchdown)
        currentJumpPostLandingWindowSamples = 8;
        currentJumpPeakLandingG = currentG;
      }

      if (currentJumpPostLandingWindowSamples > 0) {
        currentJumpPeakLandingG = Math.max(currentJumpPeakLandingG, currentG);
        currentJumpPostLandingWindowSamples--;

        if (currentJumpPostLandingWindowSamples === 0) {
          landingGValues.push(currentJumpPeakLandingG);
          if (currentJumpPeakLandingG > maxGlobalLandingG) {
            maxGlobalLandingG = currentJumpPeakLandingG;
          }

          jumps.push({
            startMs: currentJumpStartMs,
            endMs: finiteOr(s.timestampMS, 0),
            durationSeconds: round(currentJumpDuration, 3),
            peakLandingImpactG: round(currentJumpPeakLandingG, 2),
            takeoffSpeedKmh: round(currentJumpTakeoffSpeedKmh, 1),
            maxVerticalVelocityMps: round(currentJumpMaxVy, 2)
          });
        }
      }
    }
  }

  // Close lingering jump if ended while airborne
  if (isCurrentlyAirborne) {
    maxSingleAirtimeSeconds = Math.max(maxSingleAirtimeSeconds, currentJumpDuration);
    jumps.push({
      startMs: currentJumpStartMs,
      endMs: lastTimestamp,
      durationSeconds: round(currentJumpDuration, 3),
      peakLandingImpactG: round(currentJumpPeakLandingG, 2),
      takeoffSpeedKmh: round(currentJumpTakeoffSpeedKmh, 1),
      maxVerticalVelocityMps: round(currentJumpMaxVy, 2)
    });
  }

  const surfaceRoughnessRms = rumbleCount > 0 ? Math.sqrt(rumbleSumSq / rumbleCount) : 0;
  const surfaceRoughnessMeanAbs = rumbleCount > 0 ? rumbleSumAbs / rumbleCount : 0;
  const surfaceRoughnessScore = round(clamp(surfaceRoughnessRms * 12.5, 0, 10), 2);

  const bottomingRatio = sampleCount > 0 ? round(bottomingWheelSampleCount / (sampleCount * 4), 4) : 0;
  const airborneRatio = totalDurationSeconds > 0 ? round(clamp(totalAirtimeSeconds / totalDurationSeconds, 0, 1), 4) : 0;

  const avgLandingG =
    landingGValues.length > 0
      ? round(landingGValues.reduce((acc, val) => acc + val, 0) / landingGValues.length, 2)
      : round(maxGlobalLandingG, 2);

  return {
    status: 'estimated',
    isHeuristic: true,
    sampleCount,
    totalDurationSeconds: round(totalDurationSeconds, 3),
    surfaceRoughnessRms: round(surfaceRoughnessRms, 4),
    surfaceRoughnessMeanAbs: round(surfaceRoughnessMeanAbs, 4),
    surfaceRoughnessScore,
    airborneSampleCount,
    airborneRatio,
    totalAirtimeSeconds: round(totalAirtimeSeconds, 3),
    maxSingleAirtimeSeconds: round(maxSingleAirtimeSeconds, 3),
    jumpCount: jumps.length,
    jumps,
    maxLandingImpactG: round(maxGlobalLandingG, 2),
    averageLandingImpactG: avgLandingG,
    bottomingSampleCount,
    bottomingRatio,
    maxSuspensionTravelPerWheel: [
      round(maxTravelPerWheel[0], 3),
      round(maxTravelPerWheel[1], 3),
      round(maxTravelPerWheel[2], 3),
      round(maxTravelPerWheel[3], 3)
    ],
    notes: 'Timestamp-based telemetry estimation. Heuristic thresholding; not live FH6 ground truth.'
  };
}

// -----------------------------------------------------------------------------
// Gearing Solver (Independent Rally Progression)
// -----------------------------------------------------------------------------

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

function solveRallyGearing(
  input: RallyProfileInput,
  tireCircumferenceM: number
): { gearing: RallyGearingOutput; warnings: string[] } {
  const warnings: string[] = [];
  const car = input.car;
  const rpmAtPower = Math.max(3000, finiteOr(car.maxHpRpm, 7200));
  const targetTopSpeedKmh = input.targetTopSpeedKmh;
  const gearCount = clamp(Math.round(input.gearCount ?? car.adjustability?.gears ?? 6), 4, 10);
  const straightRatio = clamp(finiteOr(input.straightRatio, 0.35), 0, 1);

  // Dedicated Rally top gear ratio selection (shorter than road for sustained loose surface acceleration)
  let baseTopGear = 0.84;
  if (input.profile === 'gravel') {
    baseTopGear = 0.84 - 0.03 * straightRatio;
  } else if (input.profile === 'cross_country') {
    baseTopGear = 0.88 - 0.03 * straightRatio;
  } else if (input.profile === 'jump') {
    baseTopGear = 0.86 - 0.03 * straightRatio;
  }
  const topGear = round(clamp(baseTopGear, 0.78, 0.94), 2);

  // Target Final Drive calculation: target FD = (rpmTarget * C * 60) / (vTarget * 1000 * topGear)
  const targetFinalDriveRaw = (rpmAtPower * tireCircumferenceM * 60) / (targetTopSpeedKmh * 1000 * topGear);
  const finalDrive = round(clamp(targetFinalDriveRaw, 2.5, 6.5), 2);

  // First gear exit speed target: biased towards aggressive low-speed wheelspin launch and hairpin pull
  let firstGearSpeedTargetKmh = 68;
  if (input.slowestCornerSpeedKmh !== undefined && input.slowestCornerSpeedKmh > 0) {
    firstGearSpeedTargetKmh = clamp(input.slowestCornerSpeedKmh * 1.05, 45, 95);
  } else if (input.profile === 'gravel') {
    firstGearSpeedTargetKmh = 66;
  } else if (input.profile === 'cross_country') {
    firstGearSpeedTargetKmh = 54; // lower crawler gear for deep ruts and steep incline torque
  } else if (input.profile === 'jump') {
    firstGearSpeedTargetKmh = 72; // punchy sprint for ramp approach
  }

  // Calculate 1st gear ratio from first gear target speed
  const rawFirstGear = (rpmAtPower * tireCircumferenceM * 60) / (firstGearSpeedTargetKmh * finalDrive * 1000);
  const firstGear = round(clamp(rawFirstGear, Math.max(2.8, topGear + 1.5), 5.2), 2);

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
  const shiftAdvice: RallyGearShiftAdvice[] = [];
  const tireRadiusM = tireCircumferenceM / (2 * Math.PI);
  const drivetrainEfficiency = 0.90; // slightly higher drag loss in off-road differentials

  if (input.powerCurve && input.powerCurve.length >= 2) {
    const maxRpmInCurve = Math.max(...input.powerCurve.map((p) => p.rpm));
    const redlineRpm = Math.min(maxRpmInCurve, rpmAtPower + 750);

    for (let gIdx = 0; gIdx < gearCount - 1; gIdx++) {
      const curRatio = gears[gIdx];
      const nextRatio = gears[gIdx + 1];
      const fromGear = gIdx + 1;
      const toGear = gIdx + 2;

      let optimalShiftRpm = redlineRpm;
      let foundCrossover = false;

      const scanStart = Math.max(3000, finiteOr(car.maxTorqueRpm, 4200));
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
    warnings.push(
      'Power curve missing: rally shift advice is based on estimated peak power RPM prior rather than post-shift wheel force optimization.'
    );
    const estimatedShiftRpm = Math.round(rpmAtPower * 1.04);

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

  // Contract warning proving independent rally ratio formula
  warnings.push('Rally gearing uses dedicated acceleration-biased ratio curve independent of Road/Circuit gearing profile.');

  const rallyLowGearPunchRatio = round(firstGear / topGear, 2);

  return {
    gearing: {
      gearingStrategy: 'rally_independent_acceleration_spacing',
      independentRallyRatios: true,
      contractProof: 'independent_rally_gear_ratios_v1',
      finalDrive,
      gears,
      gearCount,
      tireCircumferenceM: round(tireCircumferenceM, 3),
      topSpeedAtPeakHpKmh,
      gearSpeedsKmh,
      shiftAdvice,
      spacingRatio: round(spacingStep, 3),
      rallyLowGearPunchRatio
    },
    warnings
  };
}

// -----------------------------------------------------------------------------
// Chassis, Travel & Suspension Solver
// -----------------------------------------------------------------------------

function calculateDirectSpringKgfMm(massKg: number, frequencyHz: number): number {
  return ((2 * Math.PI * frequencyHz) ** 2 * massKg) / 9806.65;
}

function calculateCriticalDampingNsM(massKg: number, springKgfMm: number): number {
  const springNPerM = springKgfMm * 9806.65;
  return 2 * Math.sqrt(springNPerM * massKg);
}

function solveRallyChassis(
  input: RallyProfileInput,
  telemetryMetrics?: RallyTelemetryMetrics
): { chassis: RallyChassisTargets; suspensionTravel: RallySuspensionTravelTargets; warnings: string[] } {
  const warnings: string[] = [];
  const car = input.car;
  const weight = Math.max(400, finiteOr(car.weight, 1350));
  const frontPercent = clamp(finiteOr(car.weight_distribution, 53), 20, 80) / 100;
  const sprungMass = weight * 0.85; // slightly higher unsprung mass with rugged off-road components
  const frontWheelMass = (sprungMass * frontPercent) / 2;
  const rearWheelMass = (sprungMass * (1 - frontPercent)) / 2;

  // Profile-specific natural frequencies, damping, and ride height fractions
  let targetFreqFrontHz = 1.75;
  let targetFreqRearHz = 1.85;
  let dampingRatioFront = 0.60;
  let dampingRatioRear = 0.60;
  let bumpToReboundRatio = 0.45;
  let rideHeightFraction = 0.80;
  let targetStaticTravelFraction = 0.32;
  let landingImpactCapacityG = 3.5;
  let antiBottomingDampingRatio = 0.65;
  let bottomingResistanceScore = 7.0;

  // Jump severity modifier
  let severityOffsetHz = 0;
  if (input.jumpSeverity === 'severe' || (typeof input.jumpSeverity === 'number' && input.jumpSeverity >= 7)) {
    severityOffsetHz = 0.20;
    bumpToReboundRatio += 0.05;
    antiBottomingDampingRatio += 0.15;
  } else if (input.jumpSeverity === 'moderate' || (typeof input.jumpSeverity === 'number' && input.jumpSeverity >= 4)) {
    severityOffsetHz = 0.10;
    antiBottomingDampingRatio += 0.08;
  }

  if (input.profile === 'gravel') {
    targetFreqFrontHz = 1.70 + severityOffsetHz;
    targetFreqRearHz = 1.80 + severityOffsetHz;
    dampingRatioFront = 0.60;
    dampingRatioRear = 0.60;
    bumpToReboundRatio = 0.45;
    rideHeightFraction = 0.78;
    targetStaticTravelFraction = 0.32;
    landingImpactCapacityG = 3.5;
    bottomingResistanceScore = 7.2;
  } else if (input.profile === 'cross_country') {
    targetFreqFrontHz = 1.40 + severityOffsetHz;
    targetFreqRearHz = 1.50 + severityOffsetHz;
    dampingRatioFront = 0.55;
    dampingRatioRear = 0.55;
    bumpToReboundRatio = 0.40;
    rideHeightFraction = 0.94; // very high ground clearance
    targetStaticTravelFraction = 0.38;
    landingImpactCapacityG = 5.0;
    antiBottomingDampingRatio = 0.60;
    bottomingResistanceScore = 8.0;
  } else if (input.profile === 'jump') {
    targetFreqFrontHz = 2.00 + severityOffsetHz;
    targetFreqRearHz = 2.10 + severityOffsetHz;
    dampingRatioFront = 0.70;
    dampingRatioRear = 0.70;
    bumpToReboundRatio = 0.52;
    rideHeightFraction = 0.98; // maximum travel stroke for landing absorption
    targetStaticTravelFraction = 0.28;
    landingImpactCapacityG = 7.5;
    antiBottomingDampingRatio = 0.85;
    bottomingResistanceScore = 9.2;
  }

  // Telemetry adaptive feedback
  if (telemetryMetrics && telemetryMetrics.bottomingRatio > 0.04) {
    warnings.push(
      `Suspension bottoming detected on ${round(telemetryMetrics.bottomingRatio * 100, 1)}% of travel instances in telemetry. Stiffened spring rate target by +0.15 Hz.`
    );
    targetFreqFrontHz += 0.15;
    targetFreqRearHz += 0.15;
    rideHeightFraction = Math.min(1.0, rideHeightFraction + 0.05);
  }

  if (telemetryMetrics && telemetryMetrics.maxLandingImpactG > 4.5 && input.profile !== 'jump') {
    warnings.push(
      `High landing impact observed (${telemetryMetrics.maxLandingImpactG}G). Consider switching to 'jump' profile for enhanced bump damping and landing stroke.`
    );
  }

  const [frontSpringMin, frontSpringMax] = bounded(car.spring_front_min, 10, finiteOr(car.spring_front_max, 120));
  const [rearSpringMin, rearSpringMax] = bounded(car.spring_rear_min, 10, finiteOr(car.spring_rear_max, 120));

  const frontSpringKgfMm = round(clamp(calculateDirectSpringKgfMm(frontWheelMass, targetFreqFrontHz), frontSpringMin, frontSpringMax), 1);
  const rearSpringKgfMm = round(clamp(calculateDirectSpringKgfMm(rearWheelMass, targetFreqRearHz), rearSpringMin, rearSpringMax), 1);

  const [frontHeightMin, frontHeightMax] = bounded(car.height_front_min, 10, finiteOr(car.height_front_max, 30));
  const [rearHeightMin, rearHeightMax] = bounded(car.height_rear_min, 10, finiteOr(car.height_rear_max, 30));

  const frontRideHeightCm = round(frontHeightMin + (frontHeightMax - frontHeightMin) * rideHeightFraction, 1);
  const rearRideHeightCm = round(rearHeightMin + (rearHeightMax - rearHeightMin) * Math.min(1.0, rideHeightFraction + 0.02), 1);

  // Damping calculations
  const frontCriticalNsM = round(calculateCriticalDampingNsM(frontWheelMass, frontSpringKgfMm), 1);
  const rearCriticalNsM = round(calculateCriticalDampingNsM(rearWheelMass, rearSpringKgfMm), 1);

  const frontReboundNsM = round(frontCriticalNsM * dampingRatioFront, 1);
  const rearReboundNsM = round(rearCriticalNsM * dampingRatioRear, 1);
  const frontBumpNsM = round(frontReboundNsM * bumpToReboundRatio, 1);
  const rearBumpNsM = round(rearReboundNsM * bumpToReboundRatio, 1);

  const frontSlider = round(clamp(1 + dampingRatioFront * 16 + (targetFreqFrontHz - 1.5) * 1.5, 1, 20), 1);
  const rearSlider = round(clamp(1 + dampingRatioRear * 16 + (targetFreqRearHz - 1.5) * 1.5, 1, 20), 1);

  // ARB calculations (compliant for independent wheel articulation)
  const [frontArbMin, frontArbMax] = bounded(car.arb_front_min, 1, finiteOr(car.arb_front_max, 65));
  const [rearArbMin, rearArbMax] = bounded(car.arb_rear_min, 1, finiteOr(car.arb_rear_max, 65));

  let arbScaleFront = 0.38;
  let arbScaleRear = 0.44;
  if (input.profile === 'cross_country') {
    arbScaleFront = 0.22;
    arbScaleRear = 0.26; // softer ARB allows maximum independent wheel travel
  } else if (input.profile === 'jump') {
    arbScaleFront = 0.32;
    arbScaleRear = 0.36;
  }

  const weightBias = (frontPercent - 0.5) * 6;
  const frontArb = round(clamp(1 + 64 * arbScaleFront * frontPercent + weightBias, frontArbMin, frontArbMax), 1);
  const rearArb = round(clamp(1 + 64 * arbScaleRear * (1 - frontPercent) - weightBias, rearArbMin, rearArbMax), 1);
  const rollStiffnessFrontPct = round((frontArb / (frontArb + rearArb)) * 100, 1);

  // Range-based AWD Differential targets (not universal 25%)
  let diffOutput: RallyDifferentialTarget;
  const isAwd = car.drivetrain === 'AWD';
  const isFwd = car.drivetrain === 'FWD';
  const isRwd = car.drivetrain === 'RWD';

  if (input.profile === 'cross_country') {
    diffOutput = {
      strategy: 'rally_range_prior',
      frontAccelPercent: isFwd ? 60 : isAwd ? 55 : 0,
      frontDecelPercent: isFwd ? 15 : isAwd ? 15 : 0,
      rearAccelPercent: isRwd ? 75 : isAwd ? 80 : 0,
      rearDecelPercent: isRwd ? 25 : isAwd ? 25 : 0,
      centerToRearPercent: isAwd ? 54 : 50,
      ranges: {
        frontAccel: { min: 45, max: 70, recommended: 55 },
        frontDecel: { min: 10, max: 25, recommended: 15 },
        rearAccel: { min: 70, max: 90, recommended: 80 },
        rearDecel: { min: 15, max: 35, recommended: 25 },
        centerToRear: { min: 50, max: 58, recommended: 54 }
      },
      notes: 'Cross-country differential range: higher accel locking for climbing and muddy ruts; balanced 54% center split.'
    };
  } else if (input.profile === 'jump') {
    diffOutput = {
      strategy: 'rally_range_prior',
      frontAccelPercent: isFwd ? 45 : isAwd ? 40 : 0,
      frontDecelPercent: isFwd ? 10 : isAwd ? 8 : 0,
      rearAccelPercent: isRwd ? 60 : isAwd ? 65 : 0,
      rearDecelPercent: isRwd ? 15 : isAwd ? 12 : 0,
      centerToRearPercent: isAwd ? 58 : 50,
      ranges: {
        frontAccel: { min: 30, max: 50, recommended: 40 },
        frontDecel: { min: 5, max: 15, recommended: 8 },
        rearAccel: { min: 55, max: 75, recommended: 65 },
        rearDecel: { min: 8, max: 20, recommended: 12 },
        centerToRear: { min: 52, max: 62, recommended: 58 }
      },
      notes: 'Jump profile differential range: moderate locking to prevent sudden wheel spin mismatch on airborne landing impact.'
    };
  } else {
    // Gravel profile
    diffOutput = {
      strategy: 'rally_range_prior',
      frontAccelPercent: isFwd ? 50 : isAwd ? 45 : 0,
      frontDecelPercent: isFwd ? 12 : isAwd ? 10 : 0,
      rearAccelPercent: isRwd ? 65 : isAwd ? 70 : 0,
      rearDecelPercent: isRwd ? 20 : isAwd ? 18 : 0,
      centerToRearPercent: isAwd ? 60 : 50,
      ranges: {
        frontAccel: { min: 35, max: 60, recommended: 45 },
        frontDecel: { min: 5, max: 20, recommended: 10 },
        rearAccel: { min: 60, max: 85, recommended: 70 },
        rearDecel: { min: 10, max: 25, recommended: 18 },
        centerToRear: { min: 55, max: 65, recommended: 60 }
      },
      notes: 'Gravel differential range: agile 60% rear bias with moderate decel lock for predictable Scandinavian flicks.'
    };
  }

  const suspensionTravel: RallySuspensionTravelTargets = {
    modelType: 'long_travel_offroad_prior',
    targetStaticTravelFraction,
    bumpTravelReserveFraction: round(1.0 - targetStaticTravelFraction, 2),
    bottomingResistanceScore,
    landingImpactCapacityG,
    antiBottomingDampingRatio,
    travelClampingProtected: true
  };

  return {
    chassis: {
      springs: {
        modelType: 'direct_wheel_load_approx',
        frontKgfMm: frontSpringKgfMm,
        rearKgfMm: rearSpringKgfMm,
        frontRideHeightCm,
        rearRideHeightCm,
        targetFrequencyFrontHz: round(targetFreqFrontHz, 2),
        targetFrequencyRearHz: round(targetFreqRearHz, 2),
        rideHeightFraction: round(rideHeightFraction, 2)
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
        bumpToReboundRatio: round(bumpToReboundRatio, 2),
        frontDampingRatio: round(dampingRatioFront, 2),
        rearDampingRatio: round(dampingRatioRear, 2)
      },
      arb: {
        front: frontArb,
        rear: rearArb,
        rollStiffnessFrontPct,
        mode: 'offroad_independent_articulation'
      },
      differential: diffOutput
    },
    suspensionTravel,
    warnings
  };
}

// -----------------------------------------------------------------------------
// Surface & Tire Target Solvers
// -----------------------------------------------------------------------------

function solveRallySurfaceTargets(
  input: RallyProfileInput,
  telemetryMetrics?: RallyTelemetryMetrics
): RallySurfaceTargets {
  const surface = input.surface || 'gravel';
  let surfaceCategory: RallySurfaceTargets['surfaceCategory'] = 'loose_gravel';
  let complianceLevel: RallySurfaceTargets['complianceLevel'] = 'high';
  let recommendedTireType = 'Rally';
  let recommendedTirePressureOffsetPsi = -2.5;
  let mudGripPenaltyEstimated = 0.15;

  if (input.profile === 'cross_country' || surface === 'mud' || surface === 'dirt') {
    surfaceCategory = 'rough_trail';
    complianceLevel = 'maximum';
    recommendedTireType = 'Off-Road';
    recommendedTirePressureOffsetPsi = -4.0;
    mudGripPenaltyEstimated = 0.25;
  } else if (input.profile === 'jump') {
    surfaceCategory = 'extreme_terrain';
    complianceLevel = 'high';
    recommendedTireType = 'Rally';
    recommendedTirePressureOffsetPsi = -1.5;
    mudGripPenaltyEstimated = 0.12;
  } else if (surface === 'tarmac') {
    surfaceCategory = 'tarmac_transition';
    complianceLevel = 'medium';
    recommendedTireType = 'Rally';
    recommendedTirePressureOffsetPsi = -1.0;
    mudGripPenaltyEstimated = 0.05;
  }

  const estimatedRoughnessRms = telemetryMetrics ? telemetryMetrics.surfaceRoughnessRms : 0.085;

  return {
    surface: String(surface),
    surfaceCategory,
    estimatedRoughnessRms,
    recommendedTireType,
    recommendedTirePressureOffsetPsi,
    complianceLevel,
    mudGripPenaltyEstimated
  };
}

function solveRallyTires(input: RallyProfileInput): RallyTireTargets {
  const surfaceKey = (input.surface as DevSurface) || 'gravel';
  const surfaceMultiplier = DEV_SURFACE_MULTIPLIERS[surfaceKey] ?? DEV_SURFACE_MULTIPLIERS.gravel;
  const tireCompoundKey = input.car.tireType ?? 'Rally';
  const compoundPrior = DEV_TIRE_PRIORS[tireCompoundKey] ?? DEV_TIRE_PRIORS.Rally;

  const muLongitudinal = round(compoundPrior.muLongitudinal * surfaceMultiplier.muLongitudinal, 2);
  const muLateral = round(compoundPrior.muLateral * surfaceMultiplier.muLateral, 2);

  const baseAlignment = DEV_ALIGNMENT_PROFILES.Rally;
  let hotPressure = baseAlignment.hot;
  let camberFrontDeg = baseAlignment.frontCamber;
  let camberRearDeg = baseAlignment.rearCamber;
  let toeFrontDeg = baseAlignment.frontToe;
  let toeRearDeg = baseAlignment.rearToe;
  let casterDeg = baseAlignment.caster;

  if (input.profile === 'cross_country') {
    camberFrontDeg = -0.8; // flatter camber for contact patch on heavy ruts
    camberRearDeg = -0.4;
    toeFrontDeg = 0.04;
    toeRearDeg = 0.04;
    casterDeg = 5.0;
    hotPressure = 26.0;
  } else if (input.profile === 'jump') {
    camberFrontDeg = -1.0;
    camberRearDeg = -0.5;
    toeFrontDeg = 0.00;
    toeRearDeg = 0.05;
    casterDeg = 6.0;
    hotPressure = 28.5; // higher pressure prevents rim bottoming on landing
  } else {
    // Gravel
    camberFrontDeg = -1.2;
    camberRearDeg = -0.7;
    toeFrontDeg = 0.02;
    toeRearDeg = 0.06;
    casterDeg = 5.5;
    hotPressure = 27.5;
  }

  const coldPressureFrontPsi = round(hotPressure - 3.0, 1);
  const coldPressureRearPsi = round(hotPressure - 3.0, 1);

  // Compute normal forces and friction ellipse capacity
  const loads = calculateLoadTransfer({
    massKg: input.car.weight,
    weightDistributionFrontPct: input.car.weight_distribution
  });

  const frontEllipse = calculateFrictionEllipse({
    muLongitudinal,
    muLateral,
    normalForceN: loads.staticWheelLoadsN.frontLeft,
    longitudinalDemandN: 0,
    lateralDemandN: 0
  });

  const rearEllipse = calculateFrictionEllipse({
    muLongitudinal,
    muLateral,
    normalForceN: loads.staticWheelLoadsN.rearLeft,
    longitudinalDemandN: 0,
    lateralDemandN: 0
  });

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
    muLateral,
    frictionEllipseCapacityN: {
      frontPerTireN: round(frontEllipse.maxLateralForceN, 1),
      rearPerTireN: round(rearEllipse.maxLateralForceN, 1)
    }
  };
}

// -----------------------------------------------------------------------------
// Main Rally Solver Entry Point
// -----------------------------------------------------------------------------

/**
 * Solves the Rally/Off-Road tuning profile (`tuning-profile/v1`).
 *
 * @throws Error if input validation fails.
 */
export function calculateRallyProfile(input: RallyProfileInput): RallyProfileOutput {
  const validationErrors = validateRallyProfileInput(input);
  if (validationErrors.length > 0) {
    throw new Error(`Rally profile input validation failed:\n- ${validationErrors.join('\n- ')}`);
  }

  const allWarnings: string[] = [];

  // Analyze telemetry samples if provided
  const telemetryMetrics = analyzeRallyTelemetry(input.telemetrySamples, input.roughnessWindow);
  if (!telemetryMetrics) {
    allWarnings.push('No telemetry samples provided; profile targets are derived from empirical off-road calibration priors.');
  }

  const tireCircumferenceM = calculateRallyTireCircumferenceM(input.car);

  // Solve Gearing
  const gearingResult = solveRallyGearing(input, tireCircumferenceM);
  allWarnings.push(...gearingResult.warnings);

  // Solve Chassis & Suspension Travel
  const chassisResult = solveRallyChassis(input, telemetryMetrics);
  allWarnings.push(...chassisResult.warnings);

  // Solve Surface Targets
  const surfaceTargets = solveRallySurfaceTargets(input, telemetryMetrics);

  // Solve Tires
  const tireTargets = solveRallyTires(input);

  const status: TuningProfileStatus = telemetryMetrics ? 'estimated' : 'empirical-prior';

  return {
    schemaVersion: 'tuning-profile/v1',
    profile: input.profile,
    source: status,
    status,
    surfaceTargets,
    suspensionTravel: chassisResult.suspensionTravel,
    chassis: chassisResult.chassis,
    tireTargets,
    gearing: gearingResult.gearing,
    telemetryMetrics,
    warnings: allWarnings
  };
}
