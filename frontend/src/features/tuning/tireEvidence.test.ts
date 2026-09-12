import { describe, expect, it } from 'vitest';
import { observeTireEvidence } from './tireEvidence';
import type { TuningCaptureSample } from '../../domain/tuning/telemetryCapture';

const sample = (overrides: Partial<TuningCaptureSample> = {}): TuningCaptureSample => ({
  timestampMS: 1000, isRaceOn: 1, carOrdinal: 10, performanceIndex: 700, carClass: 8,
  speedMps: 20, rpm: 4000, gear: 3, accelInput: 255, brakeInput: 0, clutchInput: 0, handBrakeInput: 0,
  steerInput: 0, accelerationX: 0.1, accelerationY: 0, accelerationZ: 3.5, velocityX: 0, velocityY: 0, velocityZ: 20,
  normalizedSuspensionTravel: [0.5, 0.5, 0.5, 0.5], tireSlipRatio: [0.1, 0.1, 0.2, 0.2],
  tireSlipAngle: [0, 0, 0, 0], tireTemp: [70, 71, 72, 73], tireCombinedSlip: [0, 0, 0, 0],
  positionX: 0, positionY: 0, positionZ: 0, surfaceRumble: [0, 0, 0, 0], lapNumber: 1, currentRaceTime: 1,
  pitch: 0, roll: 0, ...overrides,
});

describe('observeTireEvidence', () => {
  const identity = { carOrdinal: 10, performanceIndex: 700, carClass: 8 };

  it('returns conditioned observable acceleration, normalized slip and temperatures', () => {
    const result = observeTireEvidence([sample(), sample({ timestampMS: 1016, accelerationZ: 4 })], identity);
    expect(result.status).toBe('observed');
    expect(result.acceptedSampleCount).toBe(2);
    expect(result.observedLongitudinalAccelerationMps2).toBe(3.75);
    expect(result.maxObservedNormalizedSlip).toBe(0.2);
    expect(result.observedTireTemperature).toEqual([70, 71, 72, 73]);
  });

  it('rejects identity mismatch, nonfinite data, steering, braking and airborne samples', () => {
    const result = observeTireEvidence([
      sample({ carOrdinal: 11 }), sample({ timestampMS: Number.NaN }), sample({ timestampMS: 1016, steerInput: 4 }),
      sample({ timestampMS: 1032, brakeInput: 1 }), sample({ timestampMS: 1048, normalizedSuspensionTravel: [0, 0.5, 0.5, 0.5] }),
    ], identity);
    expect(result.status).toBe('unavailable');
    expect(result.acceptedSampleCount).toBe(0);
    expect(result.unavailableReasons).toEqual(expect.arrayContaining(['identity-mismatch', 'timestamp-invalid', 'not-straight', 'brake-active', 'airborne-or-suspension-invalid']));
  });

  it('reports missing slip and temperature channels as unavailable', () => {
    const result = observeTireEvidence([sample({ missingChannels: ['TireSlipRatio.0', 'TireTemp.1'] })], identity);
    expect(result.status).toBe('observed');
    expect(result.maxObservedNormalizedSlip).toBeNull();
    expect(result.observedTireTemperature).toBeNull();
  });

  it('fails closed for throttle, clutch, and discontinuous capture segments', () => {
    const result = observeTireEvidence([
      sample(),
      sample({ timestampMS: 1016, accelInput: 0 }),
      sample({ timestampMS: 1032, clutchInput: 1 }),
      sample({ timestampMS: 2000 }),
    ], identity);
    expect(result.status).toBe('unavailable');
    expect(result.acceptedSampleCount).toBe(2);
    expect(result.observedLongitudinalAccelerationMps2).toBeNull();
    expect(result.unavailableReasons).toEqual(expect.arrayContaining(['throttle-or-clutch-invalid', 'capture-discontinuous']));
  });

  it('does not turn malformed wheel arrays into zero-valued evidence', () => {
    const malformed = sample({ tireTemp: undefined as unknown as number[], tireSlipRatio: undefined as unknown as number[] });
    const result = observeTireEvidence([malformed], identity);
    expect(result.observedTireTemperature).toBeNull();
    expect(result.maxObservedNormalizedSlip).toBeNull();
    const empty = observeTireEvidence([sample({ tireTemp: [], tireSlipRatio: [] })], identity);
    expect(empty.observedTireTemperature).toBeNull();
    expect(empty.maxObservedNormalizedSlip).toBeNull();
    const wrongSize = observeTireEvidence([sample({ tireSlipRatio: [1, 2, 3, 4, 5] })], identity);
    expect(wrongSize.maxObservedNormalizedSlip).toBeNull();
    const malformedChannels = observeTireEvidence([sample({ missingChannels: [null] as unknown as string[] })], identity);
    expect(malformedChannels.status).toBe('unavailable');
  });
});
