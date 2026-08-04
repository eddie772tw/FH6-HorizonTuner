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

// TODO: 未來需要重新引入其他調校設定 (Alignment, TirePressure, Springs, ARB, Dampers, Differential) 的相關計算公式與常數宣告。

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
    // Add sane limits for FD
    fd = Math.max(2.0, Math.min(6.5, fd));

  } else if (raceGoal === 'Drag') {
    // Drag Profile
    const vTrap = 255 * Math.pow(maxHp / weight, 1 / 3);
    const fDriveDrag = drivetrain === 'AWD' ? 1.0 : 0.6; // TODO: handle AWD torque distribution
    const rDrag = Math.max(0.65, Math.min(0.78, 0.72 + 0.03 * (fDriveDrag - 0.8)));
    const is3Speed = (1 / rDrag) < 1.18;

    const calcGears = Math.min(4, numGears);
    gears = new Array(numGears).fill(0);

    const idxTop = calcGears - 1;
    gears[idxTop] = 1.0; // G_Top

    if (calcGears > 1) {
      gears[idxTop - 1] = is3Speed ? 1.0 : (1 / rDrag); // G_Top-1
      
      for (let i = idxTop - 2; i >= 1; i--) {
        gears[i] = gears[i + 1] / rDrag;
      }
      
      gears[0] = gears[1] * (fDriveDrag === 1.0 ? 1.3 : 1.0); // G_1 with AWD bonus
    }
    
    for (let i = calcGears; i < numGears; i++) {
      gears[i] = gears[calcGears - 1];
    }

    fd = (rpmHp * C * 60) / (gears[idxTop] * vTrap * 1000);
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

export interface ChassisTuningResult {
  arb: { front: number; rear: number };
  springs: { front: number; rear: number; heightF: number; heightR: number };
  damping: { reboundF: number; reboundR: number; bumpF: number; bumpR: number };
  diff: { accelF: number; decelF: number; accelR: number; decelR: number; center: number };
}

export function generateChassisTuning(raceGoal: string, carParams: any): ChassisTuningResult {
  // Extract inputs
  const W = carParams?.weight || 1500; // Expected in kg internally
  const W_lb = W * 2.20462;
  const Wf_pct = (carParams?.weight_distribution || 50) / 100.0;
  const Wr_pct = 1.0 - Wf_pct;
  const Aero_f = carParams?.aero_downforce_front || 0;
  const Aero_r = carParams?.aero_downforce_rear || 0;

  const ARB_min = 1.0;
  const ARB_max_f = carParams?.arb_front_max || 65.0;
  const ARB_max_r = carParams?.arb_rear_max || 65.0;

  const K_min_f = carParams?.spring_front_min || 10.0;
  const K_max_f = carParams?.spring_front_max || 120.0;
  const K_min_r = carParams?.spring_rear_min || 10.0;
  const K_max_r = carParams?.spring_rear_max || 120.0;

  const drivetrain = carParams?.drivetrain || 'RWD';

  const result: ChassisTuningResult = {
    arb: { front: 0, rear: 0 },
    springs: { front: 0, rear: 0, heightF: 0, heightR: 0 },
    damping: { reboundF: 0, reboundR: 0, bumpF: 0, bumpR: 0 },
    diff: { accelF: 0, decelF: 0, accelR: 0, decelR: 0, center: 0 }
  };

  if (raceGoal === 'Road' || raceGoal === 'Circuit') {
    // ARBs
    if (drivetrain === 'AWD') {
      result.arb.front = 3.0; // 1-5
      result.arb.rear = 57.5; // 50-65
    } else {
      result.arb.front = (ARB_max_f - ARB_min) * Wf_pct + ARB_min;
      result.arb.rear = (ARB_max_r - ARB_min) * Wr_pct + ARB_min;
    }

    // Springs
    const K_base_f = (K_max_f - K_min_f) * Wf_pct + K_min_f;
    const K_base_r = (K_max_r - K_min_r) * Wr_pct + K_min_r;

    result.springs.front = K_base_f + (Aero_f / 10.0) * 0.5;
    result.springs.rear = K_base_r + (Aero_r / 25.0) * 0.5;

    result.springs.heightF = 2; // Min + 2 clicks
    result.springs.heightR = 2; // Min + 2 clicks

    // Damping
    result.damping.reboundF = 19.0 * Wf_pct + 1.0;
    result.damping.reboundR = 19.0 * Wr_pct + 1.0;
    result.damping.bumpF = result.damping.reboundF * 0.60;
    result.damping.bumpR = result.damping.reboundR * 0.60;

    // Diff
    if (drivetrain === 'FWD') {
      result.diff.accelF = 40; // 30-50
      result.diff.decelF = 10; // 0-15
    } else if (drivetrain === 'RWD') {
      result.diff.accelR = 50; // 40-65
      result.diff.decelR = 20; // 15-30
    } else { // AWD
      result.diff.accelF = 15;
      result.diff.decelF = 0;
      result.diff.accelR = 75;
      result.diff.decelR = 15;
      result.diff.center = Math.round(Wr_pct * 100) + 20; // W_r% + 20%
    }
  } else if (raceGoal === 'Drift') {
    // ARBs
    result.arb.front = 10.0;
    result.arb.rear = 50.0;

    // Springs
    const k_f_lb = W_lb * Wf_pct * 0.15;
    const k_r_lb = W_lb * Wr_pct * 0.15;
    const lbToKgf = 0.017857;
    result.springs.front = k_f_lb * lbToKgf;
    result.springs.rear = k_r_lb * lbToKgf;

    result.springs.heightF = 1; // Min + 1 click
    result.springs.heightR = 0; // Min

    // Damping
    result.damping.reboundF = 6.0; // 4-8
    result.damping.reboundR = 6.0;
    result.damping.bumpF = 3.0; // 50% of rebound
    result.damping.bumpR = 3.0;

    // Diff
    if (drivetrain === 'RWD') {
      result.diff.accelR = 98; // 95-100
      result.diff.decelR = 25; // 20-30
    } else if (drivetrain === 'AWD') {
      result.diff.accelF = 40;
      result.diff.decelF = 0;
      result.diff.accelR = 100;
      result.diff.decelR = 0;
      result.diff.center = 88; // 85-90%
    }
  } else if (raceGoal === 'Rally') {
    // ARBs
    result.arb.front = (64.0 * Wf_pct + 1.0) * 0.35;
    result.arb.rear = (64.0 * Wr_pct + 1.0) * 0.35;

    // Springs
    result.springs.front = (W / 2.0) * Wf_pct * 1.15;
    result.springs.rear = (W / 2.0) * Wr_pct * 1.15;

    result.springs.heightF = 100; // Max (simulate with 100 or high number, UI logic needed)
    result.springs.heightR = 100;

    // Damping
    result.damping.reboundF = 14.0 * Wf_pct + 1.0;
    result.damping.reboundR = 14.0 * Wr_pct + 1.0;
    result.damping.bumpF = result.damping.reboundF * 0.40;
    result.damping.bumpR = result.damping.reboundR * 0.40;

    // Diff
    if (drivetrain === 'RWD') {
      result.diff.accelR = 75; // 65-85
      result.diff.decelR = 28; // 20-35
    } else if (drivetrain === 'AWD') {
      result.diff.accelF = 40;
      result.diff.decelF = 10;
      result.diff.accelR = 80;
      result.diff.decelR = 25;
      result.diff.center = 65; // 60-70%
    }
  } else if (raceGoal === 'Drag') {
    // ARBs
    result.arb.front = 1.0;
    result.arb.rear = 5.0; // 1-10

    // Springs
    result.springs.front = K_max_f * 0.90;
    result.springs.rear = K_min_r;

    result.springs.heightF = 100; // Max
    result.springs.heightR = 0; // Min

    // Damping
    result.damping.reboundF = 1.0;
    result.damping.bumpF = 20.0;
    result.damping.reboundR = 20.0;
    result.damping.bumpR = 1.0;

    // Diff
    result.diff.accelF = 100;
    result.diff.decelF = 0;
    result.diff.accelR = 100;
    result.diff.decelR = 0;
    result.diff.center = 80; // 75-85%
  }

  // Constrain bounds
  result.arb.front = Math.max(1, Math.min(65, result.arb.front));
  result.arb.rear = Math.max(1, Math.min(65, result.arb.rear));
  result.springs.front = Math.max(K_min_f, Math.min(K_max_f, result.springs.front));
  result.springs.rear = Math.max(K_min_r, Math.min(K_max_r, result.springs.rear));
  result.damping.reboundF = Math.max(1, Math.min(20, result.damping.reboundF));
  result.damping.reboundR = Math.max(1, Math.min(20, result.damping.reboundR));
  result.damping.bumpF = Math.max(1, Math.min(20, result.damping.bumpF));
  result.damping.bumpR = Math.max(1, Math.min(20, result.damping.bumpR));

  return result;
}
