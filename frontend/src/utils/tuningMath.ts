import { getTireCoefficient } from './tireCoefficients';
import { isAeroAxleAdjustable } from './aeroAdjustability';

/** Existing car profiles and dyno imports persist torque in lb-ft. */
export const profileTorqueToNm = (lbft: number): number => lbft * 1.35582;
export const torqueNmToProfile = (nm: number): number => nm / 1.35582;

/** Convert at the profile/solver boundary without mutating persisted data. */
export function toTuningCarParams<T extends TuningCarParams>(profile: T): T {
  return { ...profile, maxTorque: profileTorqueToNm(profile.maxTorque) };
}

/**
 * Interface representing vehicle parameters used for tuning calculation.
 */
export interface TuningCarParams {
  weight: number; // in kg
  weight_distribution: number; // front weight percentage (0-100)
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  induction?: 'NA' | 'Supercharger' | 'Turbo' | 'TwinTurbo';
  maxHp: number;
  maxTorque: number; // N·m in solver inputs; persisted car profiles use lb-ft
  maxHpRpm: number;
  maxTorqueRpm: number;
  aeroBalance?: number;
  aeroEfficiency?: number;
  mechBalance?: number;
  aero_downforce_front?: number;
  aero_downforce_rear?: number;
  frontTireWidth?: number;
  frontTireAspect?: number;
  frontTireRim?: number;
  rearTireWidth?: number;
  rearTireAspect?: number;
  rearTireRim?: number;
  tireType?: string;
  adjustability?: {
    gearbox?: 'Fixed' | 'FinalDrive' | 'Full';
    gears?: number;
    suspension?: string;
    arb?: string;
    aero?: string;
    brakes?: string;
    diff?: string;
  };
  // Suspension & Ride Height Limits for Safety Clamping
  spring_front_min?: number; // kgf/mm
  spring_front_max?: number;
  spring_rear_min?: number;
  spring_rear_max?: number;
  height_front_min?: number; // cm
  height_front_max?: number;
  height_rear_min?: number;
  height_rear_max?: number;
}

export type Drivetrain = 'RWD' | 'AWD' | 'FWD';
export type RaceType = 'Road' | 'Rally' | 'Drag' | 'Drift';

export interface GearingResult {
  finalDrive: number;
  gears: number[];
  targetFit?: {
    status: 'matched' | 'limited' | 'invalid';
    achievedSpeedKmh?: number;
  };
}

export interface ChassisTuningResult {
  arb: {
    front: number;
    rear: number;
  };
  springs: {
    front: number; // kgf/mm
    rear: number;  // kgf/mm
    heightF: number; // cm
    heightR: number; // cm
  };
  damping: {
    reboundF: number;
    reboundR: number;
    bumpF: number;
    bumpR: number;
  };
  diff: {
    accelF: number;
    decelF: number;
    accelR: number;
    decelR: number;
    centerRear: number; // % to rear
  };
}

/**
 * Calculates top vehicle speed for a specific gear at a given engine RPM.
 * 
 * @param rpm Engine speed in RPM
 * @param gearRatio Gear ratio
 * @param finalDrive Final drive ratio
 * @param tireRadiusM Effective tire radius in meters (default 0.32m)
 * @returns Speed in meters per second (m/s)
 */
export function calcGearSpeed(
  rpm: number,
  gearRatio: number,
  finalDrive: number,
  tireRadiusM = 0.32
): number {
  if (gearRatio <= 0 || finalDrive <= 0) return 0;
  return (rpm * 2 * Math.PI * tireRadiusM) / (gearRatio * finalDrive * 60);
}

/**
 * Calculates required engine RPM for a target speed in a specific gear.
 * 
 * @param speedMs Speed in meters per second (m/s)
 * @param gearRatio Gear ratio
 * @param finalDrive Final drive ratio
 * @param tireRadiusM Effective tire radius in meters (default 0.32m)
 * @returns Engine RPM
 */
export function calcGearRpm(
  speedMs: number,
  gearRatio: number,
  finalDrive: number,
  tireRadiusM = 0.32
): number {
  if (tireRadiusM <= 0) return 0;
  return (speedMs * gearRatio * finalDrive * 60) / (2 * Math.PI * tireRadiusM);
}

export interface GearingSecondaryCorrection {
  simulatedTopSpeed?: number; // Simulated/Theoretical top speed from initial gearing (km/h)
  softMaxSpeed?: number;      // Transmission preview soft max speed limit cap (km/h)
  targetSpeedKmh?: number; // Explicit event target, not the graph axis or a capability estimate.
  targetRpm?: number; // Engine RPM at the requested speed in the highest active gear.
}


export type GearingCorrectionMode = 'automatic' | 'event' | 'legacy';
export function resolveWorkflowGearingCorrection(input: GearingSecondaryCorrection & { correctionMode?: GearingCorrectionMode }): GearingSecondaryCorrection | undefined {
  if (input.correctionMode === 'event') return { targetSpeedKmh: input.targetSpeedKmh, targetRpm: input.targetRpm };
  if (input.correctionMode === 'legacy') return { simulatedTopSpeed: input.simulatedTopSpeed, softMaxSpeed: input.softMaxSpeed };
  return undefined;
}
/** Nominal driven-tire geometry; AWD uses rear geometry as the existing AEGO convention. */
export function getGearingTireRadius(carParams: TuningCarParams | null): number {
  const front = carParams?.drivetrain === 'FWD';
  const positive = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) && value! > 0 ? value! : fallback;
  const width = positive(front ? carParams?.frontTireWidth : carParams?.rearTireWidth, 245);
  const aspect = positive(front ? carParams?.frontTireAspect : carParams?.rearTireAspect, 40);
  const rim = positive(front ? carParams?.frontTireRim : carParams?.rearTireRim, 18);
  return (2 * width * aspect / 100 + rim * 25.4) / 2000;
}

const AEGO_FINAL_DRIVE_MIN = 2.0;
const AEGO_FINAL_DRIVE_MAX = 6.1;

/**
 * Returns the golden target top gear ratio anchor for a given gear count.
 * Aligns baseline gearing toward lower/moderate final drives and higher individual gear ratios.
 */
export function getTargetTopGearRatio(numGears: number): number {
  if (numGears <= 3) return 1.00;
  if (numGears === 4) return 0.88;
  if (numGears === 5) return 0.78;
  if (numGears === 6) return 0.72;
  if (numGears === 7) return 0.67;
  if (numGears === 8) return 0.63;
  if (numGears === 9) return 0.60;
  return 0.58;
}

/**
 * AEGO (Adaptive Envelope & Gearing Optimization) Algorithm
 * Generates gearing priors for different race goals; empirical speed and grip
 * constants are not a calibrated FH6 power/traction model.
 * Supports secondary correction based on in-game simulated top speed & soft cap.
 */
export function calculateAEGOGearing(
  raceGoal: string,
  numGears: number,
  carParams: TuningCarParams | null,
  maxRpm: number,
  secondaryCorrection?: GearingSecondaryCorrection
): GearingResult {
  return calculateGearingFromRadius(raceGoal, numGears, carParams, maxRpm,
    getGearingTireRadius(carParams), secondaryCorrection);
}

/** Forward-only dependency: nominal tire geometry is resolved before gearing. */
export function calculateGearingFromRadius(
  raceGoal: string,
  numGears: number,
  carParams: TuningCarParams | null,
  maxRpm: number,
  tireRadiusM: number,
  secondaryCorrection?: GearingSecondaryCorrection
): GearingResult {
  numGears = Number.isFinite(numGears) ? Math.max(1, Math.min(10, Math.trunc(numGears))) : 6;
  maxRpm = Number.isFinite(maxRpm) && maxRpm > 0 ? maxRpm : 8000;
  // 1. Fallback & Default Parameters Setup
  const weight = (carParams && carParams.weight > 0) ? carParams.weight : 1400; // kg
  const drivetrain: Drivetrain = (carParams && carParams.drivetrain) ? carParams.drivetrain : 'RWD';
  const maxHp = (carParams && carParams.maxHp > 0) ? carParams.maxHp : 300; // HP
  
  // Estimate maxTorque if not present
  let maxTorque = (carParams && carParams.maxTorque > 0) ? carParams.maxTorque : 0; // N-m
  const rpmHp = (carParams && carParams.maxHpRpm > 0) ? carParams.maxHpRpm : maxRpm * 0.85;
  const rpmT = (carParams && carParams.maxTorqueRpm > 0) ? carParams.maxTorqueRpm : maxRpm * 0.6;

  if (maxTorque === 0) {
    maxTorque = (maxHp * 7021.5) / rpmT; // Approximation in Nm
  }

  // Advanced variables
  const engineType = carParams?.induction ?? 'NA';
  const tireType = carParams?.tireType;

  // Determine active tire size based on drivetrain
  // Tire Circumference (m)
  const C = 2 * Math.PI * tireRadiusM;
  const hasEventTarget = secondaryCorrection?.targetSpeedKmh !== undefined || secondaryCorrection?.targetRpm !== undefined;

  const fDrive = drivetrain === 'AWD' ? 1.0 : (drivetrain === 'RWD' ? 0.6 : 0.4);
  const fTire = getTireCoefficient(tireType);
  const fGrip = fTire;

  let fd = 0;
  let gears: number[] = [];

  if (raceGoal === 'Drift') {
    // Drift Profile
    const rRpm = rpmT / rpmHp;
    let dDrift = 0;
    if (engineType === 'Turbo') dDrift = Math.max(rRpm, 0.75);
    else if (engineType === 'TwinTurbo') dDrift = Math.max(rRpm, 0.65);
    else if (engineType === 'Supercharger') dDrift = Math.max(rRpm, 0.55);
    else dDrift = Math.max(rRpm, 0.82); // NA

    const calcGears = Math.min(4, numGears);
    gears = new Array(numGears).fill(0.5); // Fallback defaults
    gears[calcGears - 1] = 1.0;
    for (let i = calcGears - 2; i >= 0; i--) {
      gears[i] = gears[i + 1] / dDrift;
    }
    for (let i = calcGears; i < numGears; i++) {
      gears[i] = gears[calcGears - 1];
    }

    fd = (weight * fDrive * fGrip * 2 * C) / (maxTorque * gears[0]) * 3.5;
    fd = Math.max(2.2, Math.min(6.1, fd));

  } else if (raceGoal === 'Rally' || raceGoal === 'DangerSign') {
    // Rally Profile
    const vTheo = 28 * Math.pow(maxHp, 1 / 3);
    const r = Math.max(0.75, Math.min(0.85, 0.82 - 0.05 * ((maxTorque / maxHp) - 1.1)));

    gears = new Array(numGears).fill(0);
    gears[0] = 2.7;
    for (let i = 1; i < numGears; i++) {
      gears[i] = gears[i - 1] * r;
    }

    const gTop = gears[numGears - 1];
    fd = (rpmHp * C * 60) / (gTop * vTheo * 1000);
    fd = Math.max(2.0, Math.min(6.5, fd));

  } else if (raceGoal === 'Drag') {
    // Drag Profile - 4-Speed Hard Constraint Meta with Power-Calibrated Top Speed
    const hpPerKg = weight > 0 ? maxHp / weight : 0.5;
    // Aero inputs are excluded from the current mechanical tuning study.
    const vDragTop = 410.0 * Math.pow(hpPerKg, 0.30);

    const calcGears = Math.min(4, numGears);
    gears = new Array(numGears).fill(0);

    const idxTop = calcGears - 1;
    gears[idxTop] = 1.0;

    const rawFd = (rpmHp * C * 60) / (gears[idxTop] * vDragTop * 1000);
    fd = Math.max(2.0, Math.min(6.1, rawFd));

    if (calcGears > 1) {
      const v1Target = drivetrain === 'AWD' ? 110.0 : (drivetrain === 'FWD' ? 100.0 : 125.0);
      const rawG1 = (rpmHp * C * 60) / (v1Target * fd * 1000);
      gears[0] = Math.max(2.2, Math.min(5.0, rawG1));

      const rDrag = Math.pow(gears[idxTop] / gears[0], 1 / idxTop);
      for (let i = 1; i < idxTop; i++) {
        gears[i] = gears[i - 1] * rDrag;
      }
    }

    for (let i = calcGears; i < numGears; i++) {
      gears[i] = gears[idxTop];
    }

  } else {
    // Road / Circuit (Default) - Closed-loop Geometric Step Ratio Smooth Correction Model
    const kTrack = 0.95;
    const vTarget = Math.pow(maxHp, 1 / 3) * 37.0;
    const vCircuit = vTarget * kTrack;
    const targetTopGear = getTargetTopGearRatio(numGears);

    // Final Drive calculation anchored to peak HP RPM and target top gear
    const topTotalRatio = (rpmHp * C * 60) / (vCircuit * 1000);
    const rawFd = topTotalRatio / targetTopGear;
    fd = Math.max(AEGO_FINAL_DRIVE_MIN, Math.min(AEGO_FINAL_DRIVE_MAX, rawFd));

    // Calculate actual top gear based on clamped final drive
    const gTop = topTotalRatio / fd;

    // 1st Gear target speed with drivetrain launch modifier kDrive
    const vBase = 90.0;
    const kDrive = drivetrain === 'AWD' ? 0.85 : (drivetrain === 'FWD' ? 1.05 : 1.15);
    const v1 = vBase * kDrive;

    const g1 = (rpmHp * C * 60) / (v1 * fd * 1000);

    gears = new Array(numGears).fill(0);
    gears[0] = Math.max(1.0, Math.min(6.0, g1));
    gears[numGears - 1] = gTop;

    if (numGears > 1) {
      const numSteps = numGears - 1;
      const rMean = Math.pow(gTop / gears[0], 1 / numSteps);
      const rSpread = Math.min(0.12, Math.max(0.04, (1.0 - rMean) * 0.6));

      const rRaw: number[] = [];
      let prodRaw = 1.0;
      for (let i = 1; i <= numSteps; i++) {
        const offsetFraction = numSteps > 1 ? (i - 1) / (numSteps - 1) - 0.5 : 0;
        const rVal = Math.max(0.55, Math.min(0.92, rMean + rSpread * offsetFraction));
        rRaw.push(rVal);
        prodRaw *= rVal;
      }

      const s = Math.pow(gTop / (gears[0] * prodRaw), 1 / numSteps);
      for (let i = 1; i < numGears; i++) {
        const rAdj = rRaw[i - 1] * s;
        gears[i] = gears[i - 1] * rAdj;
      }
      gears[numGears - 1] = gTop;
    }
  }

  // Secondary Correction Mechanism (FD-First Macro Scaling with Top-Gear Usability Protection)
  if (!hasEventTarget && secondaryCorrection && (secondaryCorrection.simulatedTopSpeed || secondaryCorrection.softMaxSpeed)) {
    const { simulatedTopSpeed, softMaxSpeed } = secondaryCorrection;
    const tireRadiusM = C / (2 * Math.PI);
    const topGearIdx = (raceGoal === 'Drift' || raceGoal === 'Drag') ? Math.min(4, numGears) - 1 : numGears - 1;
    
    // Baseline top speed for highest active gear at Peak HP RPM
    const baselineTopSpeedMs = calcGearSpeed(rpmHp, gears[topGearIdx], fd, tireRadiusM);
    const baselineTopSpeedKmh = baselineTopSpeedMs * 3.6;

    let targetTopSpeedAtPeakHpKmh = baselineTopSpeedKmh;

    // 1. Soft Max Speed Cap Constraint at Redline RPM (converted to Peak HP target)
    if (softMaxSpeed && softMaxSpeed > 0 && maxRpm > 0) {
      const maxSpeedAtPeakHpFromSoftCap = softMaxSpeed * (rpmHp / maxRpm);
      targetTopSpeedAtPeakHpKmh = Math.min(targetTopSpeedAtPeakHpKmh, maxSpeedAtPeakHpFromSoftCap);
    }

    // 2. Simulated Top Speed Correction at Peak HP RPM
    if (simulatedTopSpeed && simulatedTopSpeed > 0) {
      const maxSpeedAtPeakHpFromSimulated = (maxRpm && maxRpm > 0) 
        ? simulatedTopSpeed * (rpmHp / maxRpm) 
        : simulatedTopSpeed;
      targetTopSpeedAtPeakHpKmh = Math.min(targetTopSpeedAtPeakHpKmh, maxSpeedAtPeakHpFromSimulated);
    }

    // 3. FD-First Macro Scaling + Micro Fine-Tuning
    if (targetTopSpeedAtPeakHpKmh > 0 && Math.abs(targetTopSpeedAtPeakHpKmh - baselineTopSpeedKmh) > 0.1) {
      const targetTopTotalRatio = (rpmHp * C * 60) / (targetTopSpeedAtPeakHpKmh * 1000);
      const baseTopGear = gears[topGearIdx];

      // Primary: scale Final Drive to absorb target top speed changes while preserving gear ratios
      const targetFd = targetTopTotalRatio / baseTopGear;

      if (targetFd >= AEGO_FINAL_DRIVE_MIN && targetFd <= AEGO_FINAL_DRIVE_MAX) {
        // FD fully absorbs the change, keep all individual gears untouched (preserving powerband drops)
        fd = targetFd;
      } else {
        // Clamp FD to game limits [2.0, 6.1] and adjust top gear
        fd = Math.max(AEGO_FINAL_DRIVE_MIN, Math.min(AEGO_FINAL_DRIVE_MAX, targetFd));
        let newGtop = targetTopTotalRatio / fd;

        // Top Gear Usability Guard
        if (topGearIdx > 0 && gears[topGearIdx - 1] > 0) {
          const prevGear = gears[topGearIdx - 1];
          const maxAllowedTopGear = prevGear * 0.90; // Prevent over-compression
          const minAllowedTopGear = prevGear * 0.70; // Prevent cliff drops

          if (newGtop > maxAllowedTopGear) {
            newGtop = maxAllowedTopGear;
          } else if (newGtop < minAllowedTopGear) {
            newGtop = minAllowedTopGear;
          }

          gears[topGearIdx] = newGtop;

          // Re-distribute intermediate gears gently only if top gear had to move
          const numSteps = topGearIdx;
          const rBand = rpmHp > 0 ? rpmT / rpmHp : 0.65;
          const rRedlineHp = (maxRpm && maxRpm > 0) ? rpmHp / maxRpm : 0.85;
          const isTurbo = engineType === 'Turbo' || engineType === 'TwinTurbo';
          const rMin = isTurbo ? Math.max(0.68, rRedlineHp * Math.max(0.80, rBand)) : Math.max(0.62, rRedlineHp * Math.max(0.75, rBand));
          const rMax = Math.min(0.92, rRedlineHp);

          const rRaw: number[] = [];
          let prodRaw = 1.0;
          for (let i = 1; i <= numSteps; i++) {
            const fraction = numSteps > 1 ? (i - 1) / (numSteps - 1) : 0;
            const rVal = rMin + (rMax - rMin) * fraction;
            rRaw.push(rVal);
            prodRaw *= rVal;
          }

          const s = Math.pow(newGtop / (gears[0] * prodRaw), 1 / numSteps);
          for (let i = 1; i < topGearIdx; i++) {
            const rAdj = rRaw[i - 1] * s;
            gears[i] = gears[i - 1] * rAdj;
          }
        } else {
          gears[topGearIdx] = newGtop;
        }

        // Fill remaining gears if Drift/Drag
        for (let i = topGearIdx + 1; i < numGears; i++) {
          gears[i] = gears[topGearIdx];
        }
      }
    }
  }

  // Ensure Fallback Values
  if (isNaN(fd) || fd === Infinity || fd === -Infinity || fd === 0) fd = 3.50;
  for (let i = 0; i < gears.length; i++) {
     if (isNaN(gears[i]) || gears[i] === Infinity || gears[i] === -Infinity || gears[i] === 0) gears[i] = 1.0;
  }

  fd = Math.min(AEGO_FINAL_DRIVE_MAX, Math.max(AEGO_FINAL_DRIVE_MIN, fd));

  const roundedFD = Math.round(fd * 100) / 100;
  const roundedGears = gears.map((ratio) => {
    return Math.round(ratio * 100) / 100;
  });

  // Preserve ordering after rounding. Peak-power RPM alone cannot bound shift
  // recovery: optimal shifts depend on wheel force across the full power curve.
  // Capping every step at peak RPM / redline also destroys the solved top ratio.
  const monotonicLimit = (raceGoal === 'Drift' || raceGoal === 'Drag') ? Math.min(4, numGears) : roundedGears.length;
  const maxStepRatioRounded = (maxRpm && maxRpm > 0 && raceGoal !== 'Drift' && raceGoal !== 'Drag')
    ? 1
    : 0.92;

  for (let i = 1; i < monotonicLimit; i++) {
     // Keep the explicit legacy top-gear spacing guard after redistribution;
     // it is a compatibility heuristic, not a peak-power RPM constraint.
     const legacyTopGuard = !hasEventTarget && i === monotonicLimit - 1
       && !!(secondaryCorrection?.simulatedTopSpeed || secondaryCorrection?.softMaxSpeed);
     const stepLimit = legacyTopGuard ? Math.min(0.90, maxStepRatioRounded) : maxStepRatioRounded;
     const maxAllowedRatio = Math.min(
       Math.round((roundedGears[i - 1] - 0.01) * 100) / 100,
       Math.floor(roundedGears[i - 1] * stepLimit * 100) / 100
     );
     if (roundedGears[i] > maxAllowedRatio) {
        roundedGears[i] = Math.max(0.40, maxAllowedRatio);
     }
  }

  // Ensure gears > 4 exactly match gear 4 for Drift/Drag
  if (raceGoal === 'Drift' || raceGoal === 'Drag') {
     if (numGears > 4) {
        for (let i = 4; i < numGears; i++) {
            roundedGears[i] = roundedGears[3];
        }
     }
  }

  const baseline: GearingResult = {
    finalDrive: roundedFD,
    gears: roundedGears
  };
  if (!hasEventTarget) return baseline;

  const speed = secondaryCorrection?.targetSpeedKmh;
  const rpm = secondaryCorrection?.targetRpm;
  if (!Number.isFinite(speed) || !Number.isFinite(rpm) || speed! <= 0 || rpm! <= 0 || rpm! > maxRpm) {
    return { ...baseline, targetFit: { status: 'invalid' } };
  }

  // Kinematic fit only: g * FD = RPM * circumference * 60 / (speed_kmh * 1000).
  // Scale FD first, then all gears equally when FD saturates, preserving RPM drops.
  // These are legacy solver bounds, not measured per-transmission FH6 limits.
  const topIndex = monotonicLimit - 1;
  const totalRatio = rpm! * C * 60 / (speed! * 1000);
  const fittedFd = Math.round(Math.max(AEGO_FINAL_DRIVE_MIN,
    Math.min(AEGO_FINAL_DRIVE_MAX, totalRatio / roundedGears[topIndex])) * 100) / 100;
  const scale = totalRatio / (fittedFd * roundedGears[topIndex]);
  const fittedGears = roundedGears.map(ratio => Math.round(ratio * scale * 100) / 100);
  const usable = fittedGears.every((ratio, index) => Number.isFinite(ratio) && ratio >= 0.4 && ratio <= 6 &&
    (index === 0 || index > topIndex || ratio < fittedGears[index - 1]));
  const result = usable ? { finalDrive: fittedFd, gears: fittedGears } : baseline;
  const achievedSpeedKmh = calcGearSpeed(rpm!, result.gears[topIndex], result.finalDrive, C / (2 * Math.PI)) * 3.6;
  return { ...result, targetFit: {
    status: usable && Math.abs(achievedSpeedKmh / speed! - 1) <= 0.01 ? 'matched' : 'limited',
    achievedSpeedKmh
  } };
}

/**
 * Resolves aerodynamic downforce for front and rear axles (in kgf).
 * Positive values are captured loads and are retained even when their axle is
 * locked. A zero or missing value is auto-derived only for an adjustable axle;
 * on a locked axle it remains an unknown/no-load value instead of becoming a
 * synthetic suspension load.
 */
export function resolveAeroDownforce(params: TuningCarParams): { front: number; rear: number } {
  const weightKg = params.weight > 0 ? params.weight : 1400;
  const wf = params.weight_distribution > 0 ? params.weight_distribution : 50;
  const wr = 100 - wf;
  const drivetrain = params.drivetrain || 'RWD';

  const fVal = params.aero_downforce_front ?? 0;
  const rVal = params.aero_downforce_rear ?? 0;
  const frontAdjustable = isAeroAxleAdjustable(params.adjustability?.aero, 'front');
  const rearAdjustable = isAeroAxleAdjustable(params.adjustability?.aero, 'rear');

  // Drivetrain aero modifier from reference document:
  // RWD: 0.82 (more rear downforce)
  // FWD / AWD: 1.05 (more front downforce)
  const drivetrainModifier = drivetrain === 'RWD' ? 0.82 : 1.05;

  // 1. Both explicit values > 0
  if (fVal > 0 && rVal > 0) {
    return { front: Math.round(fVal * 10) / 10, rear: Math.round(rVal * 10) / 10 };
  }

  const ratio = (wf / wr) * drivetrainModifier;

  // 2. Only front > 0, rear <= 0 -> Derive rear when that control exists.
  if (fVal > 0 && rVal <= 0) {
    if (!rearAdjustable) return { front: Math.round(fVal * 10) / 10, rear: 0 };
    const derivedRear = fVal / ratio;
    return { front: Math.round(fVal * 10) / 10, rear: Math.round(derivedRear * 10) / 10 };
  }

  // 3. Only rear > 0, front <= 0 -> Derive front when that control exists.
  if (rVal > 0 && fVal <= 0) {
    if (!frontAdjustable) return { front: 0, rear: Math.round(rVal * 10) / 10 };
    const derivedFront = rVal * ratio;
    return { front: Math.round(derivedFront * 10) / 10, rear: Math.round(rVal * 10) / 10 };
  }

  // 4. Both <= 0 -> Derive only adjustable axes from estimated total downforce.
  // Target total downforce = 20% of vehicle weight in lbs (converted to kgf)
  const weightLbs = weightKg * 2.20462;
  const totalTargetLbs = weightLbs * 0.20;
  const totalTargetKgf = totalTargetLbs / 2.20462;

  // Solve system: front / rear = ratio & front + rear = totalTargetKgf
  const derivedRear = totalTargetKgf / (1 + ratio);
  const derivedFront = totalTargetKgf - derivedRear;

  return {
    front: frontAdjustable ? Math.round(derivedFront * 10) / 10 : 0,
    rear: rearAdjustable ? Math.round(derivedRear * 10) / 10 : 0
  };
}

/**
 * Calculates complete Step3 Chassis Tuning (ARBs, Springs, Ride Height, Damping, Differential).
 * Enforces safety clamping against user-defined slider limits.
 */
export function calculateChassisTuning(
  raceGoal: string,
  carParams: TuningCarParams | null
): ChassisTuningResult {
  // Safe Fallback defaults
  const weight = carParams && carParams.weight > 0 ? carParams.weight : 1400;
  const wf = carParams && carParams.weight_distribution > 0 ? carParams.weight_distribution : 50;
  const wr = 100 - wf;
  const drivetrain: Drivetrain = carParams?.drivetrain || 'RWD';

  const kMinF = carParams?.spring_front_min ?? 10.0;
  const kMaxF = carParams?.spring_front_max ?? 120.0;
  const kMinR = carParams?.spring_rear_min ?? 10.0;
  const kMaxR = carParams?.spring_rear_max ?? 120.0;

  const hMinF = carParams?.height_front_min ?? 10.0;
  const hMaxF = carParams?.height_front_max ?? 25.0;
  const hMinR = carParams?.height_rear_min ?? 10.0;
  const hMaxR = carParams?.height_rear_max ?? 25.0;

  let arbF = 1.0;
  let arbR = 1.0;
  let springF = 10.0;
  let springR = 10.0;
  let heightF = 10.0;
  let heightR = 10.0;
  let rebF = 1.0;
  let rebR = 1.0;
  let bumpF = 1.0;
  let bumpR = 1.0;

  let accelF = 0;
  let decelF = 0;
  let accelR = 0;
  let decelR = 0;
  let centerRear = 50;

  const click = 0.5; // Ride height click increment in cm

  if (raceGoal === 'Drift') {
    // 1. Anti-Roll Bars (Extreme Front-Soft / Rear-Stiff)
    arbF = 10.0;
    arbR = 50.0;

    // 2. Softened Drift Springs
    springF = weight * (wf / 100) * 0.035;
    springR = weight * (wr / 100) * 0.035;

    // 3. Ride Height
    heightF = hMinF + 1 * click;
    heightR = hMinR;

    // 4. Damping (Symmetric Low-Stiffness)
    rebF = 6.0;
    rebR = 6.0;
    bumpF = 3.0;
    bumpR = 3.0;

    // 5. Differential
    if (drivetrain === 'AWD') {
      accelF = 40;
      decelF = 0;
      accelR = 100;
      decelR = 0;
      centerRear = 88;
    } else {
      accelR = 100;
      decelR = 25;
    }

  } else if (raceGoal === 'Rally' || raceGoal === 'DangerSign') {
    // 1. Anti-Roll Bars (Softened 35%)
    const baseArbF = 64.0 * (wf / 100) + 1.0;
    const baseArbR = 64.0 * (wr / 100) + 1.0;
    arbF = baseArbF * 0.35;
    arbR = baseArbR * 0.35;

    // 2. Springs (Softened 65% of base)
    const baseSpringF = (kMaxF - kMinF) * (wf / 100) + kMinF;
    const baseSpringR = (kMaxR - kMinR) * (wr / 100) + kMinR;
    springF = baseSpringF * 0.65;
    springR = baseSpringR * 0.65;

    // 3. Maximum Ride Height
    heightF = hMaxF;
    heightR = hMaxR;

    // 4. Damping (40% Bump Ratio for Landing Absorptions)
    rebF = 14.0 * (wf / 100) + 1.0;
    rebR = 14.0 * (wr / 100) + 1.0;
    bumpF = rebF * 0.40;
    bumpR = rebR * 0.40;

    // 5. Differential
    if (drivetrain === 'AWD') {
      accelF = 40;
      decelF = 10;
      accelR = 80;
      decelR = 25;
      centerRear = 65;
    } else if (drivetrain === 'FWD') {
      accelF = 60;
      decelF = 15;
    } else {
      accelR = 75;
      decelR = 25;
    }

  } else if (raceGoal === 'Drag') {
    // 1. Anti-Roll Bars (Soft Front for compliance, Stiff Rear to suppress torque twist)
    arbF = 1.0;
    arbR = 65.0;

    // 2. Springs (Soft Front for weight transfer launch, Stiff Rear 90% to suppress heavy launch torque squat)
    springF = kMinF + 0.20 * (kMaxF - kMinF);
    springR = kMinR + 0.90 * (kMaxR - kMinR);

    // 3. Forward Rake Ride Height (Front Lowest for low aero drag/lift, Rear Highest for downforce/grip)
    heightF = hMinF;
    heightR = hMaxR;

    // 4. Balanced Damping (Soft Front to extend, Stiff Rear to damp heavy launch torque compression)
    rebF = 3.0;
    bumpF = 4.0;
    rebR = 12.0;
    bumpR = 10.0;

    // 5. Differential
    accelF = drivetrain === 'FWD' || drivetrain === 'AWD' ? 100 : 0;
    decelF = 0;
    accelR = drivetrain === 'RWD' || drivetrain === 'AWD' ? 100 : 0;
    decelR = 0;
    centerRear = 80;

  } else {
    // Road / Circuit (Default)
    // 1. Anti-Roll Bars
    if (drivetrain === 'AWD') {
      // 1/65 Meta Strategy for AWD
      arbF = Math.min(5.0, 1.0 + (wf / 100) * 4.0);
      arbR = Math.max(50.0, 65.0 - (100 - wr) * 0.3);
    } else {
      arbF = 64.0 * (wf / 100) + 1.0;
      arbR = 64.0 * (wr / 100) + 1.0;
    }

    // 2. Mechanical starting point. Aero package/downforce inputs intentionally
    // do not affect this study; range/weight allocation remains an uncalibrated prior.
    const baseSpringF = (kMaxF - kMinF) * (wf / 100) + kMinF;
    const baseSpringR = (kMaxR - kMinR) * (wr / 100) + kMinR;
    springF = baseSpringF;
    springR = baseSpringR;

    // 3. Ride Height (+3 clicks above min)
    heightF = hMinF + 3 * click;
    heightR = hMinR + 3 * click;

    // 4. Damping (60% Golden Bump Ratio)
    rebF = 19.0 * (wf / 100) + 1.0;
    rebR = 19.0 * (wr / 100) + 1.0;
    bumpF = rebF * 0.60;
    bumpR = rebR * 0.60;

    // 5. Differential
    if (drivetrain === 'FWD') {
      accelF = 40;
      decelF = 10;
    } else if (drivetrain === 'RWD') {
      accelR = Math.min(65, Math.max(40, 40 + (wr - 50) * 0.5));
      decelR = 20;
    } else {
      accelF = 15;
      decelF = 0;
      accelR = 75;
      decelR = 15;
      centerRear = Math.min(85, Math.max(60, wr + 20));
    }
  }

  // Safety Clamping & Precision Rounding
  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
  const r1 = (n: number) => Math.round(n * 10) / 10;

  return {
    arb: {
      front: r1(clamp(arbF, 1.0, 65.0)),
      rear: r1(clamp(arbR, 1.0, 65.0))
    },
    springs: {
      front: r1(clamp(springF, kMinF, kMaxF)),
      rear: r1(clamp(springR, kMinR, kMaxR)),
      heightF: r1(clamp(heightF, hMinF, hMaxF)),
      heightR: r1(clamp(heightR, hMinR, hMaxR))
    },
    damping: {
      reboundF: r1(clamp(rebF, 1.0, 20.0)),
      reboundR: r1(clamp(rebR, 1.0, 20.0)),
      bumpF: r1(clamp(bumpF, 1.0, 20.0)),
      bumpR: r1(clamp(bumpR, 1.0, 20.0))
    },
    diff: {
      accelF: r1(clamp(accelF, 0, 100)),
      decelF: r1(clamp(decelF, 0, 100)),
      accelR: r1(clamp(accelR, 0, 100)),
      decelR: r1(clamp(decelR, 0, 100)),
      centerRear: r1(clamp(centerRear, 10, 90))
    }
  };
}

export type Season = 'Summer' | 'Autumn' | 'Spring' | 'Winter' | 'Neutral';

/** One confirmed game step, explicitly exploratory; no telemetry-to-cause inference. */
export function roadExplorationStep(setting: { value: number; minimum: number; maximum: number; step: number }, direction: -1 | 1): number | null {
  const { value, minimum, maximum, step } = setting;
  if (![value, minimum, maximum, step].every(Number.isFinite) || minimum >= maximum || step <= 0 || value < minimum || value > maximum) return null;
  const grid = (value - minimum) / step;
  if (Math.abs(grid - Math.round(grid)) > 1e-5) return null;
  const candidate = Number((minimum + (Math.round(grid) + direction) * step).toFixed(8));
  return candidate >= minimum && candidate <= maximum ? candidate : null;
}

export interface RoadFormulaValue { value: number; unit: string }
export type RoadBaselineInputName = Exclude<keyof TuningCarParams, 'drivetrain' | 'adjustability' | 'induction' | 'tireType'> | 'numGears';
export const ROAD_BASELINE_INPUTS: Record<string, RoadBaselineInputName[]> = {
  pressure: ['weight', 'weight_distribution', 'frontTireWidth', 'rearTireWidth'],
  springs: ['weight_distribution', 'spring_front_min', 'spring_front_max', 'spring_rear_min', 'spring_rear_max'],
  height: ['height_front_min', 'height_front_max', 'height_rear_min', 'height_rear_max'],
  arb: ['weight_distribution'], damping: ['weight_distribution'], alignment: ['weight_distribution'], differential: ['weight_distribution'],
  gearing: ['maxHp', 'numGears', 'frontTireWidth', 'frontTireAspect', 'frontTireRim', 'rearTireWidth', 'rearTireAspect', 'rearTireRim'],
};
/** Thin Road projection of the canonical formulas; no legacy defaults become confirmed inputs. */
export function calculateRoadBaselineGroup(group: string, inputs: Partial<TuningCarParams> & { numGears?: number },
  engine: WorkflowEngineInput | null = null): Record<string, RoadFormulaValue> | null {
  const required = ROAD_BASELINE_INPUTS;
  if (!required[group] || !inputs.drivetrain || !required[group].every(key => typeof inputs[key] === 'number' && Number.isFinite(inputs[key]) && (inputs[key] as number) > 0)) return null;
  if (required[group].includes('weight_distribution') && inputs.weight_distribution! >= 100) return null;
  for (const prefix of group === 'springs' ? ['spring_front', 'spring_rear'] : group === 'height' ? ['height_front', 'height_rear'] : []) {
    if ((inputs[(prefix + '_min') as keyof TuningCarParams] as number) >= (inputs[(prefix + '_max') as keyof TuningCarParams] as number)) return null;
  }
  // Placeholder fields only satisfy the legacy function signature. Each group's
  // required fields cover every consumed Road dependency for its selected outputs.
  const params: TuningCarParams = { weight: 0, weight_distribution: 0, maxHp: 0, maxTorque: 0, maxHpRpm: 0, maxTorqueRpm: 0, ...inputs, drivetrain: inputs.drivetrain };
  const chassis = calculateChassisTuning('Road', params), alignment = calculateStaticTireAlignment('Road', 'Neutral', params);
  const result: Record<string, RoadFormulaValue> = {};
  const add = (key: string, value: number, unit: string) => { result[key] = { value, unit }; };
  if (group === 'pressure') { add('pressure.front', alignment.pcF, 'psi'); add('pressure.rear', alignment.pcR, 'psi'); }
  if (group === 'springs') { add('spring.front', chassis.springs.front, 'kgf/mm'); add('spring.rear', chassis.springs.rear, 'kgf/mm'); }
  if (group === 'height') { add('height.front', chassis.springs.heightF, 'cm'); add('height.rear', chassis.springs.heightR, 'cm'); }
  if (group === 'arb') { add('arb.front', chassis.arb.front, 'slider'); add('arb.rear', chassis.arb.rear, 'slider'); }
  if (group === 'damping') {
    add('rebound.front', chassis.damping.reboundF, 'slider'); add('rebound.rear', chassis.damping.reboundR, 'slider');
    add('bump.front', chassis.damping.bumpF, 'slider'); add('bump.rear', chassis.damping.bumpR, 'slider');
  }
  if (group === 'alignment') {
    add('camber.front', alignment.camber.front, 'deg'); add('camber.rear', alignment.camber.rear, 'deg');
    add('toe.front', parseFloat(alignment.toe.front), 'deg'); add('toe.rear', parseFloat(alignment.toe.rear), 'deg'); add('caster', alignment.caster, 'deg');
  }
  if (group === 'differential') {
    if (params.drivetrain !== 'RWD') { add('diff.front.acceleration', chassis.diff.accelF, '%'); add('diff.front.deceleration', chassis.diff.decelF, '%'); }
    if (params.drivetrain !== 'FWD') { add('diff.rear.acceleration', chassis.diff.accelR, '%'); add('diff.rear.deceleration', chassis.diff.decelR, '%'); }
    if (params.drivetrain === 'AWD') add('diff.center', chassis.diff.centerRear, '%');
  }
  if (group === 'gearing') {
    if (!engine || !Number.isInteger(inputs.numGears) || inputs.numGears! < 2 || inputs.numGears! > 10) return null;
    const gearing = calculateWorkflowTuning('Road', 'Neutral', params, inputs.numGears!, engine).gearing;
    if (!gearing) return null;
    add('gearing.finalDrive', gearing.finalDrive, 'ratio'); gearing.gears.forEach((value, i) => add('gearing.gear' + (i + 1), value, 'ratio'));
  }
  return result;
}

/** Fit an initial estimate to a game-confirmed range and grid; never fabricate that range. */
export function fitRoadGameGrid(value: number, minimum: number, maximum: number, step: number): number | null {
  if (![value, minimum, maximum, step].every(Number.isFinite) || minimum >= maximum || step <= 0 || step > maximum - minimum) return null;
  const index = Math.max(0, Math.min(Math.floor((maximum - minimum) / step + 1e-8), Math.round((value - minimum) / step)));
  return Number((minimum + index * step).toFixed(8));
}

export interface WorkflowEngineInput {
  maxRpm: number;
  maxHpRpm: number;
  maxTorqueRpm: number;
}

export interface WorkflowTuningResult {
  tires: Pick<StaticTireAlignResult, 'pcF' | 'pcR' | 'targetPhot' | 'seasonBias' | 'hwF' | 'hwR'> & { gearingRadiusM: number };
  chassis: ChassisTuningResult;
  alignment: StaticTireAlignResult;
  gearing: GearingResult | null;
}

/** One-way evaluation of a profile snapshot; page visits never become solver inputs. */
export function calculateWorkflowTuning(
  goal: string, season: Season, params: TuningCarParams, numGears: number,
  engine: WorkflowEngineInput | null, correction?: GearingSecondaryCorrection
): WorkflowTuningResult {
  const alignment = calculateStaticTireAlignment(goal, season, params);
  const { pcF, pcR, targetPhot, seasonBias, hwF, hwR } = alignment;
  const tires = { pcF, pcR, targetPhot, seasonBias, hwF, hwR, gearingRadiusM: getGearingTireRadius(params) };
  const chassis = calculateChassisTuning(goal, params);
  const engineReady = engine && Number.isFinite(params.maxHp) && params.maxHp > 0 &&
    [engine.maxRpm, engine.maxHpRpm, engine.maxTorqueRpm].every(value => Number.isFinite(value) && value > 0) &&
    engine.maxHpRpm <= engine.maxRpm && engine.maxTorqueRpm <= engine.maxRpm;
  const gearing = engineReady ? calculateGearingFromRadius(goal, numGears,
    { ...params, maxHpRpm: engine.maxHpRpm, maxTorqueRpm: engine.maxTorqueRpm },
    engine.maxRpm, tires.gearingRadiusM, correction) : null;
  return { tires, chassis, alignment, gearing };
}

export interface StaticTireAlignResult {
  pcF: number; // PSI
  pcR: number; // PSI
  targetPhot: number; // PSI
  seasonBias: number; // PSI
  camber: {
    front: number;
    rear: number;
  };
  toe: {
    front: string;
    rear: string;
  };
  caster: number;
  hwF: number; // mm
  hwR: number; // mm
}

/**
 * Calculates static cold tire pressures, target hot pressure, and alignment geometry (Camber/Toe/Caster).
 * 
 * @param discipline Race discipline ('Road' | 'Drift' | 'Rally' | 'Drag')
 * @param season Season ('Summer' | 'Autumn' | 'Spring' | 'Winter')
 * @param params Vehicle parameters
 */
export function calculateStaticTireAlignment(
  discipline: string,
  season: Season = 'Summer',
  params: TuningCarParams | null
): StaticTireAlignResult {
  const M = params && params.weight > 0 ? params.weight : 1350;
  const Wf = (params && params.weight_distribution > 0 ? params.weight_distribution : 54) / 100.0;
  const Wr = 1.0 - Wf;
  const drivetrain = params?.drivetrain || 'AWD';

  // Tire specs from carParams
  const fw = params?.frontTireWidth || 245;
  const fa = params?.frontTireAspect || 40;
  const rw = params?.rearTireWidth || 275;
  const ra = params?.rearTireAspect || 35;

  const hwF = Math.round(fw * (fa / 100.0) * 10) / 10;
  const hwR = Math.round(rw * (ra / 100.0) * 10) / 10;

  // Season bias
  const deltaPSeason = season === 'Neutral' ? 0 : (season === 'Spring' || season === 'Winter') ? 0.5 : -0.5;

  // Drive bias
  let driveBiasF = 0.0;
  let driveBiasR = 0.0;
  if (drivetrain === 'FWD') {
    driveBiasF = 1.5;
    driveBiasR = -0.5;
  } else if (drivetrain === 'RWD') {
    driveBiasF = 0.5;
    driveBiasR = 0.0;
  } else {
    driveBiasF = 0.2;
    driveBiasR = 0.0;
  }

  let targetPhot = 32.5;
  let pcF = 0;
  let pcR = 0;
  let camberF = 0;
  let camberR = 0;
  let toeF = '+0.1°';
  let toeR = '-0.1°';
  let caster = 6.0;

  const normalizedDisc = discipline.toLowerCase();

  if (normalizedDisc === 'drift') {
    targetPhot = 21.0;
    pcF = 32.0 + 2.0 * ((M * Wf) / 1000) + deltaPSeason;
    pcR = 19.5 + 1.0 * ((M * Wr) / 1000) + deltaPSeason;

    camberF = -4.8;
    camberR = -0.5;
    toeF = '+1.2°';
    toeR = '-0.3°';
    caster = 7.0;
  } else if (normalizedDisc === 'rally' || normalizedDisc === 'dangersign') {
    targetPhot = 27.5;
    pcF = 22.0 + 2.0 * ((M * Wf) / 1000) + 0.02 * hwF + deltaPSeason;
    pcR = 21.5 + 2.0 * ((M * Wr) / 1000) + 0.02 * hwR + deltaPSeason;

    camberF = -1.3;
    camberR = -0.8;
    toeF = '+0.2°';
    toeR = '0.0°';
    caster = 6.0;
  } else if (normalizedDisc === 'drag') {
    targetPhot = 23.5;
    if (drivetrain === 'RWD') {
      pcF = 38.0;
      pcR = 15.0 + 1.5 * ((M * Wr) / 1000) + deltaPSeason;
    } else {
      pcF = 23.0 + deltaPSeason;
      pcR = 23.0 + deltaPSeason;
    }

    camberF = 0.0;
    camberR = -0.1;
    toeF = '0.0°';
    toeR = '0.0°';
    caster = 7.0;
  } else {
    // Default Road / Circuit
    targetPhot = 32.5;
    pcF = 28.5 + 2.5 * ((M * Wf) / 1000 - 0.7) - 0.005 * (fw - 245) + driveBiasF + deltaPSeason;
    pcR = 28.0 + 2.5 * ((M * Wr) / 1000 - 0.7) - 0.005 * (rw - 245) + driveBiasR + deltaPSeason;

    camberF = -Number((1.5 + 0.8 * Wf + 0.2 * 1.0).toFixed(1));
    camberR = -Number((0.8 + 0.6 * Wr + 0.2 * 1.0).toFixed(1));
    toeF = '+0.1°';
    toeR = '-0.1°';
    caster = Number((5.0 + 2.0 * Wf).toFixed(1));
  }

  const r1 = (n: number) => Math.round(n * 10) / 10;

  return {
    pcF: r1(pcF),
    pcR: r1(pcR),
    targetPhot: r1(targetPhot),
    seasonBias: r1(deltaPSeason),
    camber: {
      front: r1(camberF),
      rear: r1(camberR)
    },
    toe: {
      front: toeF,
      rear: toeR
    },
    caster: r1(caster),
    hwF,
    hwR
  };
}


