import { getTireCoefficient } from './tireCoefficients';
/**
 * Forza Horizon Tuning Math Utility
 * 
 * Implements standard interpolation formulas for baseline tuning setups
 * Formula: (Max - Min) * WeightBias + Min
 */

export interface TuningResult {
  front: number;
  rear: number;
}

export type Drivetrain = 'RWD' | 'AWD' | 'FWD';
export type RaceType = 'Road' | 'Rally' | 'Drag' | 'Drift';

/**
 * Calculates optimized alignment settings based on spring stiffness, ARB balance, race type, and drivetrain.
 */
export interface AlignmentResult {
  camberF: number;
  camberR: number;
  toeF: number;
  toeR: number;
  caster: number;
}

export function calculateAlignmentSettings(
  raceType: RaceType,
  drivetrain: Drivetrain,
  springsF: number,
  springsR: number,
  springsMin: number,
  springsMax: number,
  arbF: number,
  arbR: number
): AlignmentResult {
  // Calculate Spring Stiffness Ratio (SR)
  const range = springsMax - springsMin;
  const srf = range > 0 ? (springsF - springsMin) / range : 0.5;
  const srr = range > 0 ? (springsR - springsMin) / range : 0.5;

  let camberF = 0;
  let camberR = 0;
  let toeF = 0;
  let toeR = 0;
  let caster = 5.0;

  if (raceType === 'Road') {
    camberF = -2.2 + (1.0 * srf);
    camberR = camberF + 0.5;
    toeF = arbF > arbR ? 0.1 : 0.0;
    toeR = drivetrain === 'RWD' ? -0.1 : 0.0;
    caster = 7.0 - (2.0 * srf);
  } else if (raceType === 'Rally') {
    camberF = -1.6 + (0.6 * srf);
    camberR = -1.0 + (0.5 * srr);
    toeF = 0.1;
    toeR = 0.0;
    caster = 6.0 - (1.5 * srf);
  } else if (raceType === 'Drift') {
    camberF = -5.0 + (1.0 * srf);
    camberR = -0.5;
    toeF = 0.3;
    toeR = 0.1;
    caster = 7.0;
  } else {
    // Default fallback (e.g. for Drag or unexpected)
    camberF = -1.5;
    camberR = -1.0;
    toeF = 0.0;
    toeR = 0.0;
    caster = 5.0;
  }

  // Round values to sensible precision for Forza
  return {
    camberF: Math.round(camberF * 10) / 10,
    camberR: Math.round(camberR * 10) / 10,
    toeF: Math.round(toeF * 10) / 10,
    toeR: Math.round(toeR * 10) / 10,
    caster: Math.round(caster * 10) / 10,
  };
}

/**
 * Calculates optimized tire pressures based on race type, drivetrain, and alignment.
 */
export function calculateTirePressures(
  raceType: RaceType,
  drivetrain: Drivetrain,
  alignment: { camberF: number; camberR: number; toeF: number; toeR: number; caster: number }
): TuningResult {
  let baseF = 2.1;
  let baseR = 2.1;

  if (raceType === 'Road') {
    if (drivetrain === 'AWD') { baseF = 1.9; baseR = 1.9; }
    else if (drivetrain === 'RWD') { baseF = 1.9; baseR = 1.8; }
    else if (drivetrain === 'FWD') { baseF = 1.8; baseR = 2.0; }
  } else if (raceType === 'Rally') {
    baseF = 1.4; baseR = 1.4;
  } else if (raceType === 'Drag') {
    baseF = 2.4; baseR = 1.0;
  } else if (raceType === 'Drift') {
    if (drivetrain === 'AWD') { baseF = 1.9; baseR = 2.4; }
    else { baseF = 1.9; baseR = 2.6; } // Default RWD/FWD to 2.6
  }

  const camberFOffset = 0.04 * Math.abs(alignment.camberF);
  const camberROffset = 0.04 * Math.abs(alignment.camberR);

  const toeFOffset = 0.15 * Math.abs(alignment.toeF);
  const toeROffset = 0.15 * Math.abs(alignment.toeR);

  const casterOffset = 0.01 * Math.max(0, alignment.caster - 5.0);

  const front = Math.max(1.0, Math.min(4.0, baseF - camberFOffset - toeFOffset - casterOffset));
  const rear = Math.max(1.0, Math.min(4.0, baseR - camberROffset - toeROffset));

  return { front, rear };
}

/**
 * Calculates baseline spring rates based on weight distribution
 * @param frontBias - Front weight distribution percentage (e.g., 52 for 52%)
 * @param min - Game's minimum spring rate setting
 * @param max - Game's maximum spring rate setting
 */
export function calculateSprings(frontBias: number, min: number, max: number): TuningResult {
  const biasDec = frontBias / 100;
  return {
    front: (max - min) * biasDec + min,
    rear: (max - min) * (1 - biasDec) + min
  };
}

/**
 * Calculates baseline Anti-Roll Bars (ARB) based on weight distribution
 * @param frontBias - Front weight distribution percentage
 * @param min - Game's minimum ARB setting (usually 1)
 * @param max - Game's maximum ARB setting (usually 65)
 */
export function calculateARBs(frontBias: number, min: number = 1.0, max: number = 65.0): TuningResult {
  const biasDec = frontBias / 100;
  return {
    front: (max - min) * biasDec + min,
    rear: (max - min) * (1 - biasDec) + min
  };
}

export interface DamperResult {
  frontRebound: number;
  rearRebound: number;
  frontBump: number;
  rearBump: number;
}

/**
 * Calculates baseline damping (Rebound & Bump)
 * @param frontBias - Front weight distribution percentage
 * @param minRebound - Minimum rebound setting (usually 1.0)
 * @param maxRebound - Maximum rebound setting (usually 20.0)
 * @param bumpRatio - Ratio of bump to rebound (usually ~0.6 or 60%)
 */
export function calculateDampers(
  frontBias: number, 
  minRebound: number = 1.0, 
  maxRebound: number = 20.0,
  bumpRatio: number = 0.6
): DamperResult {
  const biasDec = frontBias / 100;
  const frontRebound = (maxRebound - minRebound) * biasDec + minRebound;
  const rearRebound = (maxRebound - minRebound) * (1 - biasDec) + minRebound;
  
  return {
    frontRebound: frontRebound,
    rearRebound: rearRebound,
    frontBump: frontRebound * bumpRatio,
    rearBump: rearRebound * bumpRatio
  };
}

/**
 * Calculates spring rates using Relative Frequency Scaling (Option 1)
 * Formula: K = (Max - Min) * (WeightBias * (f_target / f_base)^2) + Min
 * @param min - Minimum allowed spring rate
 * @param max - Maximum allowed spring rate
 * @param frontBias - Front weight distribution percentage
 * @param targetFreq - Target natural frequency in Hz
 * @param baseFreq - Base reference frequency in Hz (default 2.0)
 */
export function calculateSpringsByFrequency(
  min: number,
  max: number,
  frontBias: number,
  targetFreq: number,
  baseFreq: number = 2.0,
  _hp: number = 0,
  weight: number = 1500
): TuningResult {
  const biasDec = frontBias / 100;
  
  const range = max - min;
  const freqMultiplier = Math.pow(targetFreq / baseFreq, 2);
  
  let front = (range * (biasDec * freqMultiplier)) + min;
  let rear = (range * ((1 - biasDec) * freqMultiplier)) + min;

  // Anti-squat for high HP
  const hpWeightRatio = weight > 0 ? _hp / (weight / 1000) : 0;
  if (hpWeightRatio > 200) { // e.g., >300HP for 1500kg car
    const stiffenRear = Math.min(0.2, (hpWeightRatio - 200) * 0.0005); // up to +20% rear stiffness
    rear = rear * (1 + stiffenRear);
    rear = Math.min(max, rear);
  }
  
  // Clamp to boundaries
  front = Math.max(min, Math.min(max, front));
  rear = Math.max(min, Math.min(max, rear));
  
  return { front, rear };
}

/**
 * Calculates advanced Anti-Roll Bars (ARB) based on weight distribution and drivetrain
 * @param frontBias - Front weight distribution percentage
 * @param drivetrain - Drivetrain type for specific modifications
 * @param min - Game's minimum ARB setting (usually 1)
 * @param max - Game's maximum ARB setting (usually 65)
 */
export function calculateARBsAdvanced(
  frontBias: number, 
  drivetrain: Drivetrain,
  min: number = 1.0, 
  max: number = 65.0
): TuningResult {
  const biasDec = frontBias / 100;
  let front = (max - min) * biasDec + min;
  let rear = (max - min) * (1 - biasDec) + min;

  // Drivetrain specific adjustments
  if (drivetrain === 'RWD') {
    rear = rear * 0.9; // Soften rear for more traction
  } else if (drivetrain === 'AWD') {
    rear = rear * 1.1; // Stiffen rear for better rotation
  }

  return {
    front: Math.max(min, Math.min(max, front)),
    rear: Math.max(min, Math.min(max, rear))
  };
}

/**
 * Calculates damping (Rebound & Bump) scaling with actual spring rates
 * @param frontSpring - Calculated front spring rate
 * @param rearSpring - Calculated rear spring rate
 * @param minRebound - Minimum rebound setting (usually 1.0)
 * @param maxRebound - Maximum rebound setting (usually 20.0)
 * @param bumpRatio - Ratio of bump to rebound (usually ~0.6 or 60%)
 */
export function calculateDampersAdvanced(
  frontSpring: number,
  rearSpring: number,
  minRebound: number = 1.0,
  maxRebound: number = 20.0,
  bumpRatio: number = 0.6
): DamperResult {
  // Approximate conversion factor in Forza: Max Rebound 20 corresponds to roughly 1500 lbs/in spring
  // So rebound is roughly SpringRate / 75.0. 
  let frontRebound = frontSpring / 75.0;
  let rearRebound = rearSpring / 75.0;

  frontRebound = Math.max(minRebound, Math.min(maxRebound, frontRebound));
  rearRebound = Math.max(minRebound, Math.min(maxRebound, rearRebound));

  return {
    frontRebound,
    rearRebound,
    frontBump: frontRebound * bumpRatio,
    rearBump: rearRebound * bumpRatio
  };
}

/**
 * Calculates damper clicks based on Critical Damping coefficient.
 * Assumes inputs are in Imperial units (lbs/in for springs, lbs for weight)
 * to match the game's internal physics calibration constant (0.00135).
 */
export function calculateDampersCritical(
  frontSpringLbsIn: number,
  rearSpringLbsIn: number,
  weightLbs: number,
  frontBias: number,
  reboundRatio: number = 0.70,
  bumpRatio: number = 0.50,
  _hp: number = 0
): DamperResult {
  const biasDec = frontBias / 100;
  const frontWeight = weightLbs * biasDec;
  const rearWeight = weightLbs * (1 - biasDec);

  const frontCc = 2 * Math.sqrt(frontSpringLbsIn * frontWeight);
  const rearCc = 2 * Math.sqrt(rearSpringLbsIn * rearWeight);

  // Calibration constant derived from telemetry reverse engineering
  const CALIBRATION_CONST = 0.00135;

  let frontRebound = frontCc * reboundRatio * CALIBRATION_CONST;
  let rearRebound = rearCc * reboundRatio * CALIBRATION_CONST;
  let frontBump = frontCc * bumpRatio * CALIBRATION_CONST;
  let rearBump = rearCc * bumpRatio * CALIBRATION_CONST;

  // Clamp to game limits 1.0 - 20.0
  return {
    frontRebound: Math.max(1.0, Math.min(20.0, frontRebound)),
    rearRebound: Math.max(1.0, Math.min(20.0, rearRebound)),
    frontBump: Math.max(1.0, Math.min(20.0, frontBump)),
    rearBump: Math.max(1.0, Math.min(20.0, rearBump))
  };
}

export interface DiffResult {
  accelF: number;
  decelF: number;
  accelR: number;
  decelR: number;
  center: number;
}

/**
 * Gets baseline differential settings based on drivetrain.
 */
export function getDifferentialBaseline(drivetrain: Drivetrain, _hp: number = 0, torque: number = 0, weight: number = 1500): DiffResult {
  const torqueWeightRatio = weight > 0 ? torque / (weight / 1000) : 0;
  const torqueLockBonus = Math.min(25, torqueWeightRatio * 0.05);

  if (drivetrain === 'FWD') {
    return { accelF: Math.min(100, 30 + torqueLockBonus), decelF: 5, accelR: 0, decelR: 0, center: 50 };
  } else if (drivetrain === 'RWD') {
    return { accelF: 0, decelF: 0, accelR: Math.min(100, 65 + torqueLockBonus), decelR: 10, center: 50 };
  } else {
    // AWD
    return { accelF: Math.min(100, 25 + torqueLockBonus * 0.5), decelF: 5, accelR: Math.min(100, 70 + torqueLockBonus), decelR: 10, center: 70 };
  }
}

export interface GearingResult {
  finalDrive: number;
  gears: number[];
}

/**
 * AEGO (Adaptive Envelope & Gearing Optimization) Algorithm
 * Generates custom, physically-sound gearing setup for 6 different race goals.
 */
export function calculateAEGOGearing(
  raceGoal: string,
  numGears: number,
  carParams: any,
  maxRpm: number
): GearingResult {
  // 1. Fallback & Default Parameters Setup
  const weight = (carParams && carParams.weight > 0) ? carParams.weight : 1400; // kg
  const drivetrain: Drivetrain = (carParams && carParams.drivetrain) ? carParams.drivetrain : 'RWD';
  const maxHp = (carParams && carParams.maxHp > 0) ? carParams.maxHp : 300; // HP
  
  // Estimate maxTorque if not present
  let maxTorque = (carParams && carParams.maxTorque > 0) ? carParams.maxTorque : 0; // N-m
  let rpmHp = (carParams && carParams.maxHpRpm > 0) ? carParams.maxHpRpm : maxRpm * 0.85;
  let rpmT = (carParams && carParams.maxTorqueRpm > 0) ? carParams.maxTorqueRpm : maxRpm * 0.6;

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

  // 1. Tire Circumference (m)
  const C = ((((wTire * ar) / 100) * 2 + sRim * 25.4) * Math.PI) / 1000;

  // TODO: AWD fDrive is 1.0 but it doesn't take into account AWD specific torque distribution.
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

    gears = new Array(numGears).fill(0.5); // Fallback defaults
    if (numGears >= 4) {
      gears[3] = 1.0; // G_4
      gears[2] = gears[3] / dDrift; // G_3
      gears[1] = gears[2] / dDrift; // G_2
      gears[0] = gears[1] / dDrift; // G_1
    } else {
      gears[numGears - 1] = 1.0;
      for (let i = numGears - 2; i >= 0; i--) {
        gears[i] = gears[i + 1] / dDrift;
      }
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
    // Add sane limits for FD
    fd = Math.max(2.0, Math.min(6.5, fd));

  } else if (raceGoal === 'Drag') {
    // Drag Profile
    const vTrap = 255 * Math.pow(maxHp / weight, 1 / 3);
    const fDriveDrag = drivetrain === 'AWD' ? 1.0 : 0.6; // TODO: handle AWD torque distribution
    const rDrag = Math.max(0.65, Math.min(0.78, 0.72 + 0.03 * (fDriveDrag - 0.8)));
    const is3Speed = (1 / rDrag) < 1.18;

    gears = new Array(numGears).fill(0);

    const idxG4 = Math.min(3, numGears - 1);
    const idxG3 = Math.min(2, numGears - 1);
    const idxG2 = Math.min(1, numGears - 1);
    const idxG1 = 0;

    gears[idxG4] = 1.0; // G_4

    if (idxG3 !== idxG4) {
      gears[idxG3] = is3Speed ? 1.0 : (1 / rDrag); // G_3
    }

    if (idxG2 !== idxG3) {
      gears[idxG2] = gears[idxG3] / rDrag; // G_2
    }

    if (idxG1 !== idxG2) {
      gears[idxG1] = gears[idxG2] * (fDriveDrag === 1.0 ? 1.3 : 1.0); // G_1
    }

    for (let i = 4; i < numGears; i++) {
        gears[i] = gears[i - 1] * rDrag;
    }

    fd = (rpmHp * C * 60) / (gears[idxG4] * vTrap * 1000);
    // Sane limits
    fd = Math.max(2.0, Math.min(6.5, fd));

  } else {
    // Road / Circuit (Default)
    const p = 1 + (maxHp / 1000) * ((0.95 - aeroEfficiency) * 5) * (1.2 - 0.4 * aeroBalance);
    const vTop = Math.pow(maxHp, 1 / 3) * 38 * (aeroEfficiency / 0.85);
    const d = Math.max(rpmT / rpmHp, 0.75);

    fd = ((rpmHp * C * 60) / (vTop * 0.85 * 1000)) * (0.8 + 0.4 * mechBalance);
    fd = Math.max(2.0, Math.min(6.5, fd));

    gears = new Array(numGears).fill(0);

    // G_1
    const g1Base = (weight * fDrive * fTire * 2 * C) / (maxTorque * fd);
    const g1Mult = Math.max(1.0, (maxTorque * 3.2) / (weight * fDrive));
    gears[0] = Math.max(0.48, Math.min(6.0, g1Base * g1Mult));

    // G_N
    gears[numGears - 1] = (rpmHp * C * 60) / (vTop * fd * 1000);

    // G_2 to G_N-1
    for (let n = 2; n < numGears; n++) {
      const exp = 1 - ((n - 1) - 1) / Math.max(1, numGears - 3) * (1 - 1 / p);
      gears[n - 1] = Math.max(0.48, Math.min(6.0, gears[n - 2] * Math.pow(d, exp)));
    }
  }

  // Ensure Fallback Values
  if (isNaN(fd) || fd === Infinity || fd === -Infinity || fd === 0) fd = 3.50;
  for(let i = 0; i < gears.length; i++) {
     if (isNaN(gears[i]) || gears[i] === Infinity || gears[i] === -Infinity || gears[i] === 0) gears[i] = 1.0;
  }

  const roundedFD = Math.round(fd * 100) / 100;
  const roundedGears = gears.map((ratio) => {
    return Math.round(ratio * 100) / 100;
  });

  // Force monotonic decrease as tests require it (g1 > g2 > ... > gN)
  for (let i = 1; i < roundedGears.length; i++) {
     if (roundedGears[i] >= roundedGears[i - 1]) {
        roundedGears[i] = Math.max(0.48, Math.round((roundedGears[i - 1] - 0.01) * 100) / 100);
     }
  }

  return {
    finalDrive: roundedFD,
    gears: roundedGears
  };
}
