import type { CarParams } from '../../context/CarParamsContext';
import type { Season, ChassisTuningResult, StaticTireAlignResult, GearingResult } from '../../utils/tuningMath';
import type { TuningMeasurementState } from '../tuning/tuningMeasurement';
import type { WorkflowReadiness } from '../tuning/tuningWorkflow';
import { canOpenTuningStep, serializeWorkflowProfile } from '../tuning/tuningWorkflow';

export interface CompanionSnapshot {
  carId: string;
  carName: string;
  profile: CarParams | null;
  profileKey: string;
  workflow: { step: number; goal: string; season: string };
  results: { chassis: ChassisTuningResult | null; alignment: StaticTireAlignResult | null; gearing: GearingResult | null };
  engine: { phase: string; sampleCount: number; state: TuningMeasurementState | null };
  readiness: WorkflowReadiness;
}
export interface CompanionAck { id: string; status: 'pending' | 'applied' | 'rejected'; error?: string }
export interface CompanionState {
  hostOnline: boolean;
  snapshot: CompanionSnapshot | null;
  revision: number;
  commands: CompanionAck[];
}
export interface CompanionCommand {
  id: string;
  kind: 'profile' | 'workflow' | 'measurement';
  carId: string;
  profileKey: string;
  patch?: Partial<CarParams>;
  goal?: string;
  season?: string;
  step?: number;
  action?: 'start' | 'pause_resume' | 'restart' | 'finish';
}
export type CompanionIntent = Omit<CompanionCommand, 'id' | 'carId' | 'profileKey'>;

/** Entire static profile participates in conflict detection, including tire and spring changes. */
export const companionProfileKey = (carId: string, profile: CarParams | null, identityGeneration = 0): string =>
  JSON.stringify([carId, identityGeneration, serializeWorkflowProfile(profile)]);

const numericLimits: Record<string, readonly [number, number]> = {
  weight: [100, 10000], weight_distribution: [1, 99], maxHp: [0, 10000], maxTorque: [0, 20000],
  maxHpRpm: [0, 30000], maxTorqueRpm: [0, 30000],
  frontTireWidth: [80, 600], rearTireWidth: [80, 600], frontTireAspect: [10, 100], rearTireAspect: [10, 100],
  frontTireRim: [10, 40], rearTireRim: [10, 40],
};

export function validateCompanionCommand(command: CompanionCommand, snapshot: CompanionSnapshot): void {
  if (!snapshot.profile || command.carId !== snapshot.carId || command.profileKey !== snapshot.profileKey) {
    throw new Error('Vehicle parameters changed. Refresh before applying edits.');
  }
  if (command.kind === 'profile') {
    const entries = Object.entries(command.patch ?? {});
    if (!entries.length) throw new Error('Enter vehicle parameters first.');
    for (const [key, value] of entries) {
      const bounds = numericLimits[key];
      if (bounds && typeof value === 'number' && Number.isFinite(value) && value >= bounds[0] && value <= bounds[1]) continue;
      if (key === 'drivetrain' && typeof value === 'string' && ['FWD', 'RWD', 'AWD'].includes(value)) continue;
      if (key === 'induction' && typeof value === 'string' && ['NA', 'Supercharger', 'Turbo', 'TwinTurbo'].includes(value)) continue;
      throw new Error(`Invalid vehicle parameter: ${key}`);
    }
  } else if (command.kind === 'workflow') {
    if (command.goal !== undefined && !['Road', 'Rally', 'Drift', 'Drag'].includes(command.goal)) throw new Error('Invalid tuning goal.');
    if (command.season !== undefined && !['Summer', 'Autumn', 'Winter', 'Spring'].includes(command.season)) throw new Error('Invalid season.');
    if (command.step !== undefined && !canOpenTuningStep(command.step, snapshot.readiness)) throw new Error('Complete the required workflow inputs before opening this step.');
    if (command.goal === undefined && command.season === undefined && command.step === undefined) throw new Error('Empty workflow command.');
  } else if (command.kind === 'measurement') {
    if (!snapshot.readiness.engineInputs) throw new Error('Complete vehicle weight and engine power first.');
    const phase = snapshot.engine.phase;
    if (command.action === 'start' && phase === 'idle') return;
    if (command.action === 'restart') return;
    if (command.action === 'pause_resume' && ['collecting', 'paused'].includes(phase)) return;
    if (command.action === 'finish' && phase === 'complete') return;
    throw new Error('This engine measurement action is not available yet.');
  } else {
    throw new Error('Unsupported companion command.');
  }
}

export type CompanionSeason = Season;
