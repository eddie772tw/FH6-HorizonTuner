export interface CalibrationProgress {
  timestamp: number;
  advancedAt: number | null;
}

/** Replayed UI frames must not refresh the age of the game's measurements. */
export function advanceCalibrationProgress(
  previous: CalibrationProgress | null, timestamp: number, now: number,
): CalibrationProgress {
  if (!previous || !Number.isFinite(previous.timestamp) || !Number.isFinite(timestamp) || timestamp < previous.timestamp) {
    return { timestamp, advancedAt: null };
  }
  return timestamp > previous.timestamp
    ? { timestamp, advancedAt: now }
    : previous;
}

export function isCalibrationFresh(progress: CalibrationProgress | null, now: number): boolean {
  return progress?.advancedAt != null && now >= progress.advancedAt && now - progress.advancedAt < 2000;
}

/** Setup review is allowed in menus, using the last identified car as an anchor.
 * Freshness is required only for subsequent driving analysis. */
export function canConfirmSetup(matchingCar: boolean, timestamp: number | undefined): boolean {
  return matchingCar && typeof timestamp === 'number' && Number.isFinite(timestamp);
}

export function canCalibrate(fresh: boolean, confirmedTimestamp: number | null,
  timestamp: number | undefined, matchingCar: boolean, raceOn: number | undefined,
  speed: number | undefined): boolean {
  return fresh && matchingCar && confirmedTimestamp !== null && timestamp !== undefined
    && timestamp > confirmedTimestamp && raceOn === 1 && typeof speed === 'number' && Number.isFinite(speed) && speed > 2;
}
