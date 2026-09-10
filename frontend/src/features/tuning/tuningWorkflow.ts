import type { TuningCarParams } from '../../utils/tuningMath';

/** Recommended navigation order. Access follows data requirements, not visited pages. */
export const TUNING_WORKFLOW_STEPS = [
  { id: 'setup', number: 1, label: 'Goal & Setup' },
  { id: 'tires', number: 2, label: 'Tire baseline' },
  { id: 'chassis', number: 3, label: 'Chassis platform' },
  { id: 'alignment', number: 4, label: 'Wheel alignment' },
  { id: 'powertrain', number: 5, label: 'Engine data & gearing' },
  { id: 'validation', number: 6, label: 'Setup verification' },
] as const;

export type TuningWorkflowStep = typeof TUNING_WORKFLOW_STEPS[number]['id'];

export interface WorkflowReadiness {
  mechanical: boolean;
  engineInputs: boolean;
  measuredEngine: boolean;
}

/** Background dyno polling must not replace a confirmed static setup snapshot. */
export function serializeWorkflowProfile(profile: (TuningCarParams & { dyno_curve?: unknown; dyno_quality?: unknown }) | null): string {
  if (!profile) return 'null';
  const { dyno_curve, dyno_quality, ...staticInputs } = profile;
  return JSON.stringify(staticInputs);
}

export function getWorkflowReadiness(profileReady: boolean,
  params: Pick<TuningCarParams, 'weight' | 'weight_distribution' | 'maxHp'> | null,
  measuredEngine: boolean): WorkflowReadiness {
  const mechanical = Boolean(profileReady && params && Number.isFinite(params.weight) && params.weight > 0 &&
    Number.isFinite(params.weight_distribution) && params.weight_distribution > 0 && params.weight_distribution < 100);
  const engineInputs = mechanical && Boolean(params && Number.isFinite(params.maxHp) && params.maxHp > 0);
  return { mechanical, engineInputs, measuredEngine: engineInputs && measuredEngine };
}

export function canOpenTuningStep(step: number, readiness: WorkflowReadiness): boolean {
  if (step === 1) return true;
  if (step >= 2 && step <= 5 && Number.isInteger(step)) return readiness.mechanical;
  return step === 6 && readiness.mechanical && readiness.engineInputs && readiness.measuredEngine;
}

export function resolveTuningStep(step: number, readiness: WorkflowReadiness): number {
  if (!TUNING_WORKFLOW_STEPS.some(item => item.number === step)) return 1;
  if (canOpenTuningStep(step, readiness)) return step;
  return step === 6 && readiness.mechanical ? 5 : 1;
}

export function nextTuningStep(step: number, readiness: WorkflowReadiness): number | null {
  return TUNING_WORKFLOW_STEPS.find(item => item.number > step && canOpenTuningStep(item.number, readiness))?.number ?? null;
}
