import type { TuningCarParams } from '../../utils/tuningMath';
import type { TuningMeasurementState } from './tuningMeasurement';

export interface EngineObservation {
  schema: 'engine-observation/v1'; id: string; carId: string; capturedAt: number;
  dependencyKey: string; source: 'measured'; data: TuningMeasurementState;
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
      if (!item || item.schema !== 'engine-observation/v1' || typeof item.id !== 'string' || typeof item.carId !== 'string' || typeof item.dependencyKey !== 'string') return false;
      const d = item.data;
      return d && d.carId === item.carId && d.status === 'ready' && Number.isFinite(d.engineMaxRpm) && d.engineMaxRpm > 0 &&
        d.identity && String(d.identity.ordinal) === item.carId && Number.isFinite(d.identity.carClass) && Number.isFinite(d.identity.performanceIndex) &&
        [d.observedPeakPower, d.observedPeakTorque].every(p => p && Number.isFinite(p.value) && p.value > 0 && Number.isFinite(p.rpm) && p.rpm > 0 && p.rpm <= d.engineMaxRpm) &&
        Array.isArray(d.bins) && d.bins.length <= 16 && d.bins.every((b: { index: unknown; sampleCount: unknown }) => Number.isInteger(b.index) && Number.isFinite(b.sampleCount));
    });
  } catch { return []; }
}
