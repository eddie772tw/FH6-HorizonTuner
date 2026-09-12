import type { ChassisTuningResult, StaticTireAlignResult, GearingResult } from '../../utils/tuningMath';
import type { CarParams } from '../../context/CarParamsContext';

export interface WorkflowRecommendation {
  formulaVersion: 'tuningMath/measured-workflow-v1';
  inputSnapshot: Record<string, unknown>;
  fields: Record<string, { value: number; unit: string }>;
}
/** Transport mapping only. All numbers are outputs of the existing pure solver. */
export function workflowRecommendation(profile: CarParams, chassis: ChassisTuningResult,
  alignment: StaticTireAlignResult, gearing: GearingResult, inputSnapshot: Record<string, unknown>): WorkflowRecommendation {
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
  add('gearing.finalDrive', gearing.finalDrive, 'ratio');
  gearing.gears.forEach((ratio, i) => add('gearing.gear' + (i + 1), ratio, 'ratio'));
  const capability = profile.adjustability;
  for (const key of Object.keys(fields)) {
    const family = key.split('.')[0];
    if ((['spring', 'height', 'rebound', 'bump', 'camber', 'toe', 'caster'].includes(family) && capability.suspension !== 'Race') ||
      (family === 'arb' && capability.arb === 'Fixed') || (family === 'diff' && capability.diff === 'Fixed') ||
      (family === 'gearing' && (capability.gearbox === 'Fixed' || (key !== 'gearing.finalDrive' && capability.gearbox !== 'Full')))) delete fields[key];
  }
  return { formulaVersion: 'tuningMath/measured-workflow-v1', inputSnapshot: JSON.parse(JSON.stringify(inputSnapshot)), fields };
}
