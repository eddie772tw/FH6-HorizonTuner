/**
 * Unit Tests for tuningMath.ts
 *
 * 驗證 AEGO 齒輪比調校算牌與車輛物理轉換公式之正確性。
 * 所有函數皆為純函數 (Pure Functions)，不依賴任何外部狀態。
 *
 * @see AGENTS.md §2 - 車輛物理與調校邏輯 Single Source of Truth
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAEGOGearing,
  calcGearSpeed,
  calcGearRpm,
  resolveAeroDownforce,
  calculateChassisTuning,
  calculateStaticTireAlignment,
  TuningCarParams
} from './tuningMath';


// ---------- Helpers ----------

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ============================================================
// calcGearSpeed & calcGearRpm
// ============================================================
describe('Speed & RPM Physics Helpers', () => {
  it('calcGearSpeed should calculate correct speed in m/s', () => {
    // 6000 RPM, gear ratio 1.0, FD 3.5, tire radius 0.32m
    // speed = (6000 * 2 * PI * 0.32) / (1.0 * 3.5 * 60) = 12063.7 / 210 = ~57.44 m/s
    const speedMs = calcGearSpeed(6000, 1.0, 3.5, 0.32);
    expect(round(speedMs, 2)).toBe(57.45);
  });

  it('calcGearRpm should calculate correct RPM for given speed', () => {
    const rpm = calcGearRpm(57.446, 1.0, 3.5, 0.32);
    expect(round(rpm, 0)).toBe(6000);
  });

  it('should handle zero or negative edge cases gracefully', () => {
    expect(calcGearSpeed(6000, 0, 3.5)).toBe(0);
    expect(calcGearSpeed(6000, 1.0, 0)).toBe(0);
    expect(calcGearRpm(100, 1.0, 3.5, 0)).toBe(0);
  });
});

// ============================================================
// calculateAEGOGearing
// ============================================================
describe('calculateAEGOGearing', () => {
  const sampleCar: TuningCarParams = {
    weight: 1400,
    weight_distribution: 50,
    drivetrain: 'RWD',
    maxHp: 300,
    maxTorque: 400,
    maxHpRpm: 6500,
    maxTorqueRpm: 4500
  };

  it('should return correct number of gears', () => {
    const result = calculateAEGOGearing('Road', 6, sampleCar, 7500);
    expect(result.gears).toHaveLength(6);
  });

  it('gear ratios should be monotonically decreasing (g1 > g2 > ... > gN)', () => {
    const result = calculateAEGOGearing('Road', 6, sampleCar, 7500);
    for (let i = 1; i < result.gears.length; i++) {
      expect(result.gears[i]).toBeLessThan(result.gears[i - 1]);
    }
  });

  it('finalDrive should be clamped within the in-game [2.0, 6.1] range', () => {
    const highHpCar: TuningCarParams = { ...sampleCar, maxHp: 1000 };
    const result = calculateAEGOGearing('Road', 6, highHpCar, 9000);
    expect(result.finalDrive).toBeGreaterThanOrEqual(2.0);
    expect(result.finalDrive).toBeLessThanOrEqual(6.1);
  });

  it('rebalances weak-engine gearing away from high-final-drive and sub-1.0 first-gear extremes', () => {
    const weakEngineCar: TuningCarParams = {
      ...sampleCar,
      weight: 2100,
      maxHp: 85,
      maxTorque: 120,
      maxHpRpm: 4200,
      maxTorqueRpm: 2400,
      rearTireWidth: 205,
      rearTireAspect: 65,
      rearTireRim: 15
    };

    const result = calculateAEGOGearing('Road', 6, weakEngineCar, 5000);

    expect(result.finalDrive).toBeLessThanOrEqual(6.1);
    expect(result.gears[0]).toBeGreaterThanOrEqual(1.0);
  });

  it('preserves total drive ratios while moving the editable split toward a neutral final drive', () => {
    const result = calculateAEGOGearing('Road', 6, sampleCar, 7500);
    const tireCircumferenceM = (((245 * 0.40) * 2 + 18 * 25.4) * Math.PI) / 1000;
    const expectedFirstTotalRatio = (6500 * tireCircumferenceM * 60) / (90 * 1.15 * 1000);

    expect(result.finalDrive).toBeLessThanOrEqual(4.5);
    expect(result.gears[0]).toBeGreaterThanOrEqual(1.0);
    expect(result.gears[0] * result.finalDrive).toBeCloseTo(expectedFirstTotalRatio, 1);
  });

  it('Drift goal should produce different gearing than Road', () => {
    const road = calculateAEGOGearing('Road', 6, sampleCar, 7500);
    const drift = calculateAEGOGearing('Drift', 6, sampleCar, 7500);
    expect(drift.finalDrive).not.toBe(road.finalDrive);
  });

  it('should gracefully handle missing carParams', () => {
    const result = calculateAEGOGearing('Road', 6, null, 7000);
    expect(result.gears).toHaveLength(6);
    expect(result.finalDrive).toBeGreaterThanOrEqual(2.0);
  });

  it('should reflect aeroEfficiency on Road gearing calculations', () => {
    const lowEfficiencyCar: TuningCarParams = { ...sampleCar, aeroEfficiency: 0.20 };
    const highEfficiencyCar: TuningCarParams = { ...sampleCar, aeroEfficiency: 0.80 };
    
    const lowRes = calculateAEGOGearing('Road', 6, lowEfficiencyCar, 7500);
    const highRes = calculateAEGOGearing('Road', 6, highEfficiencyCar, 7500);

    expect(highRes.finalDrive).not.toBe(lowRes.finalDrive);
  });

  it('Vehicle 3847 (Mustang Dark Horse) Road gearing should maintain physical reasonableness and closed-loop smooth progression', () => {
    const mustang3847: TuningCarParams = {
      weight: 1804,
      weight_distribution: 54,
      drivetrain: 'RWD',
      induction: 'Supercharger',
      maxHp: 882,
      maxTorque: 665,
      maxHpRpm: 7500,
      maxTorqueRpm: 4750,
      aeroEfficiency: 0.68,
      rearTireWidth: 335,
      rearTireAspect: 25,
      rearTireRim: 20
    };

    const res = calculateAEGOGearing('Road', 6, mustang3847, 8625);
    expect(res.gears).toHaveLength(6);

    // 1. Verify FD is within the in-game valid range [2.0, 6.1]
    expect(res.finalDrive).toBeGreaterThanOrEqual(2.0);
    expect(res.finalDrive).toBeLessThanOrEqual(6.1);

    // 2. Verify monotonic decrease (g1 > g2 > ... > g6)
    for (let i = 1; i < res.gears.length; i++) {
      expect(res.gears[i]).toBeLessThan(res.gears[i - 1]);
    }

    // 3. Verify shift RPM drops from maxHpRpm (7500 RPM) remain inside powerband (>= maxTorqueRpm 4750 RPM)
    for (let i = 1; i < res.gears.length; i++) {
      const shiftRpm = 7500 * (res.gears[i] / res.gears[i - 1]);
      expect(shiftRpm).toBeGreaterThanOrEqual(4750);
    }

    // 5. Verify smooth step ratio progression without cliff drop (R_{i+1} >= R_i - 0.05)
    for (let i = 1; i < res.gears.length - 1; i++) {
      const stepRatioCurrent = res.gears[i] / res.gears[i - 1];
      const stepRatioNext = res.gears[i + 1] / res.gears[i];
      expect(stepRatioNext).toBeGreaterThanOrEqual(stepRatioCurrent - 0.05);
    }
  });

  it('should support secondary correction with simulatedTopSpeed and softMaxSpeed', () => {
    const baseRes = calculateAEGOGearing('Road', 6, sampleCar, 7500);

    // 1. Lower simulatedTopSpeed should adjust top gear / FD setup to be shorter
    const correctedLower = calculateAEGOGearing('Road', 6, sampleCar, 7500, {
      simulatedTopSpeed: 200
    });
    expect(correctedLower.gears[5] * correctedLower.finalDrive).toBeGreaterThan(baseRes.gears[5] * baseRes.finalDrive);

    // 2. softMaxSpeed clamping
    const correctedSoftCap = calculateAEGOGearing('Road', 6, sampleCar, 7500, {
      softMaxSpeed: 180
    });
    expect(correctedSoftCap.gears[5] * correctedSoftCap.finalDrive).toBeGreaterThan(baseRes.gears[5] * baseRes.finalDrive);

    // 3. Graceful handling of invalid or empty secondary correction
    const fallbackRes = calculateAEGOGearing('Road', 6, sampleCar, 7500, {
      simulatedTopSpeed: 0,
      softMaxSpeed: -10
    });
    expect(fallbackRes.finalDrive).toBe(baseRes.finalDrive);
  });

  it('should dynamically bound top gear speed within softMaxSpeed at redline RPM without hardcoded values', () => {
    const carParams: TuningCarParams = {
      weight: 1679,
      weight_distribution: 54,
      drivetrain: 'RWD',
      induction: 'Supercharger',
      maxHp: 909,
      maxTorque: 687,
      maxHpRpm: 7500,
      maxTorqueRpm: 4750,
      aeroEfficiency: 0.68,
      rearTireWidth: 335,
      rearTireAspect: 30,
      rearTireRim: 19
    };

    const maxRpm = Math.round((carParams.maxHpRpm || 7000) * 1.15);
    const softMaxSpeed = 334;
    const simulatedTopSpeed = 310.2;

    const res = calculateAEGOGearing('Road', 6, carParams, maxRpm, {
      simulatedTopSpeed,
      softMaxSpeed
    });

    // Compute tire radius dynamically from car parameters
    const wallMm = ((carParams.rearTireWidth || 245) * (carParams.rearTireAspect || 40)) / 100;
    const rimMm = (carParams.rearTireRim || 18) * 25.4;
    const tireRadiusM = (wallMm * 2 + rimMm) / 2000;

    const topGearRatio = res.gears[5];
    const speedAtRedlineKmh = calcGearSpeed(maxRpm, topGearRatio, res.finalDrive, tireRadiusM) * 3.6;
    const speedAtPeakHpKmh = calcGearSpeed(carParams.maxHpRpm, topGearRatio, res.finalDrive, tireRadiusM) * 3.6;

    // 1. Dynamic Assertion: Redline speed must be bounded within softMaxSpeed (with tiny float margin)
    expect(speedAtRedlineKmh).toBeLessThanOrEqual(softMaxSpeed + 0.5);

    // 2. Dynamic Assertion: Peak HP speed must be bounded by simulatedTopSpeed or softMaxSpeed scaled
    const expectedPeakHpCap = Math.min(simulatedTopSpeed, softMaxSpeed * (carParams.maxHpRpm / maxRpm));
    expect(speedAtPeakHpKmh).toBeLessThanOrEqual(expectedPeakHpCap + 0.5);

    // 3. Dynamic Assertion: All gear ratios must remain strictly monotonically decreasing
    for (let i = 1; i < res.gears.length; i++) {
      expect(res.gears[i]).toBeLessThan(res.gears[i - 1]);
    }
  });

  it('Vehicle 3594 Road gearing should tighten final drive, align shift RPMs to powerband, and correct simulatedTopSpeed at redline', () => {
    const car3594: TuningCarParams = {
      weight: 1668.77,
      weight_distribution: 50,
      drivetrain: 'RWD',
      induction: 'TwinTurbo',
      maxHp: 770,
      maxTorque: 666,
      maxHpRpm: 5750,
      maxTorqueRpm: 2750,
      aeroEfficiency: 0.685,
      rearTireWidth: 315,
      rearTireAspect: 30,
      rearTireRim: 20
    };

    const maxRpm = Math.round(car3594.maxHpRpm * 1.15); // 6613 RPM
    
    // 1. Baseline Road Gearing
    const baseRes = calculateAEGOGearing('Road', 7, car3594, maxRpm);
    expect(baseRes.gears).toHaveLength(7);
    expect(baseRes.finalDrive).toBeGreaterThanOrEqual(3.0); // Should be tightened compared to old ~2.96

    // 2. Verify monotonic decrease
    for (let i = 1; i < baseRes.gears.length; i++) {
      expect(baseRes.gears[i]).toBeLessThan(baseRes.gears[i - 1]);
    }

    // 3. Verify ALL shift RPMs (from 1->2 up to highest gear) drop into effective powerband <= maxHpRpm
    for (let i = 1; i < baseRes.gears.length; i++) {
      const shiftRpm = maxRpm * (baseRes.gears[i] / baseRes.gears[i - 1]);
      expect(shiftRpm).toBeLessThanOrEqual(car3594.maxHpRpm + 50);
    }

    // 4. Secondary Correction with simulatedTopSpeed = 290 km/h
    const correctedRes = calculateAEGOGearing('Road', 7, car3594, maxRpm, {
      simulatedTopSpeed: 290
    });

    const wallMm = (car3594.rearTireWidth! * car3594.rearTireAspect!) / 100;
    const rimMm = car3594.rearTireRim! * 25.4;
    const tireRadiusM = (wallMm * 2 + rimMm) / 2000;
    const topGearRatio = correctedRes.gears[6];

    const redlineSpeedKmh = calcGearSpeed(maxRpm, topGearRatio, correctedRes.finalDrive, tireRadiusM) * 3.6;
    expect(redlineSpeedKmh).toBeLessThanOrEqual(290 + 1.0);
  });

  it('drivetrain launch factor should adjust 1st gear target speed (AWD shorter 1st gear than RWD)', () => {
    const awdCar: TuningCarParams = { ...sampleCar, drivetrain: 'AWD' };
    const rwdCar: TuningCarParams = { ...sampleCar, drivetrain: 'RWD' };

    const awdRes = calculateAEGOGearing('Road', 6, awdCar, 7500);
    const rwdRes = calculateAEGOGearing('Road', 6, rwdCar, 7500);

    // AWD 1st gear ratio should be larger than RWD for shorter 1st gear launch
    expect(awdRes.gears[0]).toBeGreaterThan(rwdRes.gears[0]);
  });

  it('should prioritize raising Final Drive on secondary correction without over-compressing top gear or making earlier gears dense', () => {
    const baseRes = calculateAEGOGearing('Road', 6, sampleCar, 7500);

    // Baseline redline speed is around 280 km/h, test secondary correction with simulatedTopSpeed = 220 km/h
    const correctedRes = calculateAEGOGearing('Road', 6, sampleCar, 7500, {
      simulatedTopSpeed: 220
    });

    // 1. Primary scaling: Final Drive must be increased significantly to absorb the speed reduction
    expect(correctedRes.finalDrive).toBeGreaterThan(baseRes.finalDrive);

    // 2. Usability: Top gear ratio (Gear 6) must remain near baseline target without being over-compressed
    expect(correctedRes.gears[5]).toBeCloseTo(baseRes.gears[5], 1);

    // 3. Spacing: Earlier gears (1st, 2nd, 3rd) retain their uncompressed spacing
    expect(correctedRes.gears[0]).toBe(baseRes.gears[0]);
    expect(correctedRes.gears[1]).toBe(baseRes.gears[1]);

    // 4. Top Gear Usability Guard: Step ratio of the final gear must not exceed 0.90
    const topStepRatio = correctedRes.gears[5] / correctedRes.gears[4];
    expect(topStepRatio).toBeLessThanOrEqual(0.90);
    expect(topStepRatio).toBeGreaterThanOrEqual(0.70);
  });

  it('should clamp FD to 6.1 and apply top gear usability guard on extreme low simulatedTopSpeed', () => {
    const extremeLowRes = calculateAEGOGearing('Road', 6, sampleCar, 7500, {
      simulatedTopSpeed: 130
    });

    // 1. FD is clamped to maximum in-game limit 6.1
    expect(extremeLowRes.finalDrive).toBe(6.1);

    // 2. All gears must remain strictly monotonic
    for (let i = 1; i < extremeLowRes.gears.length; i++) {
      expect(extremeLowRes.gears[i]).toBeLessThan(extremeLowRes.gears[i - 1]);
    }

    // 3. Top gear step ratio remains bounded by usability guard <= 0.90
    const topStepRatio = extremeLowRes.gears[5] / extremeLowRes.gears[4];
    expect(topStepRatio).toBeLessThanOrEqual(0.90);
  });

  it('should generate healthy baseline final drive and gear ratios across gear counts (4 to 10 gears)', () => {
    for (let count = 4; count <= 10; count++) {
      const res = calculateAEGOGearing('Road', count, sampleCar, 7500);

      expect(res.gears).toHaveLength(count);
      expect(res.finalDrive).toBeGreaterThanOrEqual(2.2);
      expect(res.finalDrive).toBeLessThanOrEqual(6.1);
      expect(res.gears[0]).toBeGreaterThanOrEqual(1.2);
      expect(res.gears[count - 1]).toBeLessThanOrEqual(1.0);

      // Monotonicity across all gears
      for (let i = 1; i < count; i++) {
        expect(res.gears[i]).toBeLessThan(res.gears[i - 1]);
      }
    }
  });
});

// ============================================================
// resolveAeroDownforce
// ============================================================
describe('resolveAeroDownforce', () => {
  const baseCar: TuningCarParams = {
    weight: 1500,
    weight_distribution: 52,
    drivetrain: 'RWD',
    maxHp: 400,
    maxTorque: 500,
    maxHpRpm: 6000,
    maxTorqueRpm: 4000
  };

  it('should return explicit non-zero downforce values directly', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 120, aero_downforce_rear: 150 };
    const aero = resolveAeroDownforce(car);
    expect(aero.front).toBe(120);
    expect(aero.rear).toBe(150);
  });

  it('should derive rear downforce when only front downforce is specified', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 100, aero_downforce_rear: 0 };
    const aero = resolveAeroDownforce(car);
    expect(aero.front).toBe(100);
    expect(aero.rear).toBeGreaterThan(0);
  });

  it('should derive front downforce when only rear downforce is specified', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 0, aero_downforce_rear: 150 };
    const aero = resolveAeroDownforce(car);
    expect(aero.rear).toBe(150);
    expect(aero.front).toBeGreaterThan(0);
  });

  it('should derive both front and rear downforce when both are zero/unspecified', () => {
    const car: TuningCarParams = { ...baseCar, aero_downforce_front: 0, aero_downforce_rear: 0 };
    const aero = resolveAeroDownforce(car);
    expect(aero.front).toBeGreaterThan(0);
    expect(aero.rear).toBeGreaterThan(0);
    // RWD has 0.82 modifier, so rear should have higher proportion
    expect(aero.rear).toBeGreaterThan(aero.front);
  });
});

// ============================================================
// calculateChassisTuning (Step3)
// ============================================================
describe('calculateChassisTuning (Step3)', () => {
  const roadCar: TuningCarParams = {
    weight: 1400,
    weight_distribution: 54,
    drivetrain: 'RWD',
    maxHp: 450,
    maxTorque: 520,
    maxHpRpm: 6800,
    maxTorqueRpm: 4600,
    spring_front_min: 15.0,
    spring_front_max: 150.0,
    spring_rear_min: 15.0,
    spring_rear_max: 150.0,
    height_front_min: 8.0,
    height_front_max: 20.0,
    height_rear_min: 8.0,
    height_rear_max: 20.0
  };

  it('Road race goal should calculate correct ARB, Springs, Damping, and Diff values', () => {
    const res = calculateChassisTuning('Road', roadCar);
    expect(res.arb.front).toBeGreaterThan(0);
    expect(res.arb.rear).toBeGreaterThan(0);
    expect(res.springs.front).toBeGreaterThanOrEqual(15.0);
    expect(res.springs.rear).toBeGreaterThanOrEqual(15.0);
    expect(res.damping.bumpF).toBe(Math.round(res.damping.reboundF * 0.60 * 10) / 10);
    expect(res.diff.accelR).toBeGreaterThan(0);
  });

  it('AWD Road car should apply Meta ARB Strategy and Center Torque Split', () => {
    const awdCar: TuningCarParams = { ...roadCar, drivetrain: 'AWD' };
    const res = calculateChassisTuning('Road', awdCar);
    // Meta ARB strategy: front ARB is kept very low (<= 5.0), rear high (>= 50.0)
    expect(res.arb.front).toBeLessThanOrEqual(5.0);
    expect(res.arb.rear).toBeGreaterThanOrEqual(50.0);
    expect(res.diff.centerRear).toBeGreaterThanOrEqual(60);
  });

  it('Drift goal should set extreme front-soft rear-stiff ARB and symmetric damping', () => {
    const res = calculateChassisTuning('Drift', roadCar);
    expect(res.arb.front).toBe(10.0);
    expect(res.arb.rear).toBe(50.0);
    expect(res.damping.reboundF).toBe(6.0);
    expect(res.damping.reboundR).toBe(6.0);
    expect(res.damping.bumpF).toBe(3.0);
    expect(res.damping.bumpR).toBe(3.0);
    expect(res.diff.accelR).toBe(100);
  });

  it('Rally goal should soften ARBs and springs, and set max ride height', () => {
    const roadRes = calculateChassisTuning('Road', roadCar);
    const rallyRes = calculateChassisTuning('Rally', roadCar);

    expect(rallyRes.arb.front).toBeLessThan(roadRes.arb.front);
    expect(rallyRes.arb.rear).toBeLessThan(roadRes.arb.rear);
    expect(rallyRes.springs.heightF).toBe(roadCar.height_front_max);
    expect(rallyRes.springs.heightR).toBe(roadCar.height_rear_max);
    expect(rallyRes.damping.bumpF).toBe(Math.round(rallyRes.damping.reboundF * 0.40 * 10) / 10);
  });

  it('Drag goal should set soft front ARB, stiff rear ARB, and forward rake ride height (Front Low, Rear High)', () => {
    const res = calculateChassisTuning('Drag', roadCar);
    expect(res.arb.front).toBe(1.0);
    expect(res.arb.rear).toBe(65.0);
    expect(res.springs.heightF).toBe(roadCar.height_front_min);
    expect(res.springs.heightR).toBe(roadCar.height_rear_max);
    expect(res.springs.rear).toBeGreaterThan(res.springs.front);
    expect(res.damping.reboundF).toBe(3.0);
    expect(res.damping.bumpF).toBe(4.0);
    expect(res.damping.reboundR).toBe(12.0);
    expect(res.damping.bumpR).toBe(10.0);
  });

  it('Car 1601 (930 HP AWD Lambo) Drag goal should achieve >360 km/h top speed in 4th gear and correct Forward Rake stance', () => {
    const car1601: TuningCarParams = {
      weight: 1419.29,
      weight_distribution: 44,
      drivetrain: 'AWD',
      induction: 'TwinTurbo',
      maxHp: 930,
      maxTorque: 628,
      maxHpRpm: 8500,
      maxTorqueRpm: 6500,
      aeroBalance: 0.5,
      aeroEfficiency: 0.46,
      frontTireWidth: 285,
      frontTireAspect: 30,
      frontTireRim: 19,
      rearTireWidth: 345,
      rearTireAspect: 25,
      rearTireRim: 19,
      spring_front_min: 57.9,
      spring_front_max: 289.5,
      spring_rear_min: 57.9,
      spring_rear_max: 289.5,
      height_front_min: 10.5,
      height_front_max: 15.0,
      height_rear_min: 9.5,
      height_rear_max: 14.0
    };

    // 1. Gearing test for 6-speed gearbox
    const gearingRes = calculateAEGOGearing('Drag', 6, car1601, 8500);
    expect(gearingRes.gears).toHaveLength(6);
    expect(gearingRes.gears[3]).toBe(1.0); // 4th gear = 1.0
    expect(gearingRes.gears[4]).toBe(1.0); // 5th gear = 4th gear (4-speed constraint)
    expect(gearingRes.gears[5]).toBe(1.0); // 6th gear = 4th gear (4-speed constraint)

    // Calculate speed in 4th gear at peak HP RPM (8500 RPM)
    const wallMm = (345 * 25) / 100;
    const rimMm = 19 * 25.4;
    const tireRadiusM = (wallMm * 2 + rimMm) / 2000;
    const speedAtPeakHpKmh = calcGearSpeed(8500, gearingRes.gears[3], gearingRes.finalDrive, tireRadiusM) * 3.6;

    // 4th gear speed at Peak HP RPM MUST exceed 360 km/h for 930 HP AWD Drag car
    expect(speedAtPeakHpKmh).toBeGreaterThan(360.0);

    // 2. Chassis test
    const chassisRes = calculateChassisTuning('Drag', car1601);
    expect(chassisRes.springs.heightF).toBe(10.5); // Front MIN
    expect(chassisRes.springs.heightR).toBe(14.0); // Rear MAX (Forward Rake)
    expect(chassisRes.springs.rear).toBeGreaterThan(chassisRes.springs.front); // Stiff Rear Springs for heavy launch torque
  });

  it('should enforce safety clamping within user-defined slider limits', () => {
    const extremeCar: TuningCarParams = {
      ...roadCar,
      weight: 3000,
      weight_distribution: 90,
      spring_front_min: 20.0,
      spring_front_max: 50.0
    };
    const res = calculateChassisTuning('Road', extremeCar);
    expect(res.springs.front).toBeLessThanOrEqual(50.0);
    expect(res.springs.front).toBeGreaterThanOrEqual(20.0);
    expect(res.arb.front).toBeLessThanOrEqual(65.0);
    expect(res.arb.rear).toBeLessThanOrEqual(65.0);
  });
});

// ============================================================
// calculateStaticTireAlignment
// ============================================================
describe('calculateStaticTireAlignment', () => {
  const sampleCar: TuningCarParams = {
    weight: 1350,
    weight_distribution: 54,
    drivetrain: 'AWD',
    maxHp: 400,
    maxTorque: 500,
    maxHpRpm: 6500,
    maxTorqueRpm: 4000,
    frontTireWidth: 245,
    frontTireAspect: 40,
    frontTireRim: 18,
    rearTireWidth: 275,
    rearTireAspect: 35,
    rearTireRim: 18
  };

  it('should calculate tire sidewall heights correctly', () => {
    const res = calculateStaticTireAlignment('Road', 'Summer', sampleCar);
    expect(res.hwF).toBe(98); // 245 * 0.40 = 98mm
    expect(res.hwR).toBe(96.3); // 275 * 0.35 = 96.25 -> 96.3mm
  });

  it('should apply season bias correctly (+0.5 for Winter, -0.5 for Summer)', () => {
    const resSummer = calculateStaticTireAlignment('Road', 'Summer', sampleCar);
    const resWinter = calculateStaticTireAlignment('Road', 'Winter', sampleCar);
    expect(resSummer.seasonBias).toBe(-0.5);
    expect(resWinter.seasonBias).toBe(0.5);
    expect(resWinter.pcF - resSummer.pcF).toBeCloseTo(1.0, 1);
  });

  it('should calculate specific discipline values for Drift mode', () => {
    const resDrift = calculateStaticTireAlignment('Drift', 'Summer', sampleCar);
    expect(resDrift.targetPhot).toBe(21.0);
    expect(resDrift.camber.front).toBe(-4.8);
    expect(resDrift.camber.rear).toBe(-0.5);
    expect(resDrift.caster).toBe(7.0);
  });

  it('should calculate specific discipline values for Rally mode', () => {
    const resRally = calculateStaticTireAlignment('Rally', 'Summer', sampleCar);
    expect(resRally.targetPhot).toBe(27.5);
    expect(resRally.camber.front).toBe(-1.3);
    expect(resRally.camber.rear).toBe(-0.8);
    expect(resRally.toe.front).toBe('+0.2°');
    expect(resRally.toe.rear).toBe('0.0°');
  });
});


