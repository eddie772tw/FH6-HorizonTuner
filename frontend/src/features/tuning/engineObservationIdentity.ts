import type { TuningCarParams } from '../../utils/tuningMath';
import type { TuningMeasurementState } from './tuningMeasurement';
import type { TuningCaptureFile } from '../../domain/tuning/telemetryCapture';

export interface EngineObservation {
  schema: 'engine-observation/v1'; id: string; carId: string; capturedAt: number;
  dependencyKey: string; source: 'measured'; data: TuningMeasurementState;
  capture?: TuningCaptureFile;
}
/** Tire geometry and suspension values affect their outputs, not the captured engine scan. */
export function engineDependencyKey(carId: string, profile: TuningCarParams | null): string {
  const key = [carId, profile?.drivetrain, profile?.induction, profile?.maxHp, profile?.maxTorque];
  // Keep historical ICE archives compatible; EV can never share their dependency key.
  return JSON.stringify(profile?.isElectric ? [...key, 'ev/v1'] : key);
}
