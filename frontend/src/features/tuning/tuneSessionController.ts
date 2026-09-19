import type { TuningCaptureMetadata } from '../../domain/tuning/telemetryCapture';
import type { TelemetryData } from '../../hooks/useTelemetry';
import type { TuningMeasurementState } from './tuningMeasurement';

/**
 * Identity fields that make a Tune measurement unsafe to reuse. `profileKey`
 * deliberately follows the existing engine dependency contract rather than
 * treating suspension or tyre edits as an engine change.
 */
export interface TuneSessionIdentity {
  carId: string;
  performanceIndex: number | null;
  carClass: number | null;
  profileKey: string;
}

export interface TuneAsyncToken {
  generation: number;
  identity: TuneSessionIdentity;
}

export interface CaptureFrameIdentity {
  carId: string;
  performanceIndex: number | null;
  carClass: number | null;
}

export type EngineMeasurementPhase = 'idle' | 'collecting' | 'paused' | 'complete' | 'invalidated';

export const MAX_TUNING_CAPTURE_SAMPLES = 30000;

/** An extra run may finish from the cap pause while retaining its last ready result. */
export const canFinishAdditionalMeasurement = (
  phase: EngineMeasurementPhase,
  autoFinish: boolean,
  sampleCount: number,
  hasReadySnapshot: boolean,
  status: TuningMeasurementState['status'],
): boolean => !autoFinish
  && (phase === 'collecting' || (phase === 'paused' && sampleCount >= MAX_TUNING_CAPTURE_SAMPLES))
  && hasReadySnapshot
  && status !== 'blocked';

/** Terminal transitions are rare and must not wait behind collecting-progress throttling. */
export const shouldForceMeasurementPublish = (
  previousPhase: EngineMeasurementPhase,
  nextPhase: EngineMeasurementPhase,
  status: TuningMeasurementState['status'],
): boolean => status === 'blocked'
  || (previousPhase !== nextPhase && (nextPhase === 'complete' || nextPhase === 'invalidated'));

/** Keep an idle archive selection while its first complete live identity hydrates. */
export const shouldPreserveIdleIdentityHydration = (
  previous: TuneSessionIdentity,
  next: TuneSessionIdentity,
  phase: EngineMeasurementPhase,
): boolean => phase === 'idle'
  && previous.carId === next.carId
  && previous.profileKey === next.profileKey
  && previous.performanceIndex === null
  && previous.carClass === null
  && next.performanceIndex !== null
  && next.carClass !== null;

export interface EngineObservationSaveToken {
  archiveGeneration: number;
  identityGeneration: number;
  dependencyKey: string;
}

export const sameTuneSessionIdentity = (left: TuneSessionIdentity, right: TuneSessionIdentity): boolean =>
  left.carId === right.carId
  && left.performanceIndex === right.performanceIndex
  && left.carClass === right.carClass
  && left.profileKey === right.profileKey;

/** A token captured before I/O may apply only while the same Tune identity remains active. */
export const isCurrentTuneAsyncToken = (token: TuneAsyncToken, current: TuneAsyncToken): boolean =>
  token.generation === current.generation && sameTuneSessionIdentity(token.identity, current.identity);

export const nextTuneAsyncToken = (previous: TuneAsyncToken, identity: TuneSessionIdentity): TuneAsyncToken => ({
  generation: sameTuneSessionIdentity(previous.identity, identity) ? previous.generation : previous.generation + 1,
  identity,
});

export const captureFrameIdentity = (frame: TelemetryData): CaptureFrameIdentity => ({
  carId: Number.isInteger(frame.CarOrdinal) && (frame.CarOrdinal ?? 0) > 0 ? String(frame.CarOrdinal) : '',
  performanceIndex: Number.isInteger(frame.CarPerformanceIndex) ? frame.CarPerformanceIndex! : null,
  carClass: Number.isInteger(frame.CarClass) ? frame.CarClass! : null,
});

export const captureIdentityMatches = (expected: CaptureFrameIdentity, frame: TelemetryData): boolean => {
  const actual = captureFrameIdentity(frame);
  return actual.carId === expected.carId
    && (expected.performanceIndex === null || actual.performanceIndex === expected.performanceIndex)
    && (expected.carClass === null || actual.carClass === expected.carClass);
};

/** An untouched measurement has no frames or state to invalidate during profile hydration. */
export const shouldInvalidateMeasurementAttempt = (phase: EngineMeasurementPhase): boolean => phase !== 'idle';

/**
 * Keep the original selected-observation gate: a live build is reusable only
 * while its car, PI, class, and reported engine limit still agree.
 */
export const selectedEngineObservationMatchesLiveTelemetry = (
  carId: string,
  measurement: TuningMeasurementState | null | undefined,
  data: TelemetryData | null,
): boolean => !data || data.IsRaceOn !== 1 || !measurement || (
  String(data.CarOrdinal) === carId
  && data.CarPerformanceIndex === measurement.identity?.performanceIndex
  && data.CarClass === measurement.identity?.carClass
  && data.EngineMaxRpm === measurement.engineMaxRpm
);

/** A durable save may finish after a retry or identity change, but must not retake UI selection. */
export const isCurrentEngineObservationSaveToken = (
  request: EngineObservationSaveToken,
  current: EngineObservationSaveToken,
): boolean => request.archiveGeneration === current.archiveGeneration
  && request.identityGeneration === current.identityGeneration
  && request.dependencyKey === current.dependencyKey;

export const defaultTuneCaptureMetadata = (carId: string): TuningCaptureMetadata => ({
  label: `tuning-capture-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  purpose: 'tire-and-chassis-validation',
  carId,
  gameBuild: 'unknown',
  installedParts: 'unknown',
  tireType: 'unknown',
  surface: 'unknown',
  weather: 'unknown',
  eventType: 'unknown',
  track: 'unknown',
  shareCode: 'unknown',
  driverAssists: 'unknown',
  notes: '',
});
