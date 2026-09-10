import { describe, expect, it } from 'vitest';
import { decodedTelemetryEmitter, subscribeToDecodedTelemetry, type TelemetryData } from './useTelemetry';

const packet = (timestamp: number): TelemetryData => ({
  IsRaceOn: 1,
  TimestampMS: timestamp,
  EngineMaxRpm: 8_000,
  EngineIdleRpm: 800,
  CurrentEngineRpm: 4_000,
  AccelerationX: 0,
  AccelerationY: 0,
  AccelerationZ: 0,
  VelocityX: 0,
  VelocityY: 0,
  VelocityZ: 0,
  Yaw: 0,
  NormalizedSuspensionTravel: [0, 0, 0, 0],
  TireSlipRatio: [0, 0, 0, 0],
  TireSlipAngle: [0, 0, 0, 0],
});

describe('decoded telemetry subscription', () => {
  it('delivers each decoded packet synchronously and stops after unsubscribe', () => {
    const received: number[] = [];
    const unsubscribe = subscribeToDecodedTelemetry(frame => received.push(frame.TimestampMS));

    decodedTelemetryEmitter.dispatchEvent(new CustomEvent<TelemetryData>('packet', { detail: packet(10) }));
    decodedTelemetryEmitter.dispatchEvent(new CustomEvent<TelemetryData>('packet', { detail: packet(20) }));
    unsubscribe();
    decodedTelemetryEmitter.dispatchEvent(new CustomEvent<TelemetryData>('packet', { detail: packet(30) }));

    expect(received).toEqual([10, 20]);
  });
});
