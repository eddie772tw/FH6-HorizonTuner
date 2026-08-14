import { describe, expect, it } from 'vitest';
import { calculateLoadTransfer, LoadTransferInput } from './loadTransfer';

describe('loadTransfer', () => {
  const nominalInput: LoadTransferInput = {
    massKg: 1500,
    weightDistributionFrontPct: 54,
    wheelbaseM: 2.65,
    cgHeightM: 0.48,
    trackFrontM: 1.58,
    trackRearM: 1.58,
    accelLongitudinalMPerS2: 0,
    accelLateralMPerS2: 0,
    rollStiffnessDistributionFrontPct: 50
  };

  it('computes exact static wheel loads with left-right symmetry at zero acceleration', () => {
    const result = calculateLoadTransfer(nominalInput);

    const totalWeightN = 1500 * 9.80665;
    expect(result.staticAxleLoadsN.total).toBeCloseTo(totalWeightN, 1);
    expect(result.staticAxleLoadsN.front).toBeCloseTo(totalWeightN * 0.54, 1);
    expect(result.staticAxleLoadsN.rear).toBeCloseTo(totalWeightN * 0.46, 1);

    // Left-right symmetry
    expect(result.staticWheelLoadsN.frontLeft).toBe(result.staticWheelLoadsN.frontRight);
    expect(result.staticWheelLoadsN.rearLeft).toBe(result.staticWheelLoadsN.rearRight);
    expect(result.dynamicWheelLoadsN.frontLeft).toBe(result.staticWheelLoadsN.frontLeft);
    expect(result.dynamicWheelLoadsN.frontRight).toBe(result.staticWheelLoadsN.frontRight);
    expect(result.dynamicWheelLoadsN.rearLeft).toBe(result.staticWheelLoadsN.rearLeft);
    expect(result.dynamicWheelLoadsN.rearRight).toBe(result.staticWheelLoadsN.rearRight);

    // Transfers are zero
    expect(result.transfersN.longitudinalTransferN).toBe(0);
    expect(result.transfersN.lateralTransferTotalN).toBe(0);
    expect(result.isClamped).toBe(false);
    expect(result.clampedWheels).toHaveLength(0);
  });

  it('demonstrates monotonic longitudinal load transfer with positive ax transferring rearward', () => {
    const accelValues = [-8.0, -4.0, -1.0, 0.0, 2.0, 5.0, 9.0];
    const results = accelValues.map((ax) =>
      calculateLoadTransfer({
        ...nominalInput,
        accelLongitudinalMPerS2: ax
      })
    );

    // Front axle load decreases monotonically as ax increases
    for (let i = 1; i < results.length; i++) {
      expect(results[i].unclampedWheelLoadsN.frontLeft).toBeLessThan(results[i - 1].unclampedWheelLoadsN.frontLeft);
      expect(results[i].unclampedWheelLoadsN.rearLeft).toBeGreaterThan(results[i - 1].unclampedWheelLoadsN.rearLeft);
      expect(results[i].transfersN.longitudinalTransferN).toBeGreaterThan(results[i - 1].transfersN.longitudinalTransferN);
    }

    // Explicit sign checks
    const braking = results[0]; // ax = -8 m/s^2 (braking)
    expect(braking.transfersN.longitudinalTransferN).toBeLessThan(0);
    expect(braking.dynamicAxleLoadsN.front).toBeGreaterThan(braking.staticAxleLoadsN.front);
    expect(braking.dynamicAxleLoadsN.rear).toBeLessThan(braking.staticAxleLoadsN.rear);

    const accelerating = results[results.length - 1]; // ax = +9 m/s^2 (throttle)
    expect(accelerating.transfersN.longitudinalTransferN).toBeGreaterThan(0);
    expect(accelerating.dynamicAxleLoadsN.front).toBeLessThan(accelerating.staticAxleLoadsN.front);
    expect(accelerating.dynamicAxleLoadsN.rear).toBeGreaterThan(accelerating.staticAxleLoadsN.rear);
  });

  it('demonstrates monotonic lateral load transfer with positive ay transferring rightward', () => {
    const ayValues = [-6.0, -3.0, 0.0, 3.0, 6.0];
    const results = ayValues.map((ay) =>
      calculateLoadTransfer({
        ...nominalInput,
        accelLateralMPerS2: ay
      })
    );

    for (let i = 1; i < results.length; i++) {
      // Right wheels gain load
      expect(results[i].unclampedWheelLoadsN.frontRight).toBeGreaterThan(results[i - 1].unclampedWheelLoadsN.frontRight);
      expect(results[i].unclampedWheelLoadsN.rearRight).toBeGreaterThan(results[i - 1].unclampedWheelLoadsN.rearRight);
      // Left wheels lose load
      expect(results[i].unclampedWheelLoadsN.frontLeft).toBeLessThan(results[i - 1].unclampedWheelLoadsN.frontLeft);
      expect(results[i].unclampedWheelLoadsN.rearLeft).toBeLessThan(results[i - 1].unclampedWheelLoadsN.rearLeft);
    }

    const rightwardTurn = results[results.length - 1]; // ay = +6 m/s^2
    expect(rightwardTurn.transfersN.lateralTransferTotalN).toBeGreaterThan(0);
    expect(rightwardTurn.dynamicWheelLoadsN.frontRight).toBeGreaterThan(rightwardTurn.dynamicWheelLoadsN.frontLeft);
    expect(rightwardTurn.dynamicWheelLoadsN.rearRight).toBeGreaterThan(rightwardTurn.dynamicWheelLoadsN.rearLeft);
  });

  it('applies roll stiffness distribution accurately between front and rear axles', () => {
    const default5050 = calculateLoadTransfer({
      ...nominalInput,
      accelLateralMPerS2: 5.0,
      rollStiffnessDistributionFrontPct: 50
    });
    expect(default5050.transfersN.lateralTransferFrontN).toBeCloseTo(default5050.transfersN.lateralTransferRearN, 2);

    const frontBiased = calculateLoadTransfer({
      ...nominalInput,
      accelLateralMPerS2: 5.0,
      rollStiffnessDistributionFrontPct: 65
    });
    expect(frontBiased.transfersN.lateralTransferFrontN).toBeGreaterThan(frontBiased.transfersN.lateralTransferRearN);
    const totalLat = frontBiased.transfersN.lateralTransferTotalN;
    expect(frontBiased.transfersN.lateralTransferFrontN / totalLat).toBeCloseTo(0.65, 3);
    expect(frontBiased.transfersN.lateralTransferRearN / totalLat).toBeCloseTo(0.35, 3);
  });

  it('conserves total vertical load exactly before clamping across diverse 2D acceleration test matrix', () => {
    const testCases: [number, number][] = [
      [0, 0],
      [4, 0],
      [-6, 0],
      [0, 5],
      [0, -5],
      [3, 4],
      [-4, 3],
      [6, -6],
      [-5, -5]
    ];

    const totalWeightN = nominalInput.massKg! * 9.80665;

    for (const [ax, ay] of testCases) {
      const result = calculateLoadTransfer({
        ...nominalInput,
        accelLongitudinalMPerS2: ax,
        accelLateralMPerS2: ay
      });

      const unclampedSum =
        result.unclampedWheelLoadsN.frontLeft +
        result.unclampedWheelLoadsN.frontRight +
        result.unclampedWheelLoadsN.rearLeft +
        result.unclampedWheelLoadsN.rearRight;

      expect(unclampedSum).toBeCloseTo(totalWeightN, 1);
    }
  });

  it('detects wheel lift and clamps dynamic wheel loads to non-negative with explicit warnings', () => {
    // Extreme combination causing left-side rollover condition: high ay + high ax
    const extremeResult = calculateLoadTransfer({
      ...nominalInput,
      cgHeightM: 0.85,
      accelLongitudinalMPerS2: 9.5,
      accelLateralMPerS2: 12.0
    });

    expect(extremeResult.isClamped).toBe(true);
    expect(extremeResult.clampedWheels).toContain('frontLeft');
    expect(extremeResult.unclampedWheelLoadsN.frontLeft).toBeLessThan(0);
    expect(extremeResult.dynamicWheelLoadsN.frontLeft).toBe(0);
    expect(extremeResult.dynamicWheelLoadsN.frontRight).toBeGreaterThan(0);
    expect(extremeResult.warnings.some((w) => w.includes('Wheel lift detected'))).toBe(true);
  });

  it('handles G-based inputs as direct acceleration equivalents', () => {
    const resMPerS = calculateLoadTransfer({
      ...nominalInput,
      accelLongitudinalMPerS2: 9.80665,
      accelLateralMPerS2: 4.903325
    });

    const resG = calculateLoadTransfer({
      ...nominalInput,
      accelLongitudinalMPerS2: undefined,
      accelLateralMPerS2: undefined,
      accelLongitudinalG: 1.0,
      accelLateralG: 0.5
    });

    expect(resG.transfersN.longitudinalTransferN).toBeCloseTo(resMPerS.transfersN.longitudinalTransferN, 2);
    expect(resG.transfersN.lateralTransferTotalN).toBeCloseTo(resMPerS.transfersN.lateralTransferTotalN, 2);
    expect(resG.dynamicWheelLoadsN.frontLeft).toBeCloseTo(resMPerS.dynamicWheelLoadsN.frontLeft, 2);
  });

  it('safely handles zero, negative, and invalid parameters with fallbacks and finite outputs', () => {
    const invalidInputs: LoadTransferInput[] = [
      { massKg: 0, wheelbaseM: 0, cgHeightM: 0, trackWidthM: 0 },
      { massKg: -500, wheelbaseM: -2, cgHeightM: -0.5, trackFrontM: -1 },
      { massKg: NaN, weightDistributionFrontPct: NaN, wheelbaseM: Infinity },
      {}
    ];

    for (const badInput of invalidInputs) {
      const output = calculateLoadTransfer(badInput);

      expect(Number.isFinite(output.staticAxleLoadsN.total)).toBe(true);
      expect(output.staticAxleLoadsN.total).toBeGreaterThan(0);
      expect(Number.isFinite(output.dynamicWheelLoadsN.frontLeft)).toBe(true);
      expect(output.dynamicWheelLoadsN.frontLeft).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(output.dynamicWheelLoadsN.frontRight)).toBe(true);
      expect(output.dynamicWheelLoadsN.frontRight).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(output.dynamicWheelLoadsN.rearLeft)).toBe(true);
      expect(output.dynamicWheelLoadsN.rearLeft).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(output.dynamicWheelLoadsN.rearRight)).toBe(true);
      expect(output.dynamicWheelLoadsN.rearRight).toBeGreaterThanOrEqual(0);
      expect(output.warnings.length).toBeGreaterThan(0);
    }
  });
});
