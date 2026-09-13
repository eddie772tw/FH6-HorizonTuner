import { describe, expect, it } from 'vitest';
import {
  captureFrameIdentity,
  captureIdentityMatches,
  isCurrentEngineObservationSaveToken,
  isCurrentTuneAsyncToken,
  nextTuneAsyncToken,
  selectedEngineObservationMatchesLiveTelemetry,
  shouldInvalidateMeasurementAttempt,
  type TuneAsyncToken,
} from './tuneSessionController';
import { createTuningMeasurement } from './tuningMeasurement';

const token = (generation = 0): TuneAsyncToken => ({
  generation,
  identity: { carId: '42', performanceIndex: 700, carClass: 3, profileKey: 'engine-key-a' },
});

describe('Tune session controller', () => {
  it('keeps an async result only for the identity that started it', async () => {
    const requestToken = token();
    const current = nextTuneAsyncToken(requestToken, {
      ...requestToken.identity,
      performanceIndex: 701,
    });
    let applied = false;

    await Promise.resolve().then(() => {
      if (isCurrentTuneAsyncToken(requestToken, current)) applied = true;
    });

    expect(current.generation).toBe(1);
    expect(applied).toBe(false);
  });

  it('does not invalidate a request when its engine dependency identity is unchanged', () => {
    const current = token(4);
    const next = nextTuneAsyncToken(current, { ...current.identity });

    expect(next).toEqual(current);
    expect(isCurrentTuneAsyncToken(current, next)).toBe(true);
  });

  it('invalidates an in-flight request when the relevant profile changes', () => {
    const requestToken = token(2);
    const current = nextTuneAsyncToken(requestToken, {
      ...requestToken.identity,
      profileKey: 'engine-key-b',
    });

    expect(current.generation).toBe(3);
    expect(isCurrentTuneAsyncToken(requestToken, current)).toBe(false);
  });

  it('refuses a capture frame from a changed PI or vehicle', () => {
    const expected = { carId: '42', performanceIndex: 700, carClass: 3 };
    const matchingFrame = { CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3 } as never;
    const changedPi = { CarOrdinal: 42, CarPerformanceIndex: 701, CarClass: 3 } as never;
    const changedCar = { CarOrdinal: 43, CarPerformanceIndex: 700, CarClass: 3 } as never;

    expect(captureFrameIdentity(matchingFrame)).toEqual(expected);
    expect(captureIdentityMatches(expected, matchingFrame)).toBe(true);
    expect(captureIdentityMatches(expected, changedPi)).toBe(false);
    expect(captureIdentityMatches(expected, changedCar)).toBe(false);
  });

  it('keeps an unstarted measurement idle during profile hydration but invalidates an actual attempt', () => {
    expect(shouldInvalidateMeasurementAttempt('idle')).toBe(false);
    expect(shouldInvalidateMeasurementAttempt('collecting')).toBe(true);
    expect(shouldInvalidateMeasurementAttempt('complete')).toBe(true);
  });

  it('rejects a selected observation when the live engine limit changes on the same build', () => {
    const measurement = {
      ...createTuningMeasurement('42'),
      identity: { ordinal: 42, performanceIndex: 700, carClass: 3 },
      engineMaxRpm: 8_000,
    };
    const matching = { IsRaceOn: 1, CarOrdinal: 42, CarPerformanceIndex: 700, CarClass: 3, EngineMaxRpm: 8_000 } as never;
    const changedRedline = { ...matching, EngineMaxRpm: 8_200 };

    expect(selectedEngineObservationMatchesLiveTelemetry('42', measurement, matching)).toBe(true);
    expect(selectedEngineObservationMatchesLiveTelemetry('42', measurement, changedRedline)).toBe(false);
  });

  it('does not let a save started before a retry select the old observation', () => {
    const save = { archiveGeneration: 4, identityGeneration: 2, dependencyKey: 'engine-key-a' };

    expect(isCurrentEngineObservationSaveToken(save, { ...save, archiveGeneration: 5 })).toBe(false);
    expect(isCurrentEngineObservationSaveToken(save, { ...save, identityGeneration: 3 })).toBe(false);
  });
});
