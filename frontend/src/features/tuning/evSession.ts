import type { CarParams } from '../../context/CarParamsContext';
import type { TelemetryData } from '../../hooks/useTelemetry';
import { evIdentity, sameEvIdentity } from '../../domain/tuning/ev/sessionIdentity';
import type { EvMeasurement } from '../../domain/tuning/ev/types';

export function evDependencyKey(carId: string, profile: CarParams | null): string {
  return JSON.stringify([carId, profile?.isElectric === true, profile?.drivetrain,
    profile?.maxHp, profile?.maxTorque, profile?.evGearbox]);
}

/** Missing live frames/menu frames retain evidence; a different live build invalidates it. */
export function evMeasurementMatchesLive(state: EvMeasurement, frame: TelemetryData | null): boolean {
  if (!state.identity || !frame || frame.IsRaceOn !== 1) return true;
  const identity = evIdentity(frame);
  return identity !== undefined && sameEvIdentity(state.identity, identity);
}
