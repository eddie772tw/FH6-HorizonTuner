import { describe, expect, it } from 'vitest';
import { captureToCsv, summarizeCapture, telemetryToCaptureSample } from './telemetryCapture';

const frame = (timestamp: number, speed: number) => telemetryToCaptureSample({
  TimestampMS: timestamp,
  IsRaceOn: 1,
  CarOrdinal: 123,
  EngineMaxRpm: 8000,
  EngineIdleRpm: 1000,
  CurrentEngineRpm: 5000,
  AccelerationX: 9.80665,
  AccelerationY: 0,
    AccelerationZ: -19.6133,
  VelocityX: 0,
  VelocityY: 0,
    VelocityZ: speed,
    SpeedMetersPerSecond: speed,
    Yaw: 0,
  NormalizedSuspensionTravel: [0.1, 0.2, 0.3, 0.4],
  TireSlipRatio: [0.1, -0.2, 0.3, -0.4],
  TireSlipAngle: [0.1, 0.2, 0.3, 0.4],
  TireTemp: [80, 81, 82, 83],
  TireCombinedSlip: [0.2, 0.3, 0.4, 0.5],
  Gear: 3,
  AccelInput: 255,
  BrakeInput: 0,
  ClutchInput: 0,
  HandBrakeInput: 0,
  SteerInput: 0,
  PositionX: 1,
  PositionY: 2,
  PositionZ: 3,
  SurfaceRumble: [0.1, 0.2],
  LapNumber: 1,
  CurrentRaceTime: timestamp / 1000
});

describe('tuning telemetry capture', () => {
  it('summarizes cadence, dynamics, and wheel signals without losing sign-safe peaks', () => {
    const summary = summarizeCapture([frame(0, 10), frame(16.667, 20), frame(33.334, 30)]);
    expect(summary.sampleCount).toBe(3);
    expect(summary.cadenceHz).toBeCloseTo(60, 1);
    expect(summary.maxSpeedKmh).toBe(108);
    expect(summary.maxLongitudinalG).toBe(2);
    expect(summary.maxLateralG).toBe(1);
    expect(summary.peakSlipRatio).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(summary.peakSlipAngleDeg[0]).toBeCloseTo(5.73, 2);
  });

  it('exports a stable CSV header and catches non-monotonic timestamps', () => {
    const capture = { schemaVersion: 'tuning-capture/v1' as const, capturedAt: new Date(0).toISOString(), metadata: {} as never, samples: [frame(10, 1), frame(10, 2)] };
    const summary = summarizeCapture(capture.samples);
    const csv = captureToCsv(capture);
    expect(summary.droppedTimestampCount).toBe(1);
    expect(csv.split('\n')[0]).toContain('timestampMS');
    expect(csv.split('\n')).toHaveLength(3);
  });
});
