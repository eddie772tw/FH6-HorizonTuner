import { describe, expect, it } from 'vitest';
import golden from '../../../../../tests/fixtures/ev_golden_fixtures.json';
import { advanceEvMeasurement, createEvMeasurement, evGearReady } from './measurement';
import { calculateEvGearing } from './solver';
import { normalizeEvProfile } from './profile';
import type { EvGearingInput } from './types';
import type { TelemetryData } from '../../../hooks/useTelemetry';

const baseline = golden[0].input as EvGearingInput;
const frame = (overrides: Partial<TelemetryData> = {}): TelemetryData => ({
  IsRaceOn: 1, TimestampMS: 1000, CarOrdinal: 3445, CarClass: 2, CarPerformanceIndex: 795,
  CurrentEngineRpm: 10000, EngineMaxRpm: 17000, EngineIdleRpm: 0, Gear: 1, AccelInput: 255,
  BrakeInput: 0, ClutchInput: 0, HandBrakeInput: 0, PowerWatts: 560000, TorqueNewtons: 535,
  SpeedMetersPerSecond: 22, SteerInput: 0, WheelRotationSpeed: [65, 65, 65, 65],
  TireSlipRatio: [0, 0, 0, 0], TireSlipAngle: [0, 0, 0, 0], NormalizedSuspensionTravel: [0, 0, 0, 0],
  AccelerationX: 0, AccelerationY: 0, AccelerationZ: 0, VelocityX: 0, VelocityY: 0, VelocityZ: 22, Yaw: 0, ...overrides,
});
const started = () => advanceEvMeasurement(createEvMeasurement('3445'), frame({ TimestampMS: 0 }));

describe('EV model contracts', () => {
  for (const c of golden) it(c.id, () => {
    expect(calculateEvGearing(c.input as EvGearingInput)).toEqual(c.expected);
  });
  it('normalizes persisted EV settings without coercing legacy or malformed flags', () => {
    expect(normalizeEvProfile({})).toEqual({ isElectric: false, evGearbox: undefined });
    expect(normalizeEvProfile({ isElectric: 'true' }).isElectric).toBe(false);
    expect(normalizeEvProfile({ isElectric: true, evGearbox: baseline.setup }).evGearbox).toEqual(baseline.setup);
    expect(normalizeEvProfile({ isElectric: true, evGearbox: { gearRatios: '2,1' } }).evGearbox).toBeUndefined();
    expect(normalizeEvProfile({ isElectric: true, evGearbox: { finalDrive: null, gearRatios: [null], allForwardGearsConfirmed: true } }).evGearbox)
      .toEqual({ finalDrive: null, gearRatios: [null], finalDriveAdjustable: false, gearAdjustable: [false], allForwardGearsConfirmed: true });
  });
  it('accepts zero idle but rejects missing output, regeneration, brake and clutch contamination', () => {
    const base = started();
    expect(advanceEvMeasurement(base, frame()).gears).toHaveLength(1);
    for (const patch of [{ PowerWatts: undefined }, { PowerWatts: -1000, TorqueNewtons: -10 },
      { BrakeInput: 1 }, { ClutchInput: 1 }, { AccelInput: 0 }, { CurrentEngineRpm: 0 }, { PowerWatts: 0 }]) {
      expect(advanceEvMeasurement(base, frame(patch)).gears).toHaveLength(0);
    }
  });
  it('never treats a sustained positive-power plateau as cutoff', () => {
    let state = started();
    for (let t = 350; t <= 10000; t += 50) state = advanceEvMeasurement(state, frame({ TimestampMS: t }));
    expect(state.gears[0].cutoff.count).toBe(0);
    expect(evGearReady(state.gears[0])).toBe(false);
  });
  it('blocks changed identity or timestamp regression and deduplicates timestamps', () => {
    const state = advanceEvMeasurement(started(), frame());
    expect(advanceEvMeasurement(state, frame())).toBe(state);
    expect(advanceEvMeasurement(state, frame({ TimestampMS: 999 })).guidance).toBe('session-restarted');
    expect(advanceEvMeasurement(state, frame({ TimestampMS: 1050, CarPerformanceIndex: 800 })).status).toBe('blocked');
    expect(advanceEvMeasurement(state, frame({ CarOrdinal: 4257 })).status).toBe('blocked');
  });
  it('does not manufacture clean wheel observations or bridge sampling gaps', () => {
    const state = advanceEvMeasurement(started(), frame({ WheelRotationSpeed: undefined }));
    const next = advanceEvMeasurement(state, frame({ TimestampMS: 10000, TireSlipRatio: [2, 2, 0, 0] }));
    expect(next.gears[0].rpmPerKmh.count).toBe(0);
    expect(next.gears[0].acceptedMs).toBe(0);
  });
  it('fails closed for incomplete coverage, unstable ratios and invalid candidates', () => {
    expect(calculateEvGearing({ ...baseline, candidateFinalDrive: NaN })).toBeNull();
    const input = JSON.parse(JSON.stringify(baseline)) as EvGearingInput;
    input.measurements[0].rpmPerKmh.m2 = 1e12;
    expect(calculateEvGearing(input)).toBeNull();
    expect(calculateEvGearing({ ...baseline, measurements: [] })).toBeNull();
  });
});
