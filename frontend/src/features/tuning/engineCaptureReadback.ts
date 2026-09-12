import type { TuningCaptureFile } from '../../domain/tuning/telemetryCapture';

export function validateEngineCapture(value: unknown, observationId: string, carId: string, dependencyKey: string): TuningCaptureFile | null {
  if (!value || typeof value !== 'object') return null;
  const capture = value as Partial<TuningCaptureFile>;
  const metadata = capture.metadata;
  const refs = capture.references;
  if (capture.schemaVersion !== 'tuning-capture/v1' || !metadata || metadata.carId !== carId || !refs || refs.engineObservationId !== observationId || refs.dependencyKey !== dependencyKey || !Array.isArray(capture.samples) || capture.samples.length > 30000) return null;
  if (!capture.samples.every(sample => !!sample && typeof sample === 'object')) return null;
  return capture as TuningCaptureFile;
}
