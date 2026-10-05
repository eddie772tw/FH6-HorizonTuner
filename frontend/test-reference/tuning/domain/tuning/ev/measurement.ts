// Frozen characterization reference. Never import at runtime from product code.
import type { TelemetryData } from "../../../../../src/hooks/useTelemetry";
import type { EvGearMeasurement, EvIdentity, EvMeasurement, EvMoments } from "../../../../../src/domain/tuning/ev/types";

export const EV_MAX_FRAMES = 30_000;
export const emptyMoments = (): EvMoments => ({ count: 0, mean: 0, m2: 0 });
const add = (s: EvMoments, x: number): EvMoments => {
  const count = s.count + 1, delta = x - s.mean, mean = s.mean + delta / count;
  return { count, mean, m2: s.m2 + delta * (x - mean) };
};
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
export const evIdentity = (f: TelemetryData): EvIdentity | undefined =>
  Number.isInteger(f.CarOrdinal) && f.CarOrdinal! > 0 && Number.isInteger(f.CarPerformanceIndex) &&
  f.CarPerformanceIndex! > 0 && Number.isInteger(f.CarClass) && f.CarClass! >= 0
    ? { ordinal: f.CarOrdinal!, performanceIndex: f.CarPerformanceIndex!, carClass: f.CarClass! } : undefined;
export const sameEvIdentity = (a: EvIdentity, b: EvIdentity): boolean =>
  a.ordinal === b.ordinal && a.performanceIndex === b.performanceIndex && a.carClass === b.carClass;
export const createEvMeasurement = (carId: string): EvMeasurement => ({
  schema: 'ev-measurement/v1', carId, status: 'collecting', guidance: 'waiting', frameCount: 0, gears: [],
});
export const evRatioIsStable = (s: EvMoments): boolean => s.count >= 30 && positive(s.mean) &&
  Number.isFinite(s.m2) && s.m2 >= 0 && Math.sqrt(s.m2 / s.count) / s.mean <= 0.02;
export const evGearReady = (g: EvGearMeasurement): boolean =>
  Number.isFinite(g.acceptedMs) && g.acceptedMs >= 3000 && g.positiveSamples >= 90 &&
  positive(g.reportedMaxRpm) && g.reportedMaxRpm <= 100_000 && positive(g.lowestRpm) && positive(g.highestRpm) &&
  g.highestRpm <= g.reportedMaxRpm * 1.03 && g.curve.filter(b => b.count >= 3).length >= 8 && g.curve.length <= 207 &&
  g.curve.every(b => b.count > 0 && positive(b.rpm) && positive(b.powerWatts) && positive(b.torqueNewtons)) &&
  g.lowestRpm <= g.reportedMaxRpm * 0.4 && g.highestRpm >= g.reportedMaxRpm * 0.85 &&
  evRatioIsStable(g.rpmPerKmh) && evRatioIsStable(g.frontRatio) && evRatioIsStable(g.rearRatio);

const newGear = (gear: number, reportedMaxRpm: number): EvGearMeasurement => ({
  gear, reportedMaxRpm, acceptedMs: 0, positiveSamples: 0, zeroOutputSamples: 0,
  lowestRpm: Infinity, highestRpm: 0, cutoff: emptyMoments(), rpmPerKmh: emptyMoments(),
  frontRatio: emptyMoments(), rearRatio: emptyMoments(), curve: [],
});

/** Pure decoded-frame reducer. Idle=0 is valid; flat positive power is never a cutoff. */
export function advanceEvMeasurement(state: EvMeasurement, f: TelemetryData): EvMeasurement {
  if (state.status === 'blocked') return state;
  const identity = evIdentity(f);
  if (f.IsRaceOn !== 1 || !identity) return { ...state, lastAcceptedTimestamp: undefined };
  if (String(identity.ordinal) !== state.carId || (state.identity && !sameEvIdentity(state.identity, identity))) {
    return { ...state, status: 'blocked', guidance: 'identity-changed' };
  }
  if (!Number.isFinite(f.TimestampMS) || f.TimestampMS < 0) return state;
  if (state.lastTimestamp === f.TimestampMS) return state;
  if (state.lastTimestamp !== undefined && f.TimestampMS < state.lastTimestamp) {
    return { ...state, status: 'blocked', guidance: 'session-restarted' };
  }
  if (state.frameCount >= EV_MAX_FRAMES) return { ...state, status: 'blocked', guidance: 'sample-limit' };
  const changed = f.Gear !== state.lastGear;
  const next: EvMeasurement = { ...state, identity, frameCount: state.frameCount + 1,
    lastTimestamp: f.TimestampMS, lastGear: f.Gear,
    gearSince: changed ? f.TimestampMS : state.gearSince, lastAcceptedTimestamp: undefined };
  const rpm = f.CurrentEngineRpm, power = f.PowerWatts, torque = f.TorqueNewtons;
  const controls = [f.BrakeInput, f.ClutchInput, f.HandBrakeInput];
  if (!Number.isInteger(f.Gear) || f.Gear! < 1 || f.Gear! > 10 || !positive(f.EngineMaxRpm) ||
    f.EngineMaxRpm > 100_000 || !positive(rpm) || rpm > f.EngineMaxRpm * 1.03 ||
    !Number.isFinite(f.AccelInput) || f.AccelInput! < 250 ||
    !controls.every(n => Number.isFinite(n) && n === 0) ||
    f.TimestampMS - (next.gearSince ?? f.TimestampMS) < 300 ||
    !Number.isFinite(power) || !Number.isFinite(torque) || power! < 0 || torque! < 0) return next;
  const existing = state.gears.find(g => g.gear === f.Gear);
  if (existing && Math.abs(f.EngineMaxRpm / existing.reportedMaxRpm - 1) > 0.02) {
    return { ...next, status: 'blocked', guidance: 'identity-changed' };
  }
  // A zero-output frame alone cannot establish a gear scan.
  if (!existing && !(power! > 0 && torque! > 0)) return next;
  const g = { ...(existing ?? newGear(f.Gear!, f.EngineMaxRpm)) };
  const delta = state.lastAcceptedTimestamp === undefined ? 0 : f.TimestampMS - state.lastAcceptedTimestamp;
  next.guidance = 'collecting';
  if (power! > 0 && torque! > 0) {
    g.acceptedMs += delta > 0 && delta <= 100 ? delta : 0;
    next.lastAcceptedTimestamp = f.TimestampMS;
    g.positiveSamples++;
    g.lowestRpm = Math.min(g.lowestRpm, rpm);
    g.highestRpm = Math.max(g.highestRpm, rpm);
    const index = Math.floor(rpm / 500);
    const bin = g.curve.find(b => Math.floor(b.rpm / 500) === index);
    const count = (bin?.count ?? 0) + 1;
    const updated = { count, rpm: ((bin?.rpm ?? 0) * (count - 1) + rpm) / count,
      powerWatts: ((bin?.powerWatts ?? 0) * (count - 1) + power!) / count,
      torqueNewtons: ((bin?.torqueNewtons ?? 0) * (count - 1) + torque!) / count };
    g.curve = [...g.curve.filter(b => Math.floor(b.rpm / 500) !== index), updated].sort((a, b) => a.rpm - b.rpm);
  } else if (power === 0) {
    g.zeroOutputSamples++;
    // Evidence of high-RPM output interruption, not a diagnosis of its controller.
    if (g.positiveSamples >= 90 && rpm >= g.highestRpm * 0.98 && rpm >= g.reportedMaxRpm * 0.85) {
      g.cutoff = add(g.cutoff, rpm);
    }
  }
  const wheels = f.WheelRotationSpeed, slip = f.TireSlipRatio, speed = f.SpeedMetersPerSecond;
  if (positive(speed) && speed >= 40 / 3.6 && Number.isFinite(f.SteerInput) && Math.abs(f.SteerInput!) <= 5 &&
    wheels?.length === 4 && wheels.every(positive) && slip?.length === 4 &&
    slip.every(n => Number.isFinite(n) && Math.abs(n) < 0.1)) {
    g.rpmPerKmh = add(g.rpmPerKmh, rpm / (speed * 3.6));
    g.frontRatio = add(g.frontRatio, rpm * Math.PI / (15 * (wheels[0] + wheels[1])));
    g.rearRatio = add(g.rearRatio, rpm * Math.PI / (15 * (wheels[2] + wheels[3])));
  }
  next.gears = [...state.gears.filter(v => v.gear !== g.gear), g].sort((a, b) => a.gear - b.gear);
  return next;
}
