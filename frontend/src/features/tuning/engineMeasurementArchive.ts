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
  return JSON.stringify([carId, profile?.drivetrain, profile?.induction, profile?.maxHp, profile?.maxTorque]);
}
export function parseEngineArchive(text: string | null): EngineObservation[] {
  if (!text) return [];
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is EngineObservation => {
      if (!item || item.schema !== 'engine-observation/v1' || typeof item.id !== 'string' || typeof item.carId !== 'string' || typeof item.dependencyKey !== 'string' || item.source !== 'measured' || !Number.isFinite(item.capturedAt)) return false;
      const d = item.data;
      return d && d.carId === item.carId && d.status === 'ready' && Number.isFinite(d.engineMaxRpm) && d.engineMaxRpm > 0 &&
        d.identity && String(d.identity.ordinal) === item.carId && Number.isFinite(d.identity.carClass) && Number.isFinite(d.identity.performanceIndex) &&
        [d.observedPeakPower, d.observedPeakTorque].every(p => p && Number.isFinite(p.value) && p.value > 0 && Number.isFinite(p.rpm) && p.rpm > 0 && p.rpm <= d.engineMaxRpm) &&
        Number.isFinite(d.acceptedMs) && d.acceptedMs >= 6000 && Number.isFinite(d.lowestRpm) && d.lowestRpm > 0 && d.lowestRpm <= d.engineMaxRpm * 0.4 &&
        Number.isFinite(d.highestRpm) && d.highestRpm >= d.engineMaxRpm * 0.9 && d.highestRpm <= d.engineMaxRpm &&
        Array.isArray(d.bins) && d.bins.length >= 8 && d.bins.length <= 16 && new Set(d.bins.map((b: { index: number }) => b?.index)).size === d.bins.length &&
        d.bins.every((b: Record<string, number>) => b && Number.isInteger(b.index) && b.index >= 0 && b.index < 16 && Number.isInteger(b.sampleCount) && b.sampleCount > 0 &&
          ['averagePowerWatts', 'averageTorqueNewtons', 'averageRpm', 'powerWattsSum', 'torqueNewtonsSum', 'rpmSum'].every(k => Number.isFinite(b[k]) && b[k] > 0));
    }).map(({ capture: _capture, ...item }) => item);
  } catch { return []; }
}
