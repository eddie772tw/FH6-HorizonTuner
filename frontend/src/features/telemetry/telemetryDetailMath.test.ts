import { describe, expect, it } from 'vitest';
import type { TelemetryData } from '../../hooks/useTelemetry';
import type { TelemetryHistorySample } from './telemetryHistory';
import {
  calculateSuspensionMetrics,
  getDynamicsTrendValues,
  getOrientationTrendValues,
  getTireTrendValues,
  radiansToDegrees,
  readTireMetrics,
  summarizeSeries,
  toChartPoints,
} from './telemetryDetailMath';

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

const createSample = (timeSeconds: number, suspension: [number, number, number, number]): TelemetryHistorySample => ({
  timestampMs: timeSeconds * 1000,
  timeSeconds,
  suspension,
  tireTemp: null,
  slipRatio: [0, 0, 0, 0],
  slipAngle: [0, 0, 0, 0],
  combinedSlip: null,
  surfaceRumble: null,
  acceleration: [0, 0, 9.81],
  pitch: null,
  roll: null,
  yaw: null,
  speedMetersPerSecond: null,
  rpm: null,
  powerWatts: null,
  torqueNewtons: null,
  boost: null,
  gear: null,
  steerInput: null,
  accelInput: null,
  brakeInput: null,
  clutchInput: null,
  handBrakeInput: null,
});

describe('telemetry detail math', () => {
  it('summarizes finite values and preserves unavailable values', () => {
    expect(summarizeSeries([null, 0.2, Number.NaN, 0.8])).toEqual({ minimum: 0.2, maximum: 0.8, average: 0.5 });
    expect(summarizeSeries([null, Number.NaN])).toEqual({ minimum: null, maximum: null, average: null });
  });

  it('calculates suspension summaries, axle differences, rate and bottom-out state', () => {
    const history = [
      createSample(10, [0.1, 0.2, 0.3, 0.4]),
      createSample(10.5, [0.4, 0.5, 0.6, 1.0]),
    ];
    const metrics = calculateSuspensionMetrics(createTelemetry(10_500, {
      NormalizedSuspensionTravel: [0.4, 0.5, 0.6, 1.0],
    }), history);

    expect(metrics.frontAverage).toBeCloseTo(0.45);
    expect(metrics.rearAverage).toBeCloseTo(0.8);
    expect(metrics.frontRearDifference).toBeCloseTo(-0.35);
    expect(metrics.leftRightDifference).toBeCloseTo(-0.25);
    expect(metrics.travelRate).toBeCloseTo(0.75);
    expect(metrics.bottomOut).toEqual([false, false, false, true]);
    expect(metrics.summaries[3]).toEqual({ minimum: 0.4, maximum: 1.0, average: 0.7 });
  });

  it('requires complete axle inputs and positive elapsed time for derived values', () => {
    const metrics = calculateSuspensionMetrics(createTelemetry(100, {
      NormalizedSuspensionTravel: [0.1, undefined as unknown as number, 0.3, 0.4],
    }), [createSample(1, [0.1, 0.2, 0.3, 0.4]), createSample(1, [0.2, 0.3, 0.4, 0.5])]);

    expect(metrics.frontAverage).toBeNull();
    expect(metrics.frontRearDifference).toBeNull();
    expect(metrics.travelRate).toBeNull();
    expect(metrics.bottomOut[1]).toBeNull();
  });

  it('reads tire fields without manufacturing missing values and converts slip angle explicitly', () => {
    const metrics = readTireMetrics(createTelemetry(100, {
      TireTemp: [80, 81, 82, 83],
      TireCombinedSlip: undefined,
      SurfaceRumble: [0.1, 0.2],
    }));

    expect(metrics.temperature).toEqual([80, 81, 82, 83]);
    expect(metrics.combinedSlip).toEqual([null, null, null, null]);
    expect(metrics.surfaceRumble).toEqual([0.1, 0.2, null, null]);
    expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
    expect(radiansToDegrees(null)).toBeNull();
  });

  it('maps tire and dynamics trend series to display units', () => {
    const sample = createSample(4, [0.1, 0.2, 0.3, 0.4]);
    const withValues: TelemetryHistorySample = {
      ...sample,
      tireTemp: [80, 81, 82, 83],
      slipRatio: [0.1, 0.2, 0.3, 0.4],
      slipAngle: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
      combinedSlip: [0.2, 0.3, 0.4, 0.5],
      surfaceRumble: [1, 2, 3, 4],
      acceleration: [9.81, -9.81, 19.62],
      pitch: Math.PI / 4,
      roll: -Math.PI / 2,
      yaw: Math.PI,
    };

    expect(getTireTrendValues(withValues).slipAngle).toEqual({ FL: 0, FR: 90, RL: 180, RR: -90 });
    expect(getTireTrendValues(withValues).surfaceRumble).toEqual({ FL: 1, FR: 2, RL: 3, RR: 4 });
    expect(getDynamicsTrendValues(withValues)).toEqual({ X: 1, Y: -1, Z: 2 });
    expect(getOrientationTrendValues(withValues).Pitch).toBeCloseTo(45);
    expect(getOrientationTrendValues(withValues).Roll).toBeCloseTo(-90);
    expect(getOrientationTrendValues(withValues).Yaw).toBeCloseTo(180);
  });

  it('creates relative chart time from nonuniform history timestamps', () => {
    const points = toChartPoints([
      createSample(4, [0.1, 0.1, 0.1, 0.1]),
      createSample(4.25, [0.2, 0.2, 0.2, 0.2]),
      createSample(5.1, [0.3, 0.3, 0.3, 0.3]),
    ], (sample) => ({ FL: sample.suspension[0] }));

    expect(points.map((point) => point.time)).toEqual([0, 0.3, 1.1]);
  });
});
