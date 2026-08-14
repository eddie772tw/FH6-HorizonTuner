/**
 * Quasi-Static Load Transfer and Normal Force Estimation Foundation (Phase 4B).
 *
 * Provides pure mathematical functions to calculate static axle/wheel loads,
 * signed longitudinal load transfer (m * ax * hCG / L), signed lateral load
 * transfer (m * ay * hCG / track) with configurable or default 50/50 roll stiffness
 * distribution, and resulting dynamic normal loads (Fz) per wheel.
 *
 * SIGN CONVENTIONS:
 * - Longitudinal acceleration (ax > 0, forward throttle/acceleration):
 *   Transfers load rearward (front wheels lose vertical load, rear wheels gain load).
 *   Longitudinal deceleration (ax < 0, braking):
 *   Transfers load forward (front wheels gain load, rear wheels lose load).
 * - Lateral acceleration (ay > 0, cornering with rightward load shift):
 *   Transfers load to the right-side wheels (left wheels lose load, right wheels gain load).
 *   Lateral acceleration (ay < 0, cornering with leftward load shift):
 *   Transfers load to the left-side wheels (right wheels lose load, left wheels gain load).
 *
 * NON-NEGATIVE CLAMPING & LIFT:
 * - Dynamic normal forces on physical tires cannot be negative (Fz >= 0).
 * - Clamping is applied to prevent unphysical tension. When clamping occurs (wheel lift),
 *   the `isClamped` flag is set, offending wheels are listed in `clampedWheels`,
 *   and a warning is recorded. Unclamped theoretical loads are preserved in `unclampedWheelLoadsN`.
 *
 * NOTE: All calculated forces are quasi-static calibration priors / estimates.
 * They must NOT be treated or claimed as live in-game calibrated ground truth.
 */

export interface WheelLoadsN {
  frontLeft: number;
  frontRight: number;
  rearLeft: number;
  rearRight: number;
}

export interface AxleLoadsN {
  front: number;
  rear: number;
  total: number;
}

export interface LoadTransferDetails {
  /** Signed longitudinal load transfer (N). Positive = load transferred rearward. */
  longitudinalTransferN: number;
  /** Signed lateral load transfer on front axle (N). Positive = load transferred rightward. */
  lateralTransferFrontN: number;
  /** Signed lateral load transfer on rear axle (N). Positive = load transferred rightward. */
  lateralTransferRearN: number;
  /** Total signed lateral load transfer across both axles (N). Positive = rightward. */
  lateralTransferTotalN: number;
}

export interface LoadTransferInput {
  /** Total vehicle mass in kg (e.g. 1500) */
  massKg?: number;
  /** Front weight distribution percentage [0..100] (e.g. 54 for 54% front) */
  weightDistributionFrontPct?: number;
  /** Wheelbase in meters (e.g. 2.65) */
  wheelbaseM?: number;
  /** Center of gravity height above ground in meters (e.g. 0.48) */
  cgHeightM?: number;
  /** Front track width in meters (e.g. 1.55) */
  trackFrontM?: number;
  /** Rear track width in meters (e.g. 1.55) */
  trackRearM?: number;
  /** Single fallback track width in meters if front/rear not specified */
  trackWidthM?: number;
  /** Longitudinal acceleration in m/s^2 (+ = forward acceleration -> rearward load transfer) */
  accelLongitudinalMPerS2?: number;
  /** Lateral acceleration in m/s^2 (+ = rightward load transfer) */
  accelLateralMPerS2?: number;
  /** Longitudinal acceleration in G (+ = forward acceleration -> rearward load transfer) */
  accelLongitudinalG?: number;
  /** Lateral acceleration in G (+ = rightward load transfer) */
  accelLateralG?: number;
  /** Front lateral roll stiffness distribution percentage [0..100] (default: 50% for 50/50 prior) */
  rollStiffnessDistributionFrontPct?: number;
  /** Gravitational acceleration constant in m/s^2 (default: 9.80665) */
  gravityMPerS2?: number;
}

export interface LoadTransferOutput {
  /** Static normal loads by axle (N) */
  staticAxleLoadsN: AxleLoadsN;
  /** Static normal loads per individual wheel (N), assuming left-right symmetry */
  staticWheelLoadsN: WheelLoadsN;
  /** Clamped dynamic normal loads per wheel (N), guaranteed >= 0 */
  dynamicWheelLoadsN: WheelLoadsN;
  /** Clamped dynamic normal loads by axle (N) */
  dynamicAxleLoadsN: AxleLoadsN;
  /** Detailed signed load transfer components (N) */
  transfersN: LoadTransferDetails;
  /** Unclamped dynamic normal loads per wheel (N), before non-negative clamping */
  unclampedWheelLoadsN: WheelLoadsN;
  /** True if any wheel experienced lift / saturation requiring non-negative clamping */
  isClamped: boolean;
  /** Array of wheel identifiers that were clamped to 0 N */
  clampedWheels: ('frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight')[];
  /** Execution and prior metadata */
  metadata: {
    source: 'quasi-static-load-transfer/v1';
    rollStiffnessDistributionFrontPct: number;
    effectiveWheelbaseM: number;
    effectiveTrackFrontM: number;
    effectiveTrackRearM: number;
    effectiveCgHeightM: number;
    accelLongitudinalMPerS2: number;
    accelLateralMPerS2: number;
    totalMassKg: number;
    gravityMPerS2: number;
  };
  /** Warning messages explaining fallbacks or non-linear saturation */
  warnings: string[];
}

const DEFAULT_MASS_KG = 1500;
const DEFAULT_WEIGHT_DIST_FRONT = 50;
const DEFAULT_WHEELBASE_M = 2.60;
const DEFAULT_CG_HEIGHT_M = 0.50;
const DEFAULT_TRACK_M = 1.60;
const DEFAULT_ROLL_STIFFNESS_FRONT_PCT = 50.0;
const DEFAULT_GRAVITY_M_PER_S2 = 9.80665;

const clamp = (val: number, min: number, max: number): number => Math.min(max, Math.max(min, val));
const round = (val: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(val * factor) / factor;
};

/**
 * Pure calculation of quasi-static vehicle load transfer and dynamic wheel normal forces.
 */
export function calculateLoadTransfer(input?: LoadTransferInput): LoadTransferOutput {
  const warnings: string[] = [];

  // 1. Gravitational acceleration
  const g = Number.isFinite(input?.gravityMPerS2) && (input?.gravityMPerS2 as number) > 0
    ? (input?.gravityMPerS2 as number)
    : DEFAULT_GRAVITY_M_PER_S2;

  // 2. Mass guard
  let massKg = input?.massKg;
  if (!Number.isFinite(massKg) || (massKg as number) <= 0) {
    massKg = DEFAULT_MASS_KG;
    warnings.push(`Invalid vehicle mass '${input?.massKg}'; fallback to default ${DEFAULT_MASS_KG} kg.`);
  } else if ((massKg as number) < 300 || (massKg as number) > 6000) {
    const clampedMass = clamp(massKg as number, 300, 6000);
    warnings.push(`Vehicle mass ${massKg} kg clamped to realistic range [300, 6000] kg (${clampedMass} kg).`);
    massKg = clampedMass;
  }

  // 3. Weight distribution guard
  let weightDistFront = input?.weightDistributionFrontPct;
  if (!Number.isFinite(weightDistFront)) {
    weightDistFront = DEFAULT_WEIGHT_DIST_FRONT;
    warnings.push(`Invalid front weight distribution '${input?.weightDistributionFrontPct}'; fallback to ${DEFAULT_WEIGHT_DIST_FRONT}%.`);
  } else if ((weightDistFront as number) < 10 || (weightDistFront as number) > 90) {
    const clampedDist = clamp(weightDistFront as number, 10, 90);
    warnings.push(`Weight distribution ${weightDistFront}% clamped to [10, 90]% (${clampedDist}%).`);
    weightDistFront = clampedDist;
  }
  const frontMassFraction = weightDistFront / 100;
  const rearMassFraction = 1 - frontMassFraction;

  // 4. Wheelbase guard
  let wheelbaseM = input?.wheelbaseM;
  if (!Number.isFinite(wheelbaseM) || (wheelbaseM as number) <= 0) {
    wheelbaseM = DEFAULT_WHEELBASE_M;
    warnings.push(`Invalid wheelbase '${input?.wheelbaseM}'; fallback to default ${DEFAULT_WHEELBASE_M} m.`);
  } else if ((wheelbaseM as number) < 1.0 || (wheelbaseM as number) > 5.0) {
    const clampedWb = clamp(wheelbaseM as number, 1.0, 5.0);
    warnings.push(`Wheelbase ${wheelbaseM} m clamped to [1.0, 5.0] m (${clampedWb} m).`);
    wheelbaseM = clampedWb;
  }

  // 5. CG height guard
  let cgHeightM = input?.cgHeightM;
  if (!Number.isFinite(cgHeightM) || (cgHeightM as number) <= 0) {
    cgHeightM = DEFAULT_CG_HEIGHT_M;
    warnings.push(`Invalid CG height '${input?.cgHeightM}'; fallback to default ${DEFAULT_CG_HEIGHT_M} m.`);
  } else if ((cgHeightM as number) < 0.1 || (cgHeightM as number) > 1.5) {
    const clampedCg = clamp(cgHeightM as number, 0.1, 1.5);
    warnings.push(`CG height ${cgHeightM} m clamped to [0.1, 1.5] m (${clampedCg} m).`);
    cgHeightM = clampedCg;
  }

  // 6. Track widths guard
  const rawTrackFront = input?.trackFrontM ?? input?.trackWidthM;
  let trackFrontM: number;
  if (!Number.isFinite(rawTrackFront) || (rawTrackFront as number) <= 0) {
    trackFrontM = DEFAULT_TRACK_M;
    warnings.push(`Invalid front track '${rawTrackFront}'; fallback to default ${DEFAULT_TRACK_M} m.`);
  } else if ((rawTrackFront as number) < 0.8 || (rawTrackFront as number) > 3.0) {
    trackFrontM = clamp(rawTrackFront as number, 0.8, 3.0);
    warnings.push(`Front track ${rawTrackFront} m clamped to [0.8, 3.0] m (${trackFrontM} m).`);
  } else {
    trackFrontM = rawTrackFront as number;
  }

  const rawTrackRear = input?.trackRearM ?? input?.trackWidthM;
  let trackRearM: number;
  if (!Number.isFinite(rawTrackRear) || (rawTrackRear as number) <= 0) {
    trackRearM = DEFAULT_TRACK_M;
    warnings.push(`Invalid rear track '${rawTrackRear}'; fallback to default ${DEFAULT_TRACK_M} m.`);
  } else if ((rawTrackRear as number) < 0.8 || (rawTrackRear as number) > 3.0) {
    trackRearM = clamp(rawTrackRear as number, 0.8, 3.0);
    warnings.push(`Rear track ${rawTrackRear} m clamped to [0.8, 3.0] m (${trackRearM} m).`);
  } else {
    trackRearM = rawTrackRear as number;
  }

  // 7. Lateral roll stiffness distribution guard
  let rollDistFront = input?.rollStiffnessDistributionFrontPct;
  if (!Number.isFinite(rollDistFront)) {
    rollDistFront = DEFAULT_ROLL_STIFFNESS_FRONT_PCT;
  } else if ((rollDistFront as number) < 5 || (rollDistFront as number) > 95) {
    const clampedRoll = clamp(rollDistFront as number, 5, 95);
    warnings.push(`Roll stiffness distribution ${rollDistFront}% clamped to [5, 95]% (${clampedRoll}%).`);
    rollDistFront = clampedRoll;
  }
  const rollFractionFront = rollDistFront / 100;
  const rollFractionRear = 1 - rollFractionFront;

  // 8. Accelerations resolution (m/s^2 preferred over G)
  let ax = 0;
  if (Number.isFinite(input?.accelLongitudinalMPerS2)) {
    ax = input?.accelLongitudinalMPerS2 as number;
  } else if (Number.isFinite(input?.accelLongitudinalG)) {
    ax = (input?.accelLongitudinalG as number) * g;
  }

  let ay = 0;
  if (Number.isFinite(input?.accelLateralMPerS2)) {
    ay = input?.accelLateralMPerS2 as number;
  } else if (Number.isFinite(input?.accelLateralG)) {
    ay = (input?.accelLateralG as number) * g;
  }

  // -------------------------------------------------------------
  // PURE PHYSICS CALCULATIONS
  // -------------------------------------------------------------

  // Total static vertical force (N)
  const totalStaticLoadN = massKg * g;
  const staticFrontAxleN = totalStaticLoadN * frontMassFraction;
  const staticRearAxleN = totalStaticLoadN * rearMassFraction;

  const staticFL = staticFrontAxleN / 2;
  const staticFR = staticFrontAxleN / 2;
  const staticRL = staticRearAxleN / 2;
  const staticRR = staticRearAxleN / 2;

  // Longitudinal Load Transfer: deltaFz_long = (m * ax * hCG) / L
  // Positive ax -> transfers load from front to rear.
  const deltaFzLongitudinalN = (massKg * ax * cgHeightM) / wheelbaseM;
  const deltaFzLongPerFrontWheel = deltaFzLongitudinalN / 2;
  const deltaFzLongPerRearWheel = deltaFzLongitudinalN / 2;

  // Lateral Load Transfer:
  // deltaFz_lat_front = (m * ay * hCG * rollFractionFront) / trackFrontM
  // deltaFz_lat_rear  = (m * ay * hCG * rollFractionRear)  / trackRearM
  // Positive ay -> transfers load from left to right.
  const deltaFzLateralFrontN = (massKg * ay * cgHeightM * rollFractionFront) / trackFrontM;
  const deltaFzLateralRearN = (massKg * ay * cgHeightM * rollFractionRear) / trackRearM;
  const deltaFzLateralTotalN = deltaFzLateralFrontN + deltaFzLateralRearN;

  // Dynamic unclamped wheel normal loads:
  // FL: loses longitudinal on accel (-), loses lateral on rightward shift (-)
  // FR: loses longitudinal on accel (-), gains lateral on rightward shift (+)
  // RL: gains longitudinal on accel (+), loses lateral on rightward shift (-)
  // RR: gains longitudinal on accel (+), gains lateral on rightward shift (+)
  const unclampedFL = staticFL - deltaFzLongPerFrontWheel - deltaFzLateralFrontN;
  const unclampedFR = staticFR - deltaFzLongPerFrontWheel + deltaFzLateralFrontN;
  const unclampedRL = staticRL + deltaFzLongPerRearWheel - deltaFzLateralRearN;
  const unclampedRR = staticRR + deltaFzLongPerRearWheel + deltaFzLateralRearN;

  // Non-negative clamping for physical ground contact
  const clampedWheels: ('frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight')[] = [];
  if (unclampedFL < 0) clampedWheels.push('frontLeft');
  if (unclampedFR < 0) clampedWheels.push('frontRight');
  if (unclampedRL < 0) clampedWheels.push('rearLeft');
  if (unclampedRR < 0) clampedWheels.push('rearRight');

  const isClamped = clampedWheels.length > 0;
  if (isClamped) {
    warnings.push(`Wheel lift detected on [${clampedWheels.join(', ')}]; normal load clamped to 0 N.`);
  }

  const dynamicFL = Math.max(0, unclampedFL);
  const dynamicFR = Math.max(0, unclampedFR);
  const dynamicRL = Math.max(0, unclampedRL);
  const dynamicRR = Math.max(0, unclampedRR);

  const dynamicFrontAxleN = dynamicFL + dynamicFR;
  const dynamicRearAxleN = dynamicRL + dynamicRR;
  const dynamicTotalLoadN = dynamicFrontAxleN + dynamicRearAxleN;

  return {
    staticAxleLoadsN: {
      front: round(staticFrontAxleN, 2),
      rear: round(staticRearAxleN, 2),
      total: round(totalStaticLoadN, 2)
    },
    staticWheelLoadsN: {
      frontLeft: round(staticFL, 2),
      frontRight: round(staticFR, 2),
      rearLeft: round(staticRL, 2),
      rearRight: round(staticRR, 2)
    },
    dynamicWheelLoadsN: {
      frontLeft: round(dynamicFL, 2),
      frontRight: round(dynamicFR, 2),
      rearLeft: round(dynamicRL, 2),
      rearRight: round(dynamicRR, 2)
    },
    dynamicAxleLoadsN: {
      front: round(dynamicFrontAxleN, 2),
      rear: round(dynamicRearAxleN, 2),
      total: round(dynamicTotalLoadN, 2)
    },
    transfersN: {
      longitudinalTransferN: round(deltaFzLongitudinalN, 2),
      lateralTransferFrontN: round(deltaFzLateralFrontN, 2),
      lateralTransferRearN: round(deltaFzLateralRearN, 2),
      lateralTransferTotalN: round(deltaFzLateralTotalN, 2)
    },
    unclampedWheelLoadsN: {
      frontLeft: round(unclampedFL, 2),
      frontRight: round(unclampedFR, 2),
      rearLeft: round(unclampedRL, 2),
      rearRight: round(unclampedRR, 2)
    },
    isClamped,
    clampedWheels,
    metadata: {
      source: 'quasi-static-load-transfer/v1',
      rollStiffnessDistributionFrontPct: round(rollDistFront, 2),
      effectiveWheelbaseM: round(wheelbaseM, 3),
      effectiveTrackFrontM: round(trackFrontM, 3),
      effectiveTrackRearM: round(trackRearM, 3),
      effectiveCgHeightM: round(cgHeightM, 3),
      accelLongitudinalMPerS2: round(ax, 3),
      accelLateralMPerS2: round(ay, 3),
      totalMassKg: round(massKg, 1),
      gravityMPerS2: round(g, 5)
    },
    warnings
  };
}
