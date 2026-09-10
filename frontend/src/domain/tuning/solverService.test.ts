import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { solveTuningRequest, type SolverRequest } from './solverService';
import { calculateWorkflowTuning, calculateGearingFromRadius, toTuningCarParams } from '../../utils/tuningMath';
import { buildBaselineSetup } from '../../utils/tuningDiagnosis';
import { kgfMmToLbsIn } from '../../utils/units';

const base: SolverRequest = {
  schemaVersion: 'tuning-solver/v1', action: 'workflow', goal: 'Road', season: 'Summer',
  params: { weight: 1234, weight_distribution: 53, drivetrain: 'RWD',
    maxHp: 287, maxTorque: 340, maxHpRpm: 7200, maxTorqueRpm: 5100,
    frontTireWidth: 225, frontTireAspect: 45, frontTireRim: 17,
    rearTireWidth: 255, rearTireAspect: 40, rearTireRim: 18, tireType: 'Semi-Slick',
    spring_front_min: 4, spring_front_max: 18, spring_rear_min: 5, spring_rear_max: 22,
    height_front_min: 8, height_front_max: 16, height_rear_min: 9, height_rear_max: 18 },
  numGears: 6, engine: { maxRpm: 8000, maxHpRpm: 7200, maxTorqueRpm: 5100 },
};

describe('shared UI / CLI solver contract', () => {
  for (const goal of ['Road', 'Drift', 'Rally', 'Drag'] as const) {
    for (const drivetrain of ['FWD', 'RWD', 'AWD'] as const) {
      for (const season of ['Summer', 'Autumn', 'Spring', 'Winter'] as const) {
        it(`${goal}/${drivetrain}/${season} matches all UI values and units`, () => {
          const input = { ...base, goal, season, params: { ...base.params, drivetrain } };
          const before = structuredClone(input);
          const actual = solveTuningRequest(input);
          const expected = calculateWorkflowTuning(goal, season, input.params, 6, input.engine!);
          expect(actual.workflow).toEqual(expected);
          expect(actual.appliedSetup).toEqual(buildBaselineSetup(null, expected.chassis,
            expected.alignment, expected.tires.targetPhot, expected.gearing));
          expect(actual.chassis.springs.front_lbs_in).toBe(kgfMmToLbsIn(expected.chassis.springs.front));
          expect(actual.chassis.appliedSetup.springsFront).toBe(expected.chassis.springs.front);
          expect(actual.chassis.ride_height.front).toBe(expected.chassis.springs.heightF);
          expect(actual.gearing?.gears.map(gear => gear.ratio)).toEqual(expected.gearing?.gears);
          expect(input).toEqual(before);
        });
      }
    }
  }

  it('honors profile torque conversion, engine gates, geometry and explicit event targets', () => {
    const input: SolverRequest = { ...base, torqueUnit: 'lb-ft',
      correction: { targetSpeedKmh: 240, targetRpm: 6800 } };
    const actual = solveTuningRequest(input);
    expect(actual.workflow).toEqual(calculateWorkflowTuning('Road', 'Summer',
      toTuningCarParams(input.params), 6, input.engine!, input.correction));
    expect(solveTuningRequest({ ...base, engine: null }).workflow.gearing).toBeNull();
    expect(solveTuningRequest({ ...base, params: { ...base.params, maxHp: 0 } }).workflow.gearing).toBeNull();
    expect(solveTuningRequest({ ...base, engine: null }).appliedSetup.finalDrive).toBeUndefined();
  });

  it('ignores aero in general chassis exactly as the UI does', () => {
    const noAero = solveTuningRequest(base).workflow.chassis;
    expect(solveTuningRequest({ ...base,
      params: { ...base.params, aero_downforce_front: 500, aero_downforce_rear: 750 },
    }).workflow.chassis).toEqual(noAero);
  });

  it('legacy diameter and top-speed arguments use the same AEGO implementation', () => {
    const input: SolverRequest = { ...base, action: 'gearing', tireDiameterCm: 65,
      correction: { targetSpeedKmh: 280, targetRpm: 7200 } };
    expect(solveTuningRequest(input).workflow.gearing).toEqual(calculateGearingFromRadius(
      'Road', 6, base.params, 8000, 0.325, input.correction));
  });

  it('rejects malformed protocol inputs instead of producing an approximate tune', () => {
    expect(() => solveTuningRequest({ ...base, schemaVersion: 'wrong' } as never)).toThrow();
    expect(() => solveTuningRequest({ ...base, params: { ...base.params, weight: NaN } })).toThrow();
    expect(() => solveTuningRequest({ ...base, numGears: 0 })).toThrow();
    expect(() => solveTuningRequest({ ...base, action: 'gearing', engine: null })).toThrow();
  });

  it('real headless source runner returns identical JSON without opening a UI', () => {
    const runner = fileURLToPath(new URL('../../../scripts/tuning-solver.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [runner], {
      input: JSON.stringify(base), encoding: 'utf8', timeout: 15000,
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(solveTuningRequest(base))));
  });
});
