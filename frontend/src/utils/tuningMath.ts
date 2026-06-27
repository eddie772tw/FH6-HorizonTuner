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
  baseFreq: number = 2.0
): TuningResult {
  const biasDec = frontBias / 100;
  
  const range = max - min;
  const freqMultiplier = Math.pow(targetFreq / baseFreq, 2);
  
  let front = (range * (biasDec * freqMultiplier)) + min;
  let rear = (range * ((1 - biasDec) * freqMultiplier)) + min;
  
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
  reboundRatio: number = 0.75,
  bumpRatio: number = 0.55
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
export function getDifferentialBaseline(drivetrain: Drivetrain): DiffResult {
  if (drivetrain === 'FWD') {
    return { accelF: 30, decelF: 5, accelR: 0, decelR: 0, center: 50 };
  } else if (drivetrain === 'RWD') {
    return { accelF: 0, decelF: 0, accelR: 65, decelR: 10, center: 50 };
  } else {
    // AWD
    return { accelF: 25, decelF: 5, accelR: 70, decelR: 10, center: 70 };
  }
}
