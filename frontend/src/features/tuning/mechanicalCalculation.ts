import { backendFetch } from '../../services/backend';
import type { ChassisTuningResult, StaticTireAlignResult, Season, TuningCarParams } from '../../domain/tuning/types';

export interface MechanicalResult {
  schemaVersion: 'tuning-mechanical/v1';
  chassis: ChassisTuningResult;
  alignment: StaticTireAlignResult;
}
export interface MechanicalInput {
  schemaVersion: 'tuning-mechanical/v1';
  goal: string;
  season: Season;
  profile: TuningCarParams;
}

/** Full draft inputs, not the narrower engine measurement dependency identity. */
export function mechanicalRequestKey(carId: string, goal: string, season: Season, profile: TuningCarParams | null): string {
  return JSON.stringify({ carId, schemaVersion: 'tuning-mechanical/v1', goal, season, profile });
}

export async function requestMechanical(input: MechanicalInput, signal: AbortSignal): Promise<MechanicalResult> {
  const response = await backendFetch('/api/tuning/mechanical', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal,
  });
  if (!response.ok) throw new Error(`Tuning calculation failed (${response.status})`);
  const result = await response.json() as MechanicalResult;
  if (result.schemaVersion !== 'tuning-mechanical/v1' || !result.chassis || !result.alignment) {
    throw new Error('Unsupported tuning calculation response');
  }
  return result;
}

/** Sequence checks also protect retries and A→B→A edits when abort races completion. */
export class CalculationSequence {
  private sequence = 0;
  next(): number { return ++this.sequence; }
  current(sequence: number): boolean { return sequence === this.sequence; }
}
