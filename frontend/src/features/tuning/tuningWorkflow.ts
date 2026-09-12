import type { TuningCarParams } from '../../utils/tuningMath';

/** Recommended navigation order. Access follows data requirements, not visited pages. */
export const TUNING_WORKFLOW_STEPS = [
  { id: 'setup', number: 1, label: 'Goal & Setup' },
  { id: 'chassis', number: 2, label: 'Chassis & Tires' },
  { id: 'powertrain', number: 3, label: 'Engine data & gearing' },
  { id: 'validation', number: 4, label: 'Setup verification' },
] as const;

export type TuningWorkflowStep = typeof TUNING_WORKFLOW_STEPS[number]['id'];

export type VerificationState = 'prepared' | 'baseline-recorded' | 'run-recorded' | 'reported' | 'ab-compared' | 'decided';
export function verificationState(kinds: string[]): VerificationState {
  if (kinds.includes('decision')) return 'decided';
  if (kinds.includes('comparison')) return 'ab-compared';
  if (kinds.includes('summary')) return 'reported';
  if (kinds.includes('run')) return 'run-recorded';
  if (kinds.includes('setup')) return 'baseline-recorded';
  return 'prepared';
}

/** Numeric legacy steps must be explicitly tagged; new numbers never get remapped. */
export function restoreWorkflowStep(value: unknown): number {
  if (!value || typeof value !== 'object') return 1;
  const state = value as { schema?: string; step?: number };
  if (state.schema === 'tuning-workflow/v1') {
    return [0, 1, 3, 2, 2, 4][state.step ?? 0] || 1;
  }
  if (state.schema === 'tuning-workflow/v2') {
    const v2Map: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 3, 6: 4 };
    return v2Map[state.step ?? 1] ?? 1;
  }
  return state.schema === 'tuning-workflow/v3' && TUNING_WORKFLOW_STEPS.some(item => item.number === state.step) ? state.step! : 1;
}

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
  if ((step === 2 || step === 3) && Number.isInteger(step)) return readiness.mechanical;
  return step === 4 && readiness.mechanical && readiness.engineInputs && readiness.measuredEngine;
}

export function resolveTuningStep(step: number, readiness: WorkflowReadiness): number {
  if (!TUNING_WORKFLOW_STEPS.some(item => item.number === step)) return 1;
  if (canOpenTuningStep(step, readiness)) return step;
  return step === 4 && readiness.mechanical ? 3 : 1;
}

export function nextTuningStep(step: number, readiness: WorkflowReadiness): number | null {
  return TUNING_WORKFLOW_STEPS.find(item => item.number > step && canOpenTuningStep(item.number, readiness))?.number ?? null;
}
