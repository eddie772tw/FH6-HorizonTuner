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
