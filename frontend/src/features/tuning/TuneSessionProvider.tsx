import { usesCvt } from '../../domain/tuning/transmission';
import { requestEngineBatch, type EngineBatchResult } from './engineBatch';
import { requestWorkflowCalculation, useWorkflowCalculation, workflowCalculationInput } from './useWorkflowCalculation';
import { useRatioBalanceDraft } from './useRatioBalanceDraft';
import { useEvidenceContext } from './evidenceContext';
import { useCvtEvidenceSession } from './useCvtEvidenceSession';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import { useCarParams } from '../../context/CarParamsContext';
import type { TuningCaptureFile, TuningCaptureMetadata, TuningCaptureSample } from '../../domain/tuning/telemetryCapture';
import { telemetryToCaptureSample } from '../../domain/tuning/telemetryCapture';
import { subscribeToDecodedTelemetry, useTelemetry, type TelemetryData } from '../../hooks/useTelemetry';
import { engineDependencyKey } from './engineObservationIdentity';
import { useEvMeasurementSession } from './useEvMeasurementSession';
import type { Season, TuningMeasurementState } from '../../domain/tuning/types';
import { createEngineCalculation } from './measurementInitialState';
import { canOpenTuningStep, restoreWorkflowStep, serializeWorkflowProfile } from './tuningWorkflow';
import { useEngineMeasurementArchive } from './useEngineMeasurementArchive';
import {
  captureFrameIdentity,
  captureIdentityMatches,
  canFinishAdditionalMeasurement,
  defaultTuneCaptureMetadata,
  MAX_TUNING_CAPTURE_SAMPLES,
  nextTuneAsyncToken,
  selectedEngineObservationMatchesLiveTelemetry,
  shouldInvalidateMeasurementAttempt,
  shouldPreserveIdleIdentityHydration,
  type CaptureFrameIdentity,
  type EngineMeasurementPhase,
  type TuneAsyncToken,
  type TuneSessionIdentity,
} from './tuneSessionController';

type TuneCaptureStatus = 'idle' | 'capturing' | 'complete' | 'invalidated';

interface EngineMeasurementRuntime {
  readiness?: EngineBatchResult["readiness"];
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
  ratioBalance: ReturnType<typeof useRatioBalanceDraft>;
  result: ReturnType<typeof useWorkflowCalculation>['result'];
  calculationStatus: ReturnType<typeof useWorkflowCalculation>['status'];
  identity: TuneSessionIdentity;
  identityGeneration: number;
  profile: CarParams | null;
  workflow: {
    step: number;
    goal: string;
    season: 'Summer' | 'Autumn' | 'Winter' | 'Spring';
    reviewHistory: boolean;
    setStep: (step: number) => void;
    navigateToStep: (step: number, isCurrent?: () => boolean, target?: Partial<{ goal: string; season: Season }>, signal?: AbortSignal) => Promise<void>;
    isNavigating: boolean;
    setGoal: (goal: string) => void;
    setSeason: (season: 'Summer' | 'Autumn' | 'Winter' | 'Spring') => void;
    setReviewHistory: (value: boolean | ((previous: boolean) => boolean)) => void;
  };
  engine: ReturnType<typeof useEngineMeasurementArchive>;
  evMeasurement: ReturnType<typeof useEvMeasurementSession>;
  cvtEvidence: ReturnType<typeof useCvtEvidenceSession>;
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
  if (!data || String(data.CarOrdinal) !== carId
    || !isInteger(data.CarPerformanceIndex) || !isInteger(data.CarClass)) return null;
  return { carId, performanceIndex: data.CarPerformanceIndex, carClass: data.CarClass };
};

const isMeasurementIdentityCurrent = (state: TuningMeasurementState, identity: TuneSessionIdentity): boolean =>
  state.carId === identity.carId
  && (!state.identity || (
    (identity.performanceIndex === null || state.identity.performanceIndex === identity.performanceIndex)
    && (identity.carClass === null || state.identity.carClass === identity.carClass)
  ));

export function TuneSessionProvider({ children, evGearingEnabled = true, cvtEvidenceEnabled = true }: {
  children: ReactNode;
  evGearingEnabled?: boolean;
  cvtEvidenceEnabled?: boolean;
}) {
  const { carId, carParams, loadedCarId, selectionSource, selectionGeneration = 0, saveCarParams, setCarParams, hasUnsavedParams } = useCarParams();
  const { data: telemetryData, isConnected } = useTelemetry();
  // A saved profile is an explicit offline selection, never the cached live build.
  const data = selectionSource === 'saved' ? null : telemetryData;
  const offlineSelectionRef = useRef(false);
  offlineSelectionRef.current = selectionSource === 'saved';
  const selectedParams = loadedCarId === carId ? carParams : null;
  // The target is sent separately to the solver and does not change measured vehicle identity.
  const staticProfileJson = serializeWorkflowProfile(selectedParams && { ...selectedParams, tuningTarget: undefined } as CarParams);
  const profile = useMemo(() => JSON.parse(staticProfileJson) as CarParams | null, [staticProfileJson]);
  const profileKey = engineDependencyKey(carId, profile);
  const iceMeasurementDisabledRef = useRef(false);
  iceMeasurementDisabledRef.current = offlineSelectionRef.current || profile?.isElectric === true || usesCvt(profile);
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
    performanceIndex: selectionSource !== 'saved' && liveIdentity.carId === carId ? liveIdentity.performanceIndex : null,
    carClass: selectionSource !== 'saved' && liveIdentity.carId === carId ? liveIdentity.carClass : null,
  }), [carId, liveIdentity, profileKey, selectionSource]);

  const [workflowStep, setWorkflowStep] = useState(initialWorkflowStep);
  const targetScope = JSON.stringify([carId, selectionGeneration]);
  const savedTarget = selectedParams?.tuningTarget;
  const [targetEdit, setTargetEdit] = useState<{ scope: string; goal?: string; season?: Season } | null>(null);
  const currentEdit = targetEdit?.scope === targetScope ? targetEdit : null;
  const goal = currentEdit?.goal ?? (savedTarget && ['Road', 'Rally', 'Drift', 'Drag'].includes(savedTarget.goal) ? savedTarget.goal : 'Road');
  const season = currentEdit?.season ?? (savedTarget && ['Summer', 'Autumn', 'Winter', 'Spring'].includes(savedTarget.season) ? savedTarget.season : 'Summer');
  const setGoal = useCallback((nextGoal: string) => {
    setTargetEdit(previous => ({ ...(previous?.scope === targetScope ? previous : { scope: targetScope }), goal: nextGoal }));
  }, [targetScope]);
  const setSeason = useCallback((nextSeason: Season) => {
    setTargetEdit(previous => ({ ...(previous?.scope === targetScope ? previous : { scope: targetScope }), season: nextSeason }));
  }, [targetScope]);

  const [reviewHistory, setReviewHistory] = useState(false);
  const [identityGeneration, setIdentityGeneration] = useState(0);
  const setupContext = JSON.stringify([staticProfileJson, selectionGeneration]);
  const setupContextRef = useRef(setupContext);
  setupContextRef.current = setupContext;
  const evMeasurement = useEvMeasurementSession(carId, profile, data, setupContext, isConnected, evGearingEnabled && !offlineSelectionRef.current);
  const identityTokenRef = useRef<TuneAsyncToken>({ generation: 0, identity });

  const engine = useEngineMeasurementArchive(carId, profile, identityGeneration, setupContext);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const measurementStateRef = useRef<TuningMeasurementState>(createEngineCalculation(carId));
  const measurementSetupRef = useRef(setupContext);
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
  const captureSetupRef = useRef(setupContext);
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
      readiness: measurementReadinessRef.current,
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

  const measurementReadinessRef = useRef<EngineBatchResult['readiness'] | undefined>(undefined);
  const measurementCursorRef = useRef(0);
  const measurementGenerationRef = useRef(0);
  const measurementConnectedRef = useRef(isConnected);
  measurementConnectedRef.current = isConnected;

  const invalidateMeasurement = useCallback(() => {
    measurementStateRef.current = {
      ...createEngineCalculation(carIdRef.current),
      status: 'blocked',
      guidance: 'identity-changed',
    };
    measurementSamplesRef.current = [];
    measurementCursorRef.current = 0;
    measurementGenerationRef.current++;
    measurementReadinessRef.current = undefined;
    measurementReadySnapshotRef.current = undefined;
    measurementAutoFinishRef.current = true;
    measurementPhaseRef.current = 'invalidated';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const resetUnstartedMeasurement = useCallback(() => {
    measurementStateRef.current = createEngineCalculation(carIdRef.current);
    measurementSamplesRef.current = [];
    measurementCursorRef.current = 0;
    measurementGenerationRef.current++;
    measurementReadinessRef.current = undefined;
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

  const previousSetupContext = useRef(setupContext);
  useEffect(() => {
    if (previousSetupContext.current === setupContext) return;
    previousSetupContext.current = setupContext;
    engineRef.current.invalidate();
    if (shouldInvalidateMeasurementAttempt(measurementPhaseRef.current)) invalidateMeasurement();
    else resetUnstartedMeasurement();
    invalidateRawCapture();
  }, [setupContext, invalidateMeasurement, invalidateRawCapture, resetUnstartedMeasurement]);

  const hasProducedGearing = Boolean(workflowStep === 3 && engine.observation && engine.calculation?.status === 'ready');

  useEffect(() => {
    if (hasProducedGearing) return;
    if (selectedEngineObservationMatchesLiveTelemetry(carId, engine.observation?.data, data)) return;
    engineRef.current.invalidate();
    invalidateMeasurement();
    invalidateRawCapture();
  }, [carId, data, engine.observation?.id, engine.observation?.data, invalidateMeasurement, invalidateRawCapture, hasProducedGearing]);

  useEffect(() => subscribeToDecodedTelemetry(frame => {
    if (captureStatusRef.current === 'capturing') {
      const expected = captureIdentityRef.current;
      const actual = captureFrameIdentity(frame);
      if (captureSetupRef.current !== setupContextRef.current) {
        stopCapture('setup-changed');
      } else if (actual.carId !== carIdRef.current || (expected && !captureIdentityMatches(expected, frame))) {
        stopCapture('identity-changed');
      } else {
        captureIdentityRef.current = expected ?? actual;
        captureSamplesRef.current.push(telemetryToCaptureSample(frame));
        if (captureSamplesRef.current.length >= MAX_TUNING_CAPTURE_SAMPLES) stopCapture('sample-limit');
        else publishCapture();
      }
    }

    if (iceMeasurementDisabledRef.current || measurementPhaseRef.current !== 'collecting' || measurementSetupRef.current !== setupContextRef.current) return;
    if (measurementSamplesRef.current.length >= MAX_TUNING_CAPTURE_SAMPLES) {
      measurementPhaseRef.current = 'paused';
      publishMeasurement(true);
      return;
    }
    measurementSamplesRef.current.push(telemetryToCaptureSample(frame));
    publishMeasurement();
  }), [publishCapture, publishMeasurement, stopCapture]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const tick = async () => {
      if (!iceMeasurementDisabledRef.current && (measurementPhaseRef.current === 'collecting' || measurementPhaseRef.current === 'paused')) {
        const generation = measurementGenerationRef.current;
        const requestedSetup = setupContextRef.current;
        const end = measurementSamplesRef.current.length;
        const start = measurementCursorRef.current;
        try {
          const result = await requestEngineBatch(carIdRef.current, measurementStateRef.current,
            measurementSamplesRef.current.slice(start, end), measurementConnectedRef.current, performance.now(), controller.signal);
          if (!stopped && generation === measurementGenerationRef.current && requestedSetup === setupContextRef.current) {
            measurementCursorRef.current = end;
            measurementStateRef.current = result.state;
            measurementReadinessRef.current = result.readiness;
            if (result.state.status === 'blocked') {
              measurementReadySnapshotRef.current = undefined;
              measurementPhaseRef.current = 'invalidated';
              engineRef.current.invalidate();
            } else {
              if (result.readySnapshot) measurementReadySnapshotRef.current = result.readySnapshot;
              if (measurementAutoFinishRef.current && result.readiness.ready) measurementPhaseRef.current = 'complete';
            }
            publishMeasurement(true);
          }
        } catch { /* Keep unprocessed samples for recovery; no local qualification fallback. */ }
      }
      if (!stopped) timer = setTimeout(tick, 250);
    };
    void tick();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [publishMeasurement]);

  const ensureMeasurementStarted = useCallback((enabled: boolean) => {
    if (iceMeasurementDisabledRef.current || !enabled || measurementPhaseRef.current !== 'idle') return;
    measurementStateRef.current = createEngineCalculation(carIdRef.current);
    measurementSetupRef.current = setupContextRef.current;
    measurementSamplesRef.current = [];
    measurementCursorRef.current = 0;
    measurementGenerationRef.current++;
    measurementReadinessRef.current = undefined;
    measurementReadySnapshotRef.current = undefined;
    measurementAutoFinishRef.current = true;
    measurementPhaseRef.current = 'collecting';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const restartMeasurement = useCallback((enabled: boolean) => {
    if (iceMeasurementDisabledRef.current || !enabled) return;
    engineRef.current.invalidate();
    measurementStateRef.current = createEngineCalculation(carIdRef.current);
    measurementSetupRef.current = setupContextRef.current;
    measurementSamplesRef.current = [];
    measurementCursorRef.current = 0;
    measurementGenerationRef.current++;
    measurementReadinessRef.current = undefined;
    measurementReadySnapshotRef.current = undefined;
    measurementAutoFinishRef.current = true;
    measurementPhaseRef.current = 'collecting';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const pauseOrResumeMeasurement = useCallback(() => {
    if (iceMeasurementDisabledRef.current) return;
    measurementGenerationRef.current++;
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
    if (iceMeasurementDisabledRef.current) return;
    measurementGenerationRef.current++;
    if (measurementPhaseRef.current !== 'complete') return;
    measurementReadySnapshotRef.current = measurementStateRef.current;
    measurementStateRef.current = { ...measurementStateRef.current, lastAcceptedTimestampMs: undefined };
    measurementAutoFinishRef.current = false;
    measurementPhaseRef.current = 'collecting';
    publishMeasurement(true);
  }, [publishMeasurement]);

  const finishAdditionalMeasurement = useCallback(() => {
    measurementGenerationRef.current++;
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
    if (iceMeasurementDisabledRef.current || measurementPhaseRef.current !== 'complete') return;
    const state = measurementStateRef.current;
    if (!isMeasurementIdentityCurrent(state, identityTokenRef.current.identity)) return;
    void engineRef.current.complete(state, measurementCaptureSnapshot());
  }, [measurementCaptureSnapshot]);

  const startCapture = useCallback(() => {
    if (offlineSelectionRef.current) return;
    captureSamplesRef.current = [];
    captureSetupRef.current = setupContextRef.current;
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

  const prepared = (hasProducedGearing || selectedEngineObservationMatchesLiveTelemetry(carId, engine.current, data)) ? engine.current : null;
  const calculation = prepared && engine.calculation?.status === 'ready' ? engine.calculation : null;
  const evidenceContext = JSON.stringify([carId, staticProfileJson, identityGeneration, selectionGeneration]);
  const cvtLiveIdentity = isConnected ? telemetryIdentityFor(carId, data) : null;
  // Read fresh telemetry directly: the shared identity state updates in an effect.
  const cvtIdentity = cvtLiveIdentity ? { ...identity, ...cvtLiveIdentity } : identity;
  const cvtEvidence = useCvtEvidenceSession(JSON.stringify([evidenceContext, cvtIdentity]), cvtIdentity, profile,
    cvtLiveIdentity !== null);
  // Only an explicit EV confirmation/reselection creates a new lifetime for the same immutable raw ID.
  const evidenceCurrent = useEvidenceContext(evidenceContext, profile?.isElectric
    ? evMeasurement.evidenceId ? JSON.stringify([evMeasurement.evidenceId, evMeasurement.evidenceLifetime]) : null
    : engine.observation?.id ?? null);
  const ratioBalanceContext = evidenceCurrent && calculation && engine.observation && !profile?.isElectric && !usesCvt(profile)
    ? JSON.stringify([carId, staticProfileJson, goal, season, engine.observation.id, identity.performanceIndex, identity.carClass]) : null;
  const ratioBalance = useRatioBalanceDraft(ratioBalanceContext);
  const evResult = evGearingEnabled ? evMeasurement.result : null;
  const inputSnapshot = useMemo(() => ({ carId, goal, season, profile,
    ...(ratioBalance.request ? { ratioBalance: ratioBalance.request } : {}),
    ...(usesCvt(profile) ? { transmissionModel: 'cvt-foundation/v1', ...(cvtEvidenceEnabled ? cvtEvidence.snapshot : { identity: cvtIdentity }) } : profile?.isElectric
      ? { powertrainModel: 'ev/v1', evMeasurement: evMeasurement.state, evResult, evEvidence: evGearingEnabled && evidenceCurrent && evMeasurement.evidenceId ? { kind: 'saved-ev', evidenceId: evMeasurement.evidenceId } : null,
        ...(evGearingEnabled && evMeasurement.confirmation ? { evEvidenceConfirmation: evMeasurement.confirmation } : {}) }
      : { powertrainModel: 'ice', engineObservation: evidenceCurrent && engine.observation ? { ...engine.observation, capture: undefined } : null, engineCalculation: calculation }),
  }), [carId, goal, season, profile, ratioBalance.request, engine.observation, calculation, evResult, evGearingEnabled, evMeasurement.evidenceId, evMeasurement.confirmation, evidenceCurrent, cvtEvidenceEnabled, cvtEvidence.snapshot.identity, cvtEvidence.snapshot.cvtConfiguration, cvtEvidence.snapshot.cvtEvidence]);
  const workflowEngine = calculation ? {
    engineMaxRpm: calculation.engineMaxRpm!, peakPowerRpm: calculation.peakPower!.rpm,
    peakTorqueRpm: calculation.peakTorque!.rpm, peakTorqueNm: calculation.peakTorque!.value,
  } : null;
  const workflowEv = evResult && profile?.evGearbox ? {
    setup: profile.evGearbox, measurements: evMeasurement.state.gears, candidateFinalDrive: evResult.finalDrive,
  } : null;
  const { result, status: calculationStatus } = useWorkflowCalculation(carId, goal, season, profile, workflowEngine, workflowEv, inputSnapshot);

  const [navigationSelection, setNavigationSelection] = useState<number | null>(null);
  const navigationLock = useRef<{ generation: number } | null>(null);
  const isNavigating = navigationSelection === selectionGeneration;
  const navigationKey = JSON.stringify([carId, selectionGeneration, identityGeneration, workflowStep, staticProfileJson, goal, season]);
  const latestNavigation = useRef({ key: navigationKey, result });
  latestNavigation.current = { key: navigationKey, result };

  const navigateToStep: TuneSessionValue['workflow']['navigateToStep'] = async (step, isCurrent = () => true, target, signal) => {
    const nextGoal = target?.goal ?? goal;
    const nextSeason = target?.season ?? season;
    const targetChanged = nextGoal !== goal || nextSeason !== season;
    if (step === workflowStep && !targetChanged) return;
    if (navigationLock.current?.generation === selectionGeneration) throw new Error('Saving changes. Wait before navigating.');
    if (step !== 1 && !targetChanged && (!result || !canOpenTuningStep(step, result.readiness))) {
      throw new Error('The requested tuning step is not available for this setup.');
    }
    const request = { generation: selectionGeneration };
    navigationLock.current = request;
    setNavigationSelection(selectionGeneration);
    try {
      let recalculated: typeof result = null;
      if (step > 1 && targetChanged) {
        const nextSnapshot = { ...inputSnapshot, goal: nextGoal, season: nextSeason, ratioBalance: undefined };
        recalculated = await requestWorkflowCalculation(workflowCalculationInput(nextGoal, nextSeason, profile, workflowEngine, workflowEv, nextSnapshot), signal);
        if (!canOpenTuningStep(step, recalculated.readiness)) {
          throw new Error('The requested tuning step is not available for this setup.');
        }
      }
      if (!isCurrent() || latestNavigation.current.key !== navigationKey) {
        throw new Error('Vehicle or setup changed. Review the current inputs and try again.');
      }
      if (selectedParams && (targetChanged || hasUnsavedParams || (workflowStep === 1 && step > 1))) {
        const next = { ...selectedParams, tuningTarget: { goal: nextGoal, season: nextSeason } };
        await saveCarParams(next);
        if (!isCurrent() || latestNavigation.current.key !== navigationKey) {
          throw new Error('Vehicle or setup changed. Review the current inputs and try again.');
        }
        setCarParams(next);
      }
      if (!isCurrent() || latestNavigation.current.key !== navigationKey) {
        throw new Error('Vehicle or setup changed. Review the current inputs and try again.');
      }
      const latestResult = recalculated ?? latestNavigation.current.result;
      if (step !== 1 && (!latestResult || !canOpenTuningStep(step, latestResult.readiness))) {
        throw new Error('The requested tuning step is not available for this setup.');
      }
      if (targetChanged) { setGoal(nextGoal); setSeason(nextSeason); }
      setReviewHistory(false);
      setWorkflowStep(step);
    } finally {
      if (navigationLock.current === request) {
        navigationLock.current = null;
        setNavigationSelection(null);
      }
    }
  };

  const value = useMemo<TuneSessionValue>(() => ({
    ratioBalance,
    result,
    calculationStatus,
    identity,
    identityGeneration,
    profile,
    workflow: {
      step: workflowStep,
      goal,
      season,
      reviewHistory,
      setStep: setWorkflowStep,
      navigateToStep,
      isNavigating,
      setGoal,
      setSeason,
      setReviewHistory,
    },
    engine,
    evMeasurement,
    cvtEvidence,
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
    navigateToStep,
    isNavigating,
    ratioBalance,
    result,
    calculationStatus,
    activeCapture,
    captureRuntime,
    clearCapture,
    collectMoreMeasurement,
    completeMeasurement,
    engine,
    evMeasurement,
    cvtEvidence,
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
    startCapture,
    stopCapture,
    workflowStep,
  ]);

  return <TuneSessionContext.Provider value={value}>{children}</TuneSessionContext.Provider>;
}

export function useOptionalTuneSession() {
  return useContext(TuneSessionContext);
}

export function useTuneSession(): TuneSessionValue {
  const value = useOptionalTuneSession();
  if (!value) throw new Error('useTuneSession must be rendered below TuneSessionProvider.');
  return value;
}

/** Keeps legacy callers working until the Coordinator mounts the Full-only provider. */
export function TuneSessionBoundary({ children }: { children: ReactNode }) {
  const existing = useContext(TuneSessionContext);
  return existing ? <>{children}</> : <TuneSessionProvider>{children}</TuneSessionProvider>;
}
