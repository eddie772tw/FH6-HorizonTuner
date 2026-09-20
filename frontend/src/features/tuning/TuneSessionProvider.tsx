import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import { useCarParams } from '../../context/CarParamsContext';
import type { TuningCaptureFile, TuningCaptureMetadata, TuningCaptureSample } from '../../domain/tuning/telemetryCapture';
import { telemetryToCaptureSample } from '../../domain/tuning/telemetryCapture';
import { subscribeToDecodedTelemetry, useTelemetry, type TelemetryData } from '../../hooks/useTelemetry';
import type { DevRaceGoal, DevSurface } from '../../utils/tuningMath_dev';
import { engineDependencyKey } from './engineMeasurementArchive';
import {
  advanceTuningMeasurement,
  createTuningMeasurement,
  getTuningMeasurementReadiness,
  retainReadyMeasurementSnapshot,
  type TuningMeasurementState,
} from './tuningMeasurement';
import { restoreWorkflowStep, serializeWorkflowProfile } from './tuningWorkflow';
import { useEngineMeasurementArchive } from './useEngineMeasurementArchive';
import {
  captureFrameIdentity,
  captureIdentityMatches,
  canFinishAdditionalMeasurement,
  defaultTuneCaptureMetadata,
  MAX_TUNING_CAPTURE_SAMPLES,
  nextTuneAsyncToken,
  selectedEngineObservationMatchesLiveTelemetry,
  shouldForceMeasurementPublish,
  shouldInvalidateMeasurementAttempt,
  shouldPreserveIdleIdentityHydration,
  type CaptureFrameIdentity,
  type EngineMeasurementPhase,
  type TuneAsyncToken,
  type TuneSessionIdentity,
} from './tuneSessionController';

type TuneCaptureStatus = 'idle' | 'capturing' | 'complete' | 'invalidated';

interface EngineMeasurementRuntime {
  state: TuningMeasurementState;
  phase: EngineMeasurementPhase;
  autoFinish: boolean;
  sampleCount: number;
  hasReadySnapshot: boolean;
  revision: number;
}

interface RawCaptureRuntime {
  metadata: TuningCaptureMetadata;
  status: TuneCaptureStatus;
  capture: TuningCaptureFile | null;
  sampleCount: number;
  revision: number;
}

export interface TuneSessionValue {
  identity: TuneSessionIdentity;
  identityGeneration: number;
  profile: CarParams | null;
  workflow: {
    step: number;
    goal: string;
    season: 'Summer' | 'Autumn' | 'Winter' | 'Spring';
    reviewHistory: boolean;
    setStep: (step: number) => void;
    setGoal: (goal: string) => void;
    setSeason: (season: 'Summer' | 'Autumn' | 'Winter' | 'Spring') => void;
    setReviewHistory: (value: boolean | ((previous: boolean) => boolean)) => void;
  };
  developer: {
    step: number;
    raceGoal: DevRaceGoal;
    surface: DevSurface;
    targetTopSpeedKmh: number;
    targetRideFrequencyFrontHz: number;
    targetRideFrequencyRearHz: number;
    dampingRatioFront: number;
    dampingRatioRear: number;
    showCapture: boolean;
    setStep: (step: number) => void;
    setRaceGoal: (goal: DevRaceGoal) => void;
    setSurface: (surface: DevSurface) => void;
    setTargetTopSpeedKmh: (value: number) => void;
    setTargetRideFrequencyFrontHz: (value: number) => void;
    setTargetRideFrequencyRearHz: (value: number) => void;
    setDampingRatioFront: (value: number) => void;
    setDampingRatioRear: (value: number) => void;
    setShowCapture: (show: boolean) => void;
  };
  engine: ReturnType<typeof useEngineMeasurementArchive>;
  engineMeasurement: EngineMeasurementRuntime & {
    ensureStarted: (enabled: boolean) => void;
    pauseOrResume: () => void;
    restart: (enabled: boolean) => void;
    collectMore: () => void;
    finishAdditional: () => void;
    complete: () => void;
    captureSnapshot: () => TuningCaptureFile;
  };
  capture: RawCaptureRuntime & {
    activeCapture: TuningCaptureFile | null;
    setMetadata: (metadata: TuningCaptureMetadata) => void;
    start: () => void;
    stop: (reason?: string) => void;
    clear: () => void;
  };
}

const TuneSessionContext = createContext<TuneSessionValue | null>(null);

const initialWorkflowStep = (): number => {
  try {
    return restoreWorkflowStep(JSON.parse(localStorage.getItem('tuning-workflow-state') || 'null'));
  } catch {
    return 1;
  }
};

const isInteger = (value: number | undefined): value is number => Number.isInteger(value);

interface LiveTuneIdentity extends Pick<TuneSessionIdentity, 'performanceIndex' | 'carClass'> {
  carId: string;
}

const telemetryIdentityFor = (carId: string, data: TelemetryData | null): LiveTuneIdentity | null => {
  if (!data || data.IsRaceOn !== 1 || String(data.CarOrdinal) !== carId
    || !isInteger(data.CarPerformanceIndex) || !isInteger(data.CarClass)) return null;
  return { carId, performanceIndex: data.CarPerformanceIndex, carClass: data.CarClass };
};

const isMeasurementIdentityCurrent = (state: TuningMeasurementState, identity: TuneSessionIdentity): boolean =>
  state.carId === identity.carId
  && (!state.identity || (
    (identity.performanceIndex === null || state.identity.performanceIndex === identity.performanceIndex)
    && (identity.carClass === null || state.identity.carClass === identity.carClass)
  ));

export function TuneSessionProvider({ children }: { children: ReactNode }) {
  const { carId, carParams, loadedCarId } = useCarParams();
  const { data, isConnected } = useTelemetry();
  const staticProfileJson = serializeWorkflowProfile(loadedCarId === carId ? carParams : null);
  const profile = useMemo(() => JSON.parse(staticProfileJson) as CarParams | null, [staticProfileJson]);
  const profileKey = engineDependencyKey(carId, profile);
  const [liveIdentity, setLiveIdentity] = useState<LiveTuneIdentity>({ carId, performanceIndex: null, carClass: null });
  useEffect(() => {
    const next = telemetryIdentityFor(carId, data);
    if (!next) return;
    setLiveIdentity(previous => previous.carId === next.carId
      && previous.performanceIndex === next.performanceIndex && previous.carClass === next.carClass ? previous : next);
  }, [carId, data]);
  const identity = useMemo<TuneSessionIdentity>(() => ({
    carId,
    profileKey,
    performanceIndex: liveIdentity.carId === carId ? liveIdentity.performanceIndex : null,
    carClass: liveIdentity.carId === carId ? liveIdentity.carClass : null,
  }), [carId, liveIdentity, profileKey]);

  const [workflowStep, setWorkflowStep] = useState(initialWorkflowStep);
  const [goal, setGoal] = useState('Road');
  const [season, setSeason] = useState<'Summer' | 'Autumn' | 'Winter' | 'Spring'>('Summer');
  const [reviewHistory, setReviewHistory] = useState(false);
  const [identityGeneration, setIdentityGeneration] = useState(0);
  const identityTokenRef = useRef<TuneAsyncToken>({ generation: 0, identity });

  const [developerStep, setDeveloperStep] = useState(1);
  const [developerRaceGoal, setDeveloperRaceGoal] = useState<DevRaceGoal>('Road');
  const [developerSurface, setDeveloperSurface] = useState<DevSurface>('tarmac');
  const [targetTopSpeedKmh, setTargetTopSpeedKmh] = useState(280);
  const [targetRideFrequencyFrontHz, setTargetRideFrequencyFrontHz] = useState(2.2);
  const [targetRideFrequencyRearHz, setTargetRideFrequencyRearHz] = useState(2.3);
  const [dampingRatioFront, setDampingRatioFront] = useState(0.70);
  const [dampingRatioRear, setDampingRatioRear] = useState(0.70);
  const [showCapture, setShowCapture] = useState(false);

  const engine = useEngineMeasurementArchive(carId, profile, identityGeneration);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const measurementStateRef = useRef<TuningMeasurementState>(createTuningMeasurement(carId));
  const measurementSamplesRef = useRef<TuningCaptureSample[]>([]);
  const measurementReadySnapshotRef = useRef<TuningMeasurementState | undefined>(undefined);
  const measurementPhaseRef = useRef<EngineMeasurementPhase>('idle');
  const measurementAutoFinishRef = useRef(true);
  const measurementLastUiUpdateRef = useRef(0);
  const [measurementRuntime, setMeasurementRuntime] = useState<EngineMeasurementRuntime>(() => ({
    state: measurementStateRef.current,
    phase: measurementPhaseRef.current,
    autoFinish: measurementAutoFinishRef.current,
    sampleCount: 0,
    hasReadySnapshot: false,
    revision: 0,
  }));

  const captureMetadataRef = useRef(defaultTuneCaptureMetadata(carId));
  const captureSamplesRef = useRef<TuningCaptureSample[]>([]);
  const captureFinishedRef = useRef<TuningCaptureFile | null>(null);
  const captureStatusRef = useRef<TuneCaptureStatus>('idle');
  const captureIdentityRef = useRef<CaptureFrameIdentity | null>(null);
  const captureLastUiUpdateRef = useRef(0);
  const [captureRuntime, setCaptureRuntime] = useState<RawCaptureRuntime>(() => ({
    metadata: captureMetadataRef.current,
    status: 'idle',
    capture: null,
    sampleCount: 0,
    revision: 0,
  }));
  const carIdRef = useRef(carId);
  carIdRef.current = carId;

  const publishMeasurement = useCallback((force = false) => {
    const now = performance.now();
    if (!force && now - measurementLastUiUpdateRef.current < 200) return;
    measurementLastUiUpdateRef.current = now;
    setMeasurementRuntime(previous => ({
      state: measurementStateRef.current,
      phase: measurementPhaseRef.current,
      autoFinish: measurementAutoFinishRef.current,
      sampleCount: measurementSamplesRef.current.length,
      hasReadySnapshot: measurementReadySnapshotRef.current !== undefined,
      revision: previous.revision + 1,
    }));
  }, []);

  const measurementCaptureSnapshot = useCallback((): TuningCaptureFile => ({
    schemaVersion: 'tuning-capture/v1',
    capturedAt: new Date().toISOString(),
    metadata: {
      label: 'engine-measurement',
      purpose: 'engine-inputs',
      carId: measurementStateRef.current.carId,
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
    },
    recording: { source: 'decoded-websocket' },
    samples: [...measurementSamplesRef.current],
    references: {
      observationStatus: measurementStateRef.current.status,
      summary: measurementStateRef.current,
    },
  }), []);

  const publishCapture = useCallback((force = false) => {
    const now = performance.now();
    if (!force && now - captureLastUiUpdateRef.current < 250) return;
    captureLastUiUpdateRef.current = now;
    setCaptureRuntime(previous => ({
      metadata: captureMetadataRef.current,
      status: captureStatusRef.current,
      capture: captureFinishedRef.current,
      sampleCount: captureSamplesRef.current.length,
      revision: previous.revision + 1,
    }));
  }, []);

  const stopCapture = useCallback((reason = 'manual-stop') => {
    if (captureStatusRef.current !== 'capturing') return;
    captureStatusRef.current = reason === 'identity-changed' ? 'invalidated' : 'complete';
    captureFinishedRef.current = {
      schemaVersion: 'tuning-capture/v1',
      capturedAt: new Date().toISOString(),
      metadata: { ...captureMetadataRef.current },
      recording: { source: 'decoded-websocket', endReason: reason },
      samples: [...captureSamplesRef.current],
    };
    publishCapture(true);
  }, [publishCapture]);

  const invalidateMeasurement = useCallback(() => {
    measurementStateRef.current = {
      ...createTuningMeasurement(carIdRef.current),
      status: 'blocked',
      guidance: 'identity-changed',
    };
    measurementSamplesRef.current = [];
    measurementReadySnapshotRef.current = undefined;
    measurementAutoFinishRef.current = true;
    measurementPhaseRef.current = 'invalidated';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const resetUnstartedMeasurement = useCallback(() => {
    measurementStateRef.current = createTuningMeasurement(carIdRef.current);
    measurementSamplesRef.current = [];
    measurementReadySnapshotRef.current = undefined;
    measurementAutoFinishRef.current = true;
    measurementPhaseRef.current = 'idle';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const invalidateRawCapture = useCallback(() => {
    if (captureStatusRef.current === 'capturing') {
      stopCapture('identity-changed');
      return;
    }
    captureMetadataRef.current = { ...captureMetadataRef.current, carId: carIdRef.current };
    if (captureStatusRef.current === 'complete' && captureFinishedRef.current) {
      captureStatusRef.current = 'invalidated';
      captureFinishedRef.current = {
        ...captureFinishedRef.current,
        recording: { source: captureFinishedRef.current.recording?.source ?? 'decoded-websocket', ...captureFinishedRef.current.recording, endReason: 'identity-changed' },
      };
    }
    publishCapture(true);
  }, [publishCapture, stopCapture]);

  useEffect(() => {
    try {
      localStorage.setItem('tuning-workflow-state', JSON.stringify({ schema: 'tuning-workflow/v3', step: workflowStep }));
    } catch { /* Navigation still works without storage. */ }
  }, [workflowStep]);

  useEffect(() => {
    const nextToken = nextTuneAsyncToken(identityTokenRef.current, identity);
    if (nextToken.generation === identityTokenRef.current.generation) return;
    if (shouldPreserveIdleIdentityHydration(identityTokenRef.current.identity, identity, measurementPhaseRef.current)) {
      identityTokenRef.current = { generation: identityTokenRef.current.generation, identity };
      return;
    }
    identityTokenRef.current = nextToken;
    setIdentityGeneration(nextToken.generation);
    engineRef.current.invalidate();
    if (shouldInvalidateMeasurementAttempt(measurementPhaseRef.current)) invalidateMeasurement();
    else resetUnstartedMeasurement();
    invalidateRawCapture();
  }, [identity, invalidateMeasurement, invalidateRawCapture, resetUnstartedMeasurement]);

  useEffect(() => {
    if (selectedEngineObservationMatchesLiveTelemetry(carId, engine.observation?.data, data)) return;
    engineRef.current.invalidate();
    invalidateMeasurement();
    invalidateRawCapture();
  }, [carId, data, engine.observation?.id, engine.observation?.data, invalidateMeasurement, invalidateRawCapture]);

  useEffect(() => subscribeToDecodedTelemetry(frame => {
    if (captureStatusRef.current === 'capturing') {
      const expected = captureIdentityRef.current;
      const actual = captureFrameIdentity(frame);
      if (actual.carId !== carIdRef.current || (expected && !captureIdentityMatches(expected, frame))) {
        stopCapture('identity-changed');
      } else {
        captureIdentityRef.current = expected ?? actual;
        captureSamplesRef.current.push(telemetryToCaptureSample(frame));
        if (captureSamplesRef.current.length >= MAX_TUNING_CAPTURE_SAMPLES) stopCapture('sample-limit');
        else publishCapture();
      }
    }

    if (measurementPhaseRef.current !== 'collecting') return;
    if (measurementSamplesRef.current.length >= MAX_TUNING_CAPTURE_SAMPLES) {
      measurementPhaseRef.current = 'paused';
      publishMeasurement(true);
      return;
    }
    measurementSamplesRef.current.push(telemetryToCaptureSample(frame));
    const previousPhase = measurementPhaseRef.current;
    const now = performance.now();
    const next = advanceTuningMeasurement(measurementStateRef.current, frame, true, now);
    measurementStateRef.current = next;
    if (next.status === 'blocked') {
      measurementPhaseRef.current = 'invalidated';
      engineRef.current.invalidate();
    } else {
      measurementReadySnapshotRef.current = retainReadyMeasurementSnapshot(measurementReadySnapshotRef.current, next, now);
      if (measurementAutoFinishRef.current && getTuningMeasurementReadiness(next, now).ready) {
        measurementPhaseRef.current = 'complete';
      }
    }
    publishMeasurement(shouldForceMeasurementPublish(
      previousPhase,
      measurementPhaseRef.current,
      next.status,
    ));
  }), [publishCapture, publishMeasurement, stopCapture]);

  useEffect(() => {
    if (isConnected || measurementPhaseRef.current !== 'collecting') return;
    measurementStateRef.current = advanceTuningMeasurement(measurementStateRef.current, null, false, performance.now());
    publishMeasurement(true);
  }, [isConnected, publishMeasurement]);

  const ensureMeasurementStarted = useCallback((enabled: boolean) => {
    if (!enabled || measurementPhaseRef.current !== 'idle') return;
    measurementStateRef.current = createTuningMeasurement(carIdRef.current);
    measurementSamplesRef.current = [];
    measurementReadySnapshotRef.current = undefined;
    measurementAutoFinishRef.current = true;
    measurementPhaseRef.current = 'collecting';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const restartMeasurement = useCallback((enabled: boolean) => {
    if (!enabled) return;
    engineRef.current.invalidate();
    measurementStateRef.current = createTuningMeasurement(carIdRef.current);
    measurementSamplesRef.current = [];
    measurementReadySnapshotRef.current = undefined;
    measurementAutoFinishRef.current = true;
    measurementPhaseRef.current = 'collecting';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const pauseOrResumeMeasurement = useCallback(() => {
    if (measurementPhaseRef.current === 'collecting') {
      measurementStateRef.current = { ...measurementStateRef.current, lastAcceptedTimestampMs: undefined };
      measurementPhaseRef.current = 'paused';
    } else if (measurementPhaseRef.current === 'paused') {
      measurementStateRef.current = { ...measurementStateRef.current, lastAcceptedTimestampMs: undefined };
      measurementPhaseRef.current = 'collecting';
    }
    publishMeasurement(true);
  }, [publishMeasurement]);

  const collectMoreMeasurement = useCallback(() => {
    if (measurementPhaseRef.current !== 'complete') return;
    measurementReadySnapshotRef.current = measurementStateRef.current;
    measurementStateRef.current = { ...measurementStateRef.current, lastAcceptedTimestampMs: undefined };
    measurementAutoFinishRef.current = false;
    measurementPhaseRef.current = 'collecting';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const finishAdditionalMeasurement = useCallback(() => {
    const snapshot = measurementReadySnapshotRef.current;
    if (!snapshot) return;
    if (!canFinishAdditionalMeasurement(measurementPhaseRef.current, measurementAutoFinishRef.current,
      measurementSamplesRef.current.length, true, measurementStateRef.current.status)) return;
    if (!isMeasurementIdentityCurrent(snapshot, identityTokenRef.current.identity)) return;
    measurementStateRef.current = snapshot;
    measurementPhaseRef.current = 'complete';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const completeMeasurement = useCallback(() => {
    if (measurementPhaseRef.current !== 'complete') return;
    const state = measurementStateRef.current;
    if (!isMeasurementIdentityCurrent(state, identityTokenRef.current.identity)) return;
    void engineRef.current.complete(state, measurementCaptureSnapshot());
  }, [measurementCaptureSnapshot]);

  const startCapture = useCallback(() => {
    captureSamplesRef.current = [];
    captureFinishedRef.current = null;
    captureIdentityRef.current = null;
    captureMetadataRef.current = { ...captureMetadataRef.current, carId: carIdRef.current };
    captureStatusRef.current = 'capturing';
    publishCapture(true);
  }, [publishCapture]);

  const clearCapture = useCallback(() => {
    if (captureStatusRef.current === 'capturing') return;
    captureSamplesRef.current = [];
    captureFinishedRef.current = null;
    captureIdentityRef.current = null;
    captureStatusRef.current = 'idle';
    publishCapture(true);
  }, [publishCapture]);

  const setCaptureMetadata = useCallback((metadata: TuningCaptureMetadata) => {
    captureMetadataRef.current = { ...metadata, carId: carIdRef.current };
    publishCapture(true);
  }, [publishCapture]);

  const activeCapture = captureRuntime.capture ?? (
    captureRuntime.status === 'capturing' && captureSamplesRef.current.length > 0
      ? {
        schemaVersion: 'tuning-capture/v1' as const,
        capturedAt: new Date().toISOString(),
        metadata: captureMetadataRef.current,
        recording: { source: 'decoded-websocket' },
        samples: captureSamplesRef.current,
      }
      : null
  );

  const value = useMemo<TuneSessionValue>(() => ({
    identity,
    identityGeneration,
    profile,
    workflow: {
      step: workflowStep,
      goal,
      season,
      reviewHistory,
      setStep: setWorkflowStep,
      setGoal,
      setSeason,
      setReviewHistory,
    },
    developer: {
      step: developerStep,
      raceGoal: developerRaceGoal,
      surface: developerSurface,
      targetTopSpeedKmh,
      targetRideFrequencyFrontHz,
      targetRideFrequencyRearHz,
      dampingRatioFront,
      dampingRatioRear,
      showCapture,
      setStep: setDeveloperStep,
      setRaceGoal: setDeveloperRaceGoal,
      setSurface: setDeveloperSurface,
      setTargetTopSpeedKmh,
      setTargetRideFrequencyFrontHz,
      setTargetRideFrequencyRearHz,
      setDampingRatioFront,
      setDampingRatioRear,
      setShowCapture,
    },
    engine,
    engineMeasurement: {
      ...measurementRuntime,
      ensureStarted: ensureMeasurementStarted,
      pauseOrResume: pauseOrResumeMeasurement,
      restart: restartMeasurement,
      collectMore: collectMoreMeasurement,
      finishAdditional: finishAdditionalMeasurement,
      complete: completeMeasurement,
      captureSnapshot: measurementCaptureSnapshot,
    },
    capture: {
      ...captureRuntime,
      activeCapture,
      setMetadata: setCaptureMetadata,
      start: startCapture,
      stop: stopCapture,
      clear: clearCapture,
    },
  }), [
    activeCapture,
    captureRuntime,
    clearCapture,
    collectMoreMeasurement,
    completeMeasurement,
    dampingRatioFront,
    dampingRatioRear,
    developerRaceGoal,
    developerStep,
    developerSurface,
    engine,
    ensureMeasurementStarted,
    finishAdditionalMeasurement,
    goal,
    identity,
    identityGeneration,
    measurementCaptureSnapshot,
    measurementRuntime,
    pauseOrResumeMeasurement,
    profile,
    restartMeasurement,
    reviewHistory,
    season,
    setCaptureMetadata,
    showCapture,
    startCapture,
    stopCapture,
    targetRideFrequencyFrontHz,
    targetRideFrequencyRearHz,
    targetTopSpeedKmh,
    workflowStep,
  ]);

  return <TuneSessionContext.Provider value={value}>{children}</TuneSessionContext.Provider>;
}

export function useTuneSession(): TuneSessionValue {
  const value = useContext(TuneSessionContext);
  if (!value) throw new Error('useTuneSession must be rendered below TuneSessionProvider.');
  return value;
}

/** Keeps legacy callers working until the Coordinator mounts the Full-only provider. */
export function TuneSessionBoundary({ children }: { children: ReactNode }) {
  const existing = useContext(TuneSessionContext);
  return existing ? <>{children}</> : <TuneSessionProvider>{children}</TuneSessionProvider>;
}
