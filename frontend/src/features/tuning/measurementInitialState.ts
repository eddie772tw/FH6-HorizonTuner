import type { TuningMeasurementState } from '../../domain/tuning/types';

// Empty transport state only. Evidence qualification is owned by Rust.
export function createTuningMeasurement(carId: string): TuningMeasurementState {
  return {
    carId,
    status: 'collecting',
    guidance: 'waiting-frame',
    acceptedMs: 0,
    bins: [],
  };
}

/** New production measurements opt into loaded-sweep gates; legacy parsing stays unchanged. */
export function createEngineCalculation(carId: string): TuningMeasurementState {
  return { ...createTuningMeasurement(carId), analysisVersion: 'engine-loaded-sweep/v4' };
}
