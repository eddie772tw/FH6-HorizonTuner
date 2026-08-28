import { describe, expect, it } from 'vitest';
import { TelemetryHistoryStore, type TelemetryHistorySample } from './telemetryHistory';
import type { TelemetryData } from '../../hooks/useTelemetry';

const createTelemetry = (timestamp: number, overrides: Partial<TelemetryData> = {}): TelemetryData => ({
  IsRaceOn: 1,
  TimestampMS: timestamp,
  EngineMaxRpm: 8000,
  EngineIdleRpm: 900,
  CurrentEngineRpm: 3000,
  AccelerationX: 0,
  AccelerationY: 0,
  AccelerationZ: 9.81,
  VelocityX: 0,
  VelocityY: 0,
  VelocityZ: 10,
  Yaw: 0,
  NormalizedSuspensionTravel: [0.1, 0.2, 0.3, 0.4],
  TireSlipRatio: [0.01, 0.02, 0.03, 0.04],
  TireSlipAngle: [0.1, 0.2, 0.3, 0.4],
  ...overrides,
});

describe('TelemetryHistoryStore', () => {
  it('samples at the configured cadence and retains chronological values', () => {
    const store = new TelemetryHistoryStore();

    store.record(createTelemetry(1000));
    store.record(createTelemetry(1050));
    store.record(createTelemetry(1100, { NormalizedSuspensionTravel: [0.2, 0.3, 0.4, 0.5] }));

    const snapshot = store.getSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot[0].timestampMs).toBe(1000);
    expect(snapshot[1].suspension[3]).toBe(0.5);
  });

  it('bounds the rolling window instead of growing indefinitely', () => {
    const store = new TelemetryHistoryStore();

    for (let timestamp = 0; timestamp <= 40_000; timestamp += 100) {
      store.record(createTelemetry(timestamp));
    }

    const snapshot = store.getSnapshot();
    expect(snapshot.length).toBeLessThanOrEqual(300);
    expect(snapshot.at(-1)?.timestampMs).toBe(40_000);
    expect(snapshot[0].timestampMs).toBeGreaterThanOrEqual(10_100);
  });

  it('clears history on car changes and preserves unavailable optional fields', () => {
    const store = new TelemetryHistoryStore();

    store.record(createTelemetry(1000, { CarOrdinal: 1 }));
    store.record(createTelemetry(1100, { CarOrdinal: 2, TireTemp: undefined, TireCombinedSlip: undefined }));

    const sample: TelemetryHistorySample | undefined = store.getSnapshot()[0];
    expect(store.getSnapshot()).toHaveLength(1);
    expect(sample?.tireTemp).toBeNull();
    expect(sample?.combinedSlip).toBeNull();
  });
});
