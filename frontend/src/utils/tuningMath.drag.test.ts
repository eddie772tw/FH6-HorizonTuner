import { describe, expect, it } from 'vitest';
import { calcGearSpeed, calculateAEGOGearing, calculateChassisTuning, calculateMeasuredGearing, calculateStaticTireAlignment, type TuningCarParams } from './tuningMath';

const dragCar: TuningCarParams = {
  weight: 1500,
  weight_distribution: 52,
  drivetrain: 'AWD',
  maxHp: 700,
  maxTorque: 720,
  maxHpRpm: 7500,
  maxTorqueRpm: 5200,
  aeroEfficiency: 0.45,
  rearTireWidth: 305,
  rearTireAspect: 30,
  rearTireRim: 19
};

describe('Drag AEGO meta branch', () => {
  it('uses every requested gear instead of copying fourth gear', () => {
    const result = calculateAEGOGearing('Drag', 6, dragCar, 8500);
    expect(result.gears).toHaveLength(6);
    for (let index = 1; index < result.gears.length; index += 1) {
      expect(result.gears[index]).toBeLessThan(result.gears[index - 1]);
    }
    expect(result.gears[3]).not.toBe(result.gears[5]);
  });

  it('lets a measured terminal speed replace the engineering prior', () => {
    const measuredTopSpeed = 280;
    const result = calculateAEGOGearing('Drag', 6, dragCar, 8500, {
      dragFinishSpeedKmh: measuredTopSpeed,
      dragFinishSpeedProvenance: 'telemetry'
    });
    const wallMm = (dragCar.rearTireWidth! * dragCar.rearTireAspect!) / 100;
    const rimMm = dragCar.rearTireRim! * 25.4;
    const radiusM = (wallMm * 2 + rimMm) / 2000;
    const terminalKmh = calcGearSpeed(dragCar.maxHpRpm, result.gears[5], result.finalDrive, radiusM) * 3.6;
    expect(terminalKmh).toBeCloseTo(measuredTopSpeed, 0);
  });

  it('keeps simulatedTopSpeed semantics separate from an explicit finish measurement', () => {
    const baseline = calculateAEGOGearing('Drag', 6, dragCar, 8500);
    const simulated = calculateAEGOGearing('Drag', 6, dragCar, 8500, { simulatedTopSpeed: 180 });
    const unprovenFinish = calculateAEGOGearing('Drag', 6, dragCar, 8500, { dragFinishSpeedKmh: 180 });
    const measured = calculateAEGOGearing('Drag', 6, dragCar, 8500, {
      dragFinishSpeedKmh: 180,
      dragFinishSpeedProvenance: 'manual'
    });
    expect(unprovenFinish).toEqual(baseline);
    expect(simulated).not.toEqual(baseline);
    expect(measured).not.toEqual(baseline);
  });

  it('does not use softMaxSpeed as a Drag vehicle speed estimate', () => {
    const baseline = calculateAEGOGearing('Drag', 6, dragCar, 8500);
    const previewCapped = calculateAEGOGearing('Drag', 6, dragCar, 8500, { softMaxSpeed: 180 });
    expect(previewCapped.finalDrive).toBe(baseline.finalDrive);
    expect(previewCapped.gears).toEqual(baseline.gears);
  });

  it('changes differential lock by driven axle after launch load transfer', () => {
    const fwd = calculateChassisTuning('Drag', { ...dragCar, drivetrain: 'FWD' });
    const rwd = calculateChassisTuning('Drag', { ...dragCar, drivetrain: 'RWD' });
    const awd = calculateChassisTuning('Drag', { ...dragCar, drivetrain: 'AWD' });
    expect(fwd.diff.accelF).toBe(85);
    expect(fwd.diff.accelR).toBe(0);
    expect(rwd.diff.accelR).toBe(85);
    expect(rwd.diff.accelF).toBe(0);
    expect(awd.diff.accelF).toBe(85);
    expect(awd.diff.accelR).toBe(65);
    expect(awd.diff.centerRear).toBe(75);
  });

  it('uses low front and high rear pressure as an FWD engineering prior', () => {
    const fwd = calculateStaticTireAlignment('Drag', 'Summer', { ...dragCar, drivetrain: 'FWD' });
    const rwd = calculateStaticTireAlignment('Drag', 'Summer', { ...dragCar, drivetrain: 'RWD' });
    expect(fwd.pcF).toBeLessThan(fwd.pcR);
    expect(rwd.pcF).toBeGreaterThan(rwd.pcR);
  });

  it.each([4, 5, 6, 7, 8, 9, 10])('keeps %s-speed Drag gearing finite and descending at finish-speed extremes', (gearCount) => {
    for (const finishSpeed of [80, 180, 650]) {
      const result = calculateAEGOGearing('Drag', gearCount, dragCar, 8500, {
        dragFinishSpeedKmh: finishSpeed,
        dragFinishSpeedProvenance: 'telemetry'
      });
      expect(result.gears).toHaveLength(gearCount);
      expect(Number.isFinite(result.finalDrive)).toBe(true);
      for (let index = 0; index < gearCount; index += 1) {
        expect(result.gears[index]).toBeGreaterThan(0);
        expect(Number.isFinite(result.gears[index])).toBe(true);
        if (index > 0) expect(result.gears[index]).toBeLessThan(result.gears[index - 1]);
      }
    }
  });

  it('fails closed for invalid Drag inputs and unreachable finish speed', () => {
    expect(calculateAEGOGearing('Drag', 3, dragCar, 8500).unsupported).toBe(true);
    expect(calculateAEGOGearing('Drag', 6, { ...dragCar, maxTorque: Number.NaN }, 8500).unsupported).toBe(true);
    const unreachable = calculateAEGOGearing('Drag', 6, dragCar, 8500, { dragFinishSpeedKmh: 80, dragFinishSpeedProvenance: 'manual' });
    expect(unreachable.unsupported).toBe(true);
    expect(unreachable.unsupportedReason).toContain('cannot be reached');
  });

  it('public measured adapter rejects unsupported Drag results for workflow gating', () => {
    expect(calculateMeasuredGearing('Drag', 6, { ...dragCar, dragFinishSpeedKmh: 80, dragFinishSpeedProvenance: 'manual' }, {
      engineMaxRpm: 8500, peakPowerRpm: 7500, peakTorqueRpm: 5200,
    })).toBeNull();
    expect(calculateMeasuredGearing('Drag', 6, { ...dragCar, maxTorque: 0 }, {
      engineMaxRpm: 8500, peakPowerRpm: 7500, peakTorqueRpm: 5200,
    })).not.toBeNull();
  });
});
