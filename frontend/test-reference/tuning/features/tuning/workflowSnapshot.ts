// Frozen characterization reference. Never import at runtime from product code.
import type { WorkflowRecommendation } from '../../../../src/domain/tuning/types';
export type { WorkflowRecommendation } from '../../../../src/domain/tuning/types';
import type { ChassisTuningResult, StaticTireAlignResult } from "../../utils/tuningMath";
import type { CarParams } from "../../../../src/context/CarParamsContext";
import type { WorkflowGearingResult } from "./measurementTuningProfile";



function canonicalWorkflowInputSnapshot(inputSnapshot: Record<string, unknown>): Record<string, unknown> {
  const snapshot = JSON.parse(JSON.stringify(inputSnapshot)) as Record<string, unknown>;
  const observation = snapshot.engineObservation;
  if (observation && typeof observation === 'object' && !Array.isArray(observation)) {
    const { capture: _capture, ...canonicalObservation } = observation as Record<string, unknown>;
    snapshot.engineObservation = canonicalObservation;
  }
  return snapshot;
}

/** Transport mapping only. All numbers are outputs of the existing pure solver. */
export function workflowRecommendation(profile: CarParams, chassis: ChassisTuningResult,
  alignment: StaticTireAlignResult, gearing: WorkflowGearingResult, inputSnapshot: Record<string, unknown>): WorkflowRecommendation {
  const isEvResult = 'model' in gearing;
  if (Boolean(profile.isElectric) !== isEvResult) throw new Error('Powertrain profile and gearing result modes must match');
  if (!isEvResult) {
    if (gearing.unsupported || !gearing.gears.length || !Number.isFinite(gearing.finalDrive) || gearing.finalDrive <= 0) {
      throw new Error('A feasible gearing result is required for a recommendation.');
    }
  }
  const ev = isEvResult ? gearing : null;
  const fields: WorkflowRecommendation['fields'] = {};
  const add = (key: string, value: number, unit: string) => { fields[key] = { value, unit }; };
  add('pressure.front', alignment.pcF, 'psi'); add('pressure.rear', alignment.pcR, 'psi');
  for (const axle of ['front', 'rear'] as const) {
    add('spring.' + axle, chassis.springs[axle], 'kgf/mm');
    add('arb.' + axle, chassis.arb[axle], 'slider');
    add('camber.' + axle, alignment.camber[axle], 'deg');
    add('toe.' + axle, parseFloat(alignment.toe[axle]), 'deg');
  }
  add('height.front', chassis.springs.heightF, 'cm'); add('height.rear', chassis.springs.heightR, 'cm');
  add('rebound.front', chassis.damping.reboundF, 'slider'); add('rebound.rear', chassis.damping.reboundR, 'slider');
  add('bump.front', chassis.damping.bumpF, 'slider'); add('bump.rear', chassis.damping.bumpR, 'slider');
  add('caster.front', alignment.caster, 'deg');
  if (profile.drivetrain !== 'RWD') {
    add('diff.front.acceleration', chassis.diff.accelF, '%'); add('diff.front.deceleration', chassis.diff.decelF, '%');
  }
  if (profile.drivetrain !== 'FWD') {
    add('diff.rear.acceleration', chassis.diff.accelR, '%'); add('diff.rear.deceleration', chassis.diff.decelR, '%');
  }
  if (profile.drivetrain === 'AWD') add('diff.center', chassis.diff.centerRear, '%');
  if (gearing.finalDrive !== null && (!ev || ev.adjustability.finalDrive)) add('gearing.finalDrive', gearing.finalDrive, 'ratio');
  gearing.gears.forEach((ratio, i) => {
    if (ratio !== null && (!ev || ev.adjustability.gears[i])) add('gearing.gear' + (i + 1), ratio, 'ratio');
  });
  const capability = profile.adjustability;
  for (const key of Object.keys(fields)) {
    const family = key.split('.')[0];
    if ((['spring', 'height', 'rebound', 'bump', 'camber', 'toe', 'caster'].includes(family) && capability.suspension !== 'Race') ||
      (family === 'arb' && capability.arb === 'Fixed') || (family === 'diff' && capability.diff === 'Fixed') ||
      (family === 'gearing' && !ev && (capability.gearbox === 'Fixed' || (key !== 'gearing.finalDrive' && capability.gearbox !== 'Full')))) delete fields[key];
  }
  return { formulaVersion: profile.isElectric ? 'ev/measured-workflow-v1' : 'tuningMath/measured-workflow-v1',
    inputSnapshot: canonicalWorkflowInputSnapshot(inputSnapshot), fields };
}
