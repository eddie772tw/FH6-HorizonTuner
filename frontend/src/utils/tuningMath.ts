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
 * Calculates spring rates based on target natural frequency and total weight (Imperial units)
 * @param weightLbs - Total vehicle weight in pounds
 * @param frontBias - Front weight distribution percentage
 * @param targetFreq - Target natural frequency in Hz
 */
export function calculateSpringsByFrequency(
  weightLbs: number,
  frontBias: number,
  targetFreq: number
): TuningResult {
  const biasDec = frontBias / 100;
  const frontWeight = weightLbs * biasDec;
  const rearWeight = weightLbs * (1 - biasDec);
  
  // Formula: K = (f^2 * M_axle) / 19.56
  return {
    front: (Math.pow(targetFreq, 2) * frontWeight) / 19.56,
    rear: (Math.pow(targetFreq, 2) * rearWeight) / 19.56
  };
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
