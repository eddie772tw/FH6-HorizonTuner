import { describe, expect, it } from 'vitest';
import { advanceCalibrationProgress, canCalibrate, canConfirmSetup, isCalibrationFresh } from './calibrationReadiness';

describe('calibration measurement provenance', () => {
  it('allows menu setup review but waits for subsequent fresh driving before analysis', () => {
    const lastRaceTimestamp = 5000;
    expect(canConfirmSetup(true, lastRaceTimestamp)).toBe(true);
    expect(canCalibrate(false, lastRaceTimestamp, lastRaceTimestamp, true, 0, 0)).toBe(false);
    expect(canCalibrate(true, lastRaceTimestamp, lastRaceTimestamp, true, 1, 30)).toBe(false);
    expect(canCalibrate(true, lastRaceTimestamp, 5016, true, 1, 30)).toBe(true);
    expect(canConfirmSetup(false, lastRaceTimestamp)).toBe(false);
    expect(canConfirmSetup(true, undefined)).toBe(false);
    expect(canConfirmSetup(true, NaN)).toBe(false);
    expect(canConfirmSetup(true, Infinity)).toBe(false);
  });
  it('requires progression, and replayed frames expire even with an open socket', () => {
    const first = advanceCalibrationProgress(null, 100, 0);
    expect(isCalibrationFresh(first, 0)).toBe(false);
    const next = advanceCalibrationProgress(first, 116, 16);
    expect(isCalibrationFresh(next, 16)).toBe(true);
    const replay = advanceCalibrationProgress(next, 116, 3000);
    expect(isCalibrationFresh(replay, 3000)).toBe(false);
    expect(isCalibrationFresh(advanceCalibrationProgress(next, 0, 3000), 3000)).toBe(false);
  });
  it('requires confirmed setup, subsequent driving data and matching identity', () => {
    expect(canCalibrate(true, null, 116, true, 1, 30)).toBe(false);
    expect(canCalibrate(true, 116, 116, true, 1, 30)).toBe(false);
    expect(canCalibrate(true, 116, 132, true, 1, 30)).toBe(true);
    expect(canCalibrate(false, 116, 132, true, 1, 30)).toBe(false);
    expect(canCalibrate(true, 116, 132, false, 1, 30)).toBe(false);
    expect(canCalibrate(true, 116, 132, true, 0, 30)).toBe(false);
    expect(canCalibrate(true, 116, 132, true, 1, 0)).toBe(false);
    expect(canCalibrate(true, 116, 132, true, 1, NaN)).toBe(false);
  });
});
