import type { TelemetryData } from '../../../hooks/useTelemetry';
import type { EvIdentity, EvMeasurement } from './types';
export const EV_MAX_FRAMES = 30_000;
export const evIdentity = (f: TelemetryData): EvIdentity | undefined =>
  Number.isInteger(f.CarOrdinal) && f.CarOrdinal! > 0 && Number.isInteger(f.CarPerformanceIndex) &&
  f.CarPerformanceIndex! > 0 && Number.isInteger(f.CarClass) && f.CarClass! >= 0
    ? { ordinal: f.CarOrdinal!, performanceIndex: f.CarPerformanceIndex!, carClass: f.CarClass! } : undefined;
export const sameEvIdentity = (a: EvIdentity, b: EvIdentity): boolean =>
  a.ordinal === b.ordinal && a.performanceIndex === b.performanceIndex && a.carClass === b.carClass;
export const createEvMeasurement = (carId: string): EvMeasurement => ({
  schema: 'ev-measurement/v1', carId, status: 'collecting', guidance: 'waiting', frameCount: 0, gears: [],
});
