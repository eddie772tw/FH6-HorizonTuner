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
  const frontBias = (carParams && carParams.weight_distribution > 0) ? carParams.weight_distribution : 50; // %
  const drivetrain: Drivetrain = (carParams && carParams.drivetrain) ? carParams.drivetrain : 'RWD';
  const maxHp = (carParams && carParams.maxHp > 0) ? carParams.maxHp : 300; // HP
  
  // Estimate maxTorque if not present
  let maxTorque = (carParams && carParams.maxTorque > 0) ? carParams.maxTorque : 0; // N-m
  if (maxTorque === 0) {
    // Torque = HP * 9549 / RPM. Assume peak torque occurs at 75% of maxRpm
    const torqueRpm = maxRpm * 0.75;
    maxTorque = (maxHp * 745.7) / (torqueRpm * 2 * Math.PI / 60);
  }

  // 2. Step A: Theoretical Top Speed & Final Drive (FD) Derivation
  // Equation: Power * efficiency = (beta * v^2 + roll_resist * m * g) * v
  const efficiency = drivetrain === 'AWD' ? 0.85 : drivetrain === 'RWD' ? 0.90 : 0.92;
  const powerWatts = maxHp * 745.7;
  const beta = 0.35; // default equivalent drag coefficient
  const rollResist = 0.015;
  const g = 9.81;
  const tireRadius = 0.32; // meters

  // Solve for v_max using binary search
  let lowSpeed = 25.0; // ~90 km/h
  let highSpeed = 160.0; // ~576 km/h
  let vMax = 60.0; // fallback
  for (let iter = 0; iter < 30; iter++) {
    const mid = (lowSpeed + highSpeed) / 2;
    const dragForce = beta * mid * mid;
    const rollForce = rollResist * weight * g;
    const requiredPower = (dragForce + rollForce) * mid;
    const availablePower = powerWatts * efficiency;
    if (requiredPower > availablePower) {
      highSpeed = mid;
    } else {
      lowSpeed = mid;
      vMax = mid;
    }
  }

  // Target Speed calculation based on raceGoal
  let targetSpeed = vMax;
  if (raceGoal === 'Touge') targetSpeed = vMax * 0.85;
  else if (raceGoal === 'Rally') targetSpeed = vMax * 0.80;
  else if (raceGoal === 'Drift') targetSpeed = vMax * 0.70;
  else if (raceGoal === 'DangerSign') targetSpeed = vMax * 0.75;
  else if (raceGoal === 'SpeedZone') targetSpeed = vMax * 1.02;

  // Determine top gear ratio based on number of gears
  let gTop = 0.55;
  if (numGears <= 4) gTop = 0.75;
  else if (numGears === 5) gTop = 0.68;
  else if (numGears === 6) gTop = 0.60;
  else if (numGears === 7) gTop = 0.55;
  else if (numGears === 8) gTop = 0.51;
  else if (numGears === 9) gTop = 0.47;
  else if (numGears >= 10) gTop = 0.44;

  // FD = (maxRpm * 2 * PI * r_tire) / (targetSpeed * gTop * 60)
  let fd = (maxRpm * 2 * Math.PI * tireRadius) / (targetSpeed * gTop * 60);

  // Apply Race Goal multiplier to FD
  if (raceGoal === 'Touge') fd = fd * 1.08;
  else if (raceGoal === 'Rally') fd = fd * 1.12;
  else if (raceGoal === 'DangerSign') fd = fd * 1.18; // sprint emphasis

  // Clamp FD to typical game boundaries
  fd = Math.max(2.0, Math.min(6.5, fd));

  // 3. Step B: Launch-Limited 1st Gear (g1) Calculation
  const tLaunch = maxTorque * 0.85; // approximate launch torque
  let mu = 1.15; // default road tire friction
  if (raceGoal === 'Rally') mu = 0.85; // rally mud tire
  else if (raceGoal === 'Drift') mu = 0.90; // drift tire

  let alpha = 1.15; // slip allowance
  if (raceGoal === 'Rally') alpha = 1.10; // keep traction on mud
  else if (raceGoal === 'Drift') alpha = 1.25; // encourage initial wheelspin
  else if (raceGoal === 'DangerSign') alpha = 1.05; // strict traction for sprint

  // Drive wheel normal load calculation
  const weightDistributionRatio = frontBias / 100;
  let wStatic = weight;
  if (drivetrain === 'RWD') {
    wStatic = weight * (1 - weightDistributionRatio);
  } else if (drivetrain === 'FWD') {
    wStatic = weight * weightDistributionRatio;
  }
  
  const wTransfer = weight * 0.08;
  let wDrive = weight; // AWD uses all weight
  if (drivetrain === 'RWD') {
    wDrive = wStatic + wTransfer;
  } else if (drivetrain === 'FWD') {
    wDrive = Math.max(weight * 0.25, wStatic - wTransfer);
  }

  let g1 = (alpha * mu * wDrive * g * tireRadius) / (tLaunch * fd * efficiency);

  // Clamp g1 to safe gameplay limits
  g1 = Math.max(2.5, Math.min(4.8, g1));

  // Ensure g1 > gTop
  if (g1 <= gTop) {
    g1 = gTop + 2.0;
  }

  // 4. Step C: Multi-Gear Ratio Interpolation based on Envelope Weights
  const w: number[] = [];
  const n = numGears;

  for (let i = 1; i < n; i++) {
    let weightVal = 1.0;
    if (raceGoal === 'Road') {
      weightVal = Math.pow(n - i, 0.7);
    } else if (raceGoal === 'Touge') {
      weightVal = 1.0;
    } else if (raceGoal === 'Rally') {
      weightVal = 1.0 + 0.12 * (n - 1 - i);
    } else if (raceGoal === 'Drift') {
      if (i === 1) weightVal = 2.5;
      else if (i === 2) weightVal = 1.2;
      else if (i === 3 || i === 4) weightVal = 0.45;
      else weightVal = 1.4;
    } else if (raceGoal === 'SpeedZone') {
      if (i >= n - 2) weightVal = 0.35;
      else weightVal = 1.0 + 0.3 * (n - 1 - i);
    } else if (raceGoal === 'DangerSign') {
      weightVal = 1.0;
    }
    w.push(weightVal);
  }

  const sumW = w.reduce((sum, val) => sum + val, 0);
  const gears: number[] = Array(n).fill(0);
  gears[0] = g1;
  gears[n - 1] = gTop;

  for (let i = 1; i < n - 1; i++) {
    const subSumW = w.slice(0, i).reduce((sum, val) => sum + val, 0);
    gears[i] = g1 * Math.pow(gTop / g1, subSumW / sumW);
  }

  const roundedFD = Math.round(fd * 100) / 100;
  const roundedGears = gears.map(ratio => Math.round(ratio * 100) / 100);

  return {
    finalDrive: roundedFD,
    gears: roundedGears
  };
}
