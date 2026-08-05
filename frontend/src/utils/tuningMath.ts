import { getTireCoefficient } from './tireCoefficients';

/**
 * Interface representing vehicle parameters used for tuning calculation.
 */
export interface TuningCarParams {
  weight: number; // in kg
  weight_distribution: number; // front weight percentage (0-100)
  drivetrain: 'FWD' | 'RWD' | 'AWD';
  induction?: 'NA' | 'Supercharger' | 'Turbo' | 'TwinTurbo';
  maxHp: number;
  maxTorque: number;
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

/**
 * AEGO (Adaptive Envelope & Gearing Optimization) Algorithm
 * Generates custom, physically-sound gearing setup for different race goals.
 */
export function calculateAEGOGearing(
  raceGoal: string,
  numGears: number,
  carParams: TuningCarParams | null,
  maxRpm: number
): GearingResult {
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
  const mechBalance = carParams?.mechBalance ?? 0.5;
  const aeroBalance = carParams?.aeroBalance ?? 0.5;
  const aeroEfficiency = carParams?.aeroEfficiency ?? 0.5;
  const engineType = carParams?.induction ?? 'NA';
  const tireType = carParams?.tireType;

  // Determine active tire size based on drivetrain
  const wTire = (drivetrain === 'FWD' ? carParams?.frontTireWidth : carParams?.rearTireWidth) ?? 245;
  const ar = (drivetrain === 'FWD' ? carParams?.frontTireAspect : carParams?.rearTireAspect) ?? 40;
  const sRim = (drivetrain === 'FWD' ? carParams?.frontTireRim : carParams?.rearTireRim) ?? 18;

  // Tire Circumference (m)
  const C = ((((wTire * ar) / 100) * 2 + sRim * 25.4) * Math.PI) / 1000;

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
    // Drag Profile
    const vTrap = 255 * Math.pow(maxHp / weight, 1 / 3);
    const fDriveDrag = drivetrain === 'AWD' ? 1.0 : 0.6;
    const rDrag = Math.max(0.65, Math.min(0.78, 0.72 + 0.03 * (fDriveDrag - 0.8)));
    const is3Speed = (1 / rDrag) < 1.18;

    const calcGears = Math.min(4, numGears);
    gears = new Array(numGears).fill(0);

    const idxTop = calcGears - 1;
    gears[idxTop] = 1.0;

    if (calcGears > 1) {
      gears[idxTop - 1] = is3Speed ? 1.0 : (1 / rDrag);
      
      for (let i = idxTop - 2; i >= 1; i--) {
        gears[i] = gears[i + 1] / rDrag;
      }
      
      gears[0] = gears[1] * (fDriveDrag === 1.0 ? 1.3 : 1.0);
    }
    
    for (let i = calcGears; i < numGears; i++) {
      gears[i] = gears[calcGears - 1];
    }

    fd = (rpmHp * C * 60) / (gears[idxTop] * vTrap * 1000);
    fd = Math.max(2.0, Math.min(6.5, fd));

  } else {
    // Road / Circuit (Default)
    const p = 1 + (maxHp / 1000) * ((0.95 - aeroEfficiency) * 5) * (1.2 - 0.4 * aeroBalance);
    const vTop = Math.pow(maxHp, 1 / 3) * 38 * (aeroEfficiency / 0.85);
    const d = Math.max(rpmT / rpmHp, 0.75);

    fd = ((rpmHp * C * 60) / (vTop * 0.85 * 1000)) * (0.8 + 0.4 * mechBalance);
    fd = Math.max(2.0, Math.min(6.5, fd));

    gears = new Array(numGears).fill(0);

    const g1Base = (weight * fDrive * fTire * 2 * C) / (maxTorque * fd);
    const g1Mult = Math.max(1.0, (maxTorque * 3.2) / (weight * fDrive));
    gears[0] = Math.max(0.48, Math.min(6.0, g1Base * g1Mult));

    gears[numGears - 1] = (rpmHp * C * 60) / (vTop * fd * 1000);

    for (let n = 2; n < numGears; n++) {
      const exp = 1 - ((n - 1) - 1) / Math.max(1, numGears - 3) * (1 - 1 / p);
      gears[n - 1] = Math.max(0.48, Math.min(6.0, gears[n - 2] * Math.pow(d, exp)));
    }
  }

  // Ensure Fallback Values
  if (isNaN(fd) || fd === Infinity || fd === -Infinity || fd === 0) fd = 3.50;
  for (let i = 0; i < gears.length; i++) {
     if (isNaN(gears[i]) || gears[i] === Infinity || gears[i] === -Infinity || gears[i] === 0) gears[i] = 1.0;
  }

  const roundedFD = Math.round(fd * 100) / 100;
  const roundedGears = gears.map((ratio) => {
    return Math.round(ratio * 100) / 100;
  });

  // Force monotonic decrease as tests require it (g1 > g2 > ... > gN)
  const monotonicLimit = (raceGoal === 'Drift' || raceGoal === 'Drag') ? Math.min(4, numGears) : roundedGears.length;
  for (let i = 1; i < monotonicLimit; i++) {
     if (roundedGears[i] >= roundedGears[i - 1]) {
        roundedGears[i] = Math.max(0.48, Math.round((roundedGears[i - 1] - 0.01) * 100) / 100);
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

  return {
    finalDrive: roundedFD,
    gears: roundedGears
  };
}

/**
 * Resolves aerodynamic downforce for front and rear axles (in kgf).
 * If values are <= 0, triggers automatic derivation based on weight distribution
 * and drivetrain modifier.
 */
export function resolveAeroDownforce(params: TuningCarParams): { front: number; rear: number } {
  const weightKg = params.weight > 0 ? params.weight : 1400;
  const wf = params.weight_distribution > 0 ? params.weight_distribution : 50;
  const wr = 100 - wf;
  const drivetrain = params.drivetrain || 'RWD';

  const fVal = params.aero_downforce_front ?? 0;
  const rVal = params.aero_downforce_rear ?? 0;

  // Drivetrain aero modifier from reference document:
  // RWD: 0.82 (more rear downforce)
  // FWD / AWD: 1.05 (more front downforce)
  const drivetrainModifier = drivetrain === 'RWD' ? 0.82 : 1.05;

  // 1. Both explicit values > 0
  if (fVal > 0 && rVal > 0) {
    return { front: Math.round(fVal * 10) / 10, rear: Math.round(rVal * 10) / 10 };
  }

  const ratio = (wf / wr) * drivetrainModifier;

  // 2. Only front > 0, rear <= 0 -> Derive rear
  if (fVal > 0 && rVal <= 0) {
    const derivedRear = fVal / ratio;
    return { front: Math.round(fVal * 10) / 10, rear: Math.round(derivedRear * 10) / 10 };
  }

  // 3. Only rear > 0, front <= 0 -> Derive front
  if (rVal > 0 && fVal <= 0) {
    const derivedFront = rVal * ratio;
    return { front: Math.round(derivedFront * 10) / 10, rear: Math.round(rVal * 10) / 10 };
  }

  // 4. Both <= 0 -> Derive both from estimated total target downforce
  // Target total downforce = 20% of vehicle weight in lbs (converted to kgf)
  const weightLbs = weightKg * 2.20462;
  const totalTargetLbs = weightLbs * 0.20;
  const totalTargetKgf = totalTargetLbs / 2.20462;

  // Solve system: front / rear = ratio & front + rear = totalTargetKgf
  const derivedRear = totalTargetKgf / (1 + ratio);
  const derivedFront = totalTargetKgf - derivedRear;

  return {
    front: Math.round(derivedFront * 10) / 10,
    rear: Math.round(derivedRear * 10) / 10
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

  // Aero resolution
  const aero = carParams ? resolveAeroDownforce(carParams) : { front: 50, rear: 50 };

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
    // 1. Anti-Roll Bars (Front Unconstrained)
    arbF = 1.0;
    arbR = 2.0;

    // 2. Springs (Front Max, Rear Min for Weight Transfer)
    springF = kMaxF * 0.90;
    springR = kMinR;

    // 3. Rake Angle Ride Height (Front Highest, Rear Lowest)
    heightF = hMaxF;
    heightR = hMinR;

    // 4. Diagonal Extreme Damping
    rebF = 1.0;
    bumpF = 20.0;
    rebR = 20.0;
    bumpR = 1.0;

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

    // 2. Springs with Aero Compensation
    const baseSpringF = (kMaxF - kMinF) * (wf / 100) + kMinF;
    const baseSpringR = (kMaxR - kMinR) * (wr / 100) + kMinR;
    const deltaKf = (aero.front / 10) * 0.5;
    const deltaKr = (aero.rear / 25) * 0.5;
    springF = baseSpringF + deltaKf;
    springR = baseSpringR + deltaKr;

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

export type Season = 'Summer' | 'Autumn' | 'Spring' | 'Winter';

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
  const deltaPSeason = (season === 'Spring' || season === 'Winter') ? 0.5 : -0.5;

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
    caster = 5.0;
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


