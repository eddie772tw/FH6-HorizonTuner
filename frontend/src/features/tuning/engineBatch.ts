import { backendFetch } from '../../services/backend';
import type { TuningCaptureSample } from '../../domain/tuning/telemetryCapture';
import type { TuningMeasurementReadiness, TuningMeasurementState } from '../../domain/tuning/types';
export interface EngineBatchResult {
  state: TuningMeasurementState;
  readiness: TuningMeasurementReadiness & { minimumAcceptedMs: number; minimumBins: number };
  readySnapshot: TuningMeasurementState | null;
}
export async function requestEngineBatch(carId: string, state: TuningMeasurementState, samples: TuningCaptureSample[], connected: boolean, nowMs: number, signal: AbortSignal): Promise<EngineBatchResult> {
  const response = await backendFetch('/api/tuning/engine-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ schemaVersion: 'engine-batch/v1', carId, state, samples, connected, nowMs }) });
  if (!response.ok) throw new Error('Engine measurement unavailable');
  return response.json();
}
