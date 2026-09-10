import { describe, expect, it } from 'vitest';
import { calculateAEGOGearing, calculateChassisTuning, calculateStaticTireAlignment, calculateWorkflowTuning,
  getGearingTireRadius, type TuningCarParams, type WorkflowEngineInput } from './tuningMath';

const car: TuningCarParams = { weight: 1200, weight_distribution: 50, drivetrain: 'RWD', maxHp: 200,
  maxTorque: 220, maxHpRpm: 6000, maxTorqueRpm: 4500, frontTireWidth: 215, frontTireAspect: 45,
  frontTireRim: 17, rearTireWidth: 235, rearTireAspect: 40, rearTireRim: 18 };
const engine = { maxRpm: 7500, maxHpRpm: 6500, maxTorqueRpm: 4500 };
describe('one-way workflow calculations', () => {
  for (const drivetrain of ['FWD', 'RWD', 'AWD'] as const) {
    it.each(['Road', 'Rally', 'Drag', 'Drift'])('preserves existing %s formulas for ' + drivetrain, goal => {
      const params = { ...car, drivetrain };
      for (const season of ['Summer', 'Autumn', 'Winter', 'Spring'] as const) {
        const result = calculateWorkflowTuning(goal, season, params, 6, engine);
        expect(result.chassis).toEqual(calculateChassisTuning(goal, params));
        expect(result.alignment).toEqual(calculateStaticTireAlignment(goal, season, params));
        expect(result.gearing).toEqual(calculateAEGOGearing(goal, 6, { ...params,
          maxHpRpm: engine.maxHpRpm, maxTorqueRpm: engine.maxTorqueRpm }, engine.maxRpm));
        expect(result.tires.gearingRadiusM).toBe(getGearingTireRadius(params));
      }
    });
  }
  it('provides mechanical estimates without power or measured RPM', () => {
    const result = calculateWorkflowTuning('Road', 'Summer', { ...car, maxHp: 0 }, 6, null);
    expect(result.gearing).toBeNull();
    expect(result.chassis).toEqual(calculateChassisTuning('Road', car));
    expect(result.alignment).toEqual(calculateStaticTireAlignment('Road', 'Summer', car));
  });
  it.each([null, { ...engine, maxRpm: NaN }, { ...engine, maxTorqueRpm: 0 }, { ...engine, maxHpRpm: 9000 }])(
    'does not replace absent or invalid measured inputs with a plausible gearing result: %j', (input: WorkflowEngineInput | null) => {
      expect(calculateWorkflowTuning('Road', 'Summer', car, 6, input).gearing).toBeNull();
    });
  it('isolates engine and seasonal changes from independent results', () => {
    const baseline = calculateWorkflowTuning('Road', 'Summer', car, 6, engine);
    const measured = calculateWorkflowTuning('Road', 'Summer', car, 6, { ...engine, maxRpm: 9000, maxHpRpm: 8500 });
    expect(measured.gearing).not.toEqual(baseline.gearing);
    expect(measured.chassis).toEqual(baseline.chassis);
    expect(measured.tires).toEqual(baseline.tires);
    const winter = calculateWorkflowTuning('Road', 'Winter', car, 6, engine);
    expect(winter.tires.pcF).not.toBe(baseline.tires.pcF);
    expect(winter.gearing).toEqual(baseline.gearing);
    expect(winter.chassis).toEqual(baseline.chassis);
  });
  it('uses the upstream driven tire radius for an explicit gearing target without mutating inputs', () => {
    const params = Object.freeze({ ...car });
    const correction = { targetSpeedKmh: 250, targetRpm: 7000 };
    const first = calculateWorkflowTuning('Road', 'Summer', params, 6, Object.freeze(engine), correction);
    const changed = calculateWorkflowTuning('Road', 'Summer', { ...params, rearTireRim: 20 }, 6, engine, correction);
    expect(changed.tires.gearingRadiusM).toBeGreaterThan(first.tires.gearingRadiusM);
    expect(changed.gearing).not.toEqual(first.gearing);
    expect(calculateWorkflowTuning('Road', 'Summer', params, 6, engine, correction)).toEqual(first);
    expect(params).toEqual(car);
  });
});
