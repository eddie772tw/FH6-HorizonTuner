/** Headless transport adapter. All tuning math stays in the UI's canonical functions. */
import {
  calculateWorkflowTuning, calculateGearingFromRadius, calcGearSpeed,
  toTuningCarParams,
  type TuningCarParams, type WorkflowEngineInput, type GearingSecondaryCorrection,
  type Season, type GearingResult,
} from '../../utils/tuningMath';
import { buildBaselineSetup } from '../../utils/tuningDiagnosis';
import { kgfMmToLbsIn } from '../../utils/units';

export interface SolverRequest {
  schemaVersion: 'tuning-solver/v1';
  action: 'workflow' | 'chassis' | 'gearing';
  goal: 'Road' | 'Rally' | 'Drift' | 'Drag';
  season?: Season;
  params: TuningCarParams;
  torqueUnit?: 'Nm' | 'lb-ft';
  numGears?: number;
  engine?: WorkflowEngineInput | null;
  correction?: GearingSecondaryCorrection;
  /** Legacy CLI outer-diameter input; canonical workflow uses tire dimensions. */
  tireDiameterCm?: number;
  /** Deprecated CLI downforce flags, recorded only; never passed to physics. */
  ignoredLegacyAeroLbf?: { front: number; rear: number };
}

function validateRequest(request: SolverRequest): void {
  if (!request || request.schemaVersion !== 'tuning-solver/v1' ||
      !['workflow', 'chassis', 'gearing'].includes(request.action) ||
      !['Road', 'Rally', 'Drift', 'Drag'].includes(request.goal)) {
    throw new Error('Invalid tuning-solver/v1 request, action or goal');
  }
  if (!request.params || !['FWD', 'RWD', 'AWD'].includes(request.params.drivetrain)) {
    throw new Error('params.drivetrain must be FWD, RWD or AWD');
  }
  for (const key of ['weight', 'weight_distribution', 'maxHp', 'maxTorque', 'maxHpRpm', 'maxTorqueRpm'] as const) {
    if (!Number.isFinite(request.params[key])) throw new Error(`params.${key} must be finite`);
  }
  for (const key of ['aeroBalance', 'aeroEfficiency', 'mechBalance', 'aero_downforce_front',
    'aero_downforce_rear', 'frontTireWidth', 'frontTireAspect', 'frontTireRim',
    'rearTireWidth', 'rearTireAspect', 'rearTireRim', 'spring_front_min', 'spring_front_max',
    'spring_rear_min', 'spring_rear_max', 'height_front_min', 'height_front_max',
    'height_rear_min', 'height_rear_max'] as const) {
    if (request.params[key] !== undefined && !Number.isFinite(request.params[key])) {
      throw new Error(`params.${key} must be finite`);
    }
  }
  if (request.numGears !== undefined && (!Number.isInteger(request.numGears) || request.numGears < 1 || request.numGears > 10)) {
    throw new Error('numGears must be an integer from 1 to 10');
  }
  if (request.engine && !['maxRpm', 'maxHpRpm', 'maxTorqueRpm'].every(key =>
    Number.isFinite(request.engine![key as keyof WorkflowEngineInput]))) throw new Error('Invalid engine input');
  if (request.correction && Object.values(request.correction).some(value => !Number.isFinite(value))) {
    throw new Error('Correction values must be finite');
  }
  if (request.season && !['Summer', 'Autumn', 'Spring', 'Winter', 'Neutral'].includes(request.season)) {
    throw new Error('Invalid season');
  }
  if (request.torqueUnit && !['Nm', 'lb-ft'].includes(request.torqueUnit)) throw new Error('Invalid torqueUnit');
  if (request.tireDiameterCm !== undefined &&
      (!Number.isFinite(request.tireDiameterCm) || request.tireDiameterCm <= 0)) {
    throw new Error('tireDiameterCm must be positive');
  }
  if (request.action === 'gearing' && (!request.engine ||
      !Number.isFinite(request.engine.maxRpm) || request.engine.maxRpm <= 0 ||
      request.engine.maxHpRpm <= 0 || request.engine.maxHpRpm > request.engine.maxRpm)) {
    throw new Error('Gearing requires positive redline and peak HP RPM within redline');
  }
}

function formatGearing(gearing: GearingResult, maxRpm: number, radius: number) {
  return {
    final_drive: gearing.finalDrive,
    gears_count: gearing.gears.length,
    gears: gearing.gears.map((ratio, i) => ({
      gear: i + 1, ratio,
      speed_at_redline_kmh: calcGearSpeed(maxRpm, ratio, gearing.finalDrive, radius) * 3.6,
      upshift_drop_rpm: i + 1 < gearing.gears.length ? maxRpm * gearing.gears[i + 1] / ratio : null,
    })),
    // AEGO steps vary; report the actual adjacent ratios instead of a fictitious constant.
    powerband_retention_ratios: gearing.gears.slice(1).map((ratio, i) => ratio / gearing.gears[i]),
    target_fit: gearing.targetFit ?? null,
  };
}

export function solveTuningRequest(request: SolverRequest) {
  validateRequest(request);
  const params = request.torqueUnit === 'lb-ft' ? toTuningCarParams(request.params) : { ...request.params };
  const season = request.season ?? 'Summer';
  const engine = request.engine ?? null;
  const workflow = calculateWorkflowTuning(request.goal, season, params,
    request.numGears ?? 6, request.action === 'chassis' ? null : engine, request.correction);
  let radius = workflow.tires.gearingRadiusM;
  if (request.action === 'gearing') {
    radius = request.tireDiameterCm === undefined ? radius : request.tireDiameterCm / 200;
    workflow.gearing = calculateGearingFromRadius(request.goal, request.numGears ?? 6,
      { ...params, maxHpRpm: engine!.maxHpRpm, maxTorqueRpm: engine!.maxTorqueRpm },
      engine!.maxRpm, radius, request.correction);
  }
  const applied = buildBaselineSetup(null, workflow.chassis, workflow.alignment,
    workflow.tires.targetPhot, workflow.gearing);
  const { chassis: c, alignment: a, tires: t } = workflow;
  return {
    schemaVersion: 'tuning-solver/v1' as const,
    source: 'frontend/src/utils/tuningMath.ts',
    input: { ...request, params, torqueUnit: 'Nm' as const, season },
    workflow,
    appliedSetup: applied,
    chassis: {
      schemaVersion: 'tuning-dev/v1', goal: request.goal.toLowerCase(),
      drivetrain: params.drivetrain, weight_kg: params.weight,
      front_weight_bias_pct: params.weight_distribution,
      anti_roll_bars: c.arb,
      springs: { front_kgf_mm: c.springs.front, rear_kgf_mm: c.springs.rear,
        front_lbs_in: kgfMmToLbsIn(c.springs.front), rear_lbs_in: kgfMmToLbsIn(c.springs.rear) },
      ride_height: { front: c.springs.heightF, rear: c.springs.heightR, unit: 'cm' },
      dampers: { rebound_front: c.damping.reboundF, rebound_rear: c.damping.reboundR,
        bump_front: c.damping.bumpF, bump_rear: c.damping.bumpR },
      alignment: { camber_front_deg: a.camber.front, camber_rear_deg: a.camber.rear,
        toe_front_deg: applied.toeFront, toe_rear_deg: applied.toeRear, caster_deg: a.caster },
      tires: { front_cold_psi: t.pcF, rear_cold_psi: t.pcR, target_hot_psi: t.targetPhot },
      differential: { front_accel: c.diff.accelF, front_decel: c.diff.decelF,
        rear_accel: c.diff.accelR, rear_decel: c.diff.decelR, center_balance: c.diff.centerRear },
      appliedSetup: applied,
      solverInput: { ...request, params, torqueUnit: 'Nm' as const, season },
    },
    gearing: workflow.gearing ? {
      ...formatGearing(workflow.gearing, engine!.maxRpm, radius),
      solverInput: { ...request, params, torqueUnit: 'Nm' as const, season },
      solverSource: 'frontend/src/utils/tuningMath.ts',
    } : null,
  };
}
