import { usesCvt } from '../../domain/tuning/transmission';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import { subscribeToDecodedTelemetry, type TelemetryData } from '../../hooks/useTelemetry';
import { createEvMeasurement, evIdentity, sameEvIdentity, EV_MAX_FRAMES } from '../../domain/tuning/ev/sessionIdentity';
import { backendFetch } from '../../services/backend';
import { evDependencyKey, evMeasurementMatchesLive, evPowertrainContext } from './evSession';
import type { EvEvidenceConfirmation, EvGearingResult, EvIdentity, EvMeasurement, EvPowertrainContext, EvQualificationDiagnostic } from '../../domain/tuning/ev/types';

type Phase = 'idle' | 'collecting' | 'paused' | 'complete' | 'invalidated';
interface Runtime { calculationError?: string; transportError?: boolean; evidenceId?: string; evidenceLifetime?: number; readyGears?: number[]; diagnostics?: EvQualificationDiagnostic[]; warnings?: string[]; confirmation?: EvEvidenceConfirmation; pendingIdentity?: EvIdentity; source?: 'saved' | 'selecting'; sourcePowertrain?: EvPowertrainContext | null; sourceRecording?: unknown; key: string; phase: Phase; state: EvMeasurement; result: EvGearingResult | null }

/** Mounted at TuneSession scope: navigating between steps never unmounts a recording. */
export function useEvMeasurementSession(carId: string, profile: CarParams | null, live: TelemetryData | null, setupContext = '', connected = true, allowLiveCollection = true) {
  // Setup changes invalidate async display state even when the measured powertrain
  // dependency key is unchanged. EV qualification/projection remains Rust-owned.
  const key = JSON.stringify([evDependencyKey(carId, profile), setupContext]);
  const initial = (): Runtime => ({ key, phase: 'idle', state: createEvMeasurement(carId), result: null });
  const ref = useRef<Runtime>(initial());
  const [runtime, setRuntime] = useState(ref.current);
  const frames = useRef<Partial<TelemetryData>[]>([]);
  const cursor = useRef(0);
  const calculationSequence = useRef(0);
  const keyRef = useRef(key); keyRef.current = key;
  const enabled = useRef(false); enabled.current = connected && allowLiveCollection && profile?.isElectric === true && !usesCvt(profile);
  const lastPublish = useRef(0);
  const liveKey = JSON.stringify([connected, connected && live ? evIdentity(live) ?? null : null]);
  const previousLiveKey = useRef(liveKey);
  const publish = useCallback((force = false) => {
    const now = performance.now();
    if (force || now - lastPublish.current >= 200) {
      lastPublish.current = now;
      setRuntime({ ...ref.current });
    }
  }, []);
  useEffect(() => {
    calculationSequence.current++;
    ref.current = initial();
    frames.current = [];
    cursor.current = 0;
    publish(true);
  }, [key, publish]);
  useEffect(() => {
    if (previousLiveKey.current !== liveKey && ref.current.source) {
      calculationSequence.current++;
      ref.current = initial(); frames.current = []; cursor.current = 0; publish(true);
    }
    previousLiveKey.current = liveKey;
    if (!evMeasurementMatchesLive(ref.current.state, live)) {
      ref.current = { ...ref.current, phase: 'invalidated', result: null, evidenceId: undefined, confirmation: undefined,
        state: { ...ref.current.state, status: 'blocked', guidance: 'identity-changed' } };
      publish(true);
    }
  }, [live, liveKey, publish]);
  useEffect(() => subscribeToDecodedTelemetry(frame => {
    const r = ref.current;
    const identity = evIdentity(frame);
    const expected = r.confirmation?.identity ?? r.pendingIdentity;
    if (expected && identity && !sameEvIdentity(expected, identity)) {
      calculationSequence.current++; ref.current = { key: keyRef.current, phase: 'idle', state: createEvMeasurement(r.state.carId), result: null };
      frames.current = []; cursor.current = 0; publish(true); return;
    }
    if (!enabled.current || ref.current.key !== keyRef.current || ref.current.phase !== 'collecting') return;
    if (frames.current.length >= EV_MAX_FRAMES) {
      ref.current = { ...ref.current, phase: 'paused' };
      publish(true);
      return;
    }
    const channels = ['TimestampMS', 'IsRaceOn', 'CarOrdinal', 'CarClass', 'CarPerformanceIndex', 'EngineMaxRpm', 'CurrentEngineRpm', 'Gear', 'AccelInput', 'BrakeInput', 'ClutchInput', 'HandBrakeInput', 'SteerInput', 'PowerWatts', 'TorqueNewtons', 'WheelRotationSpeed', 'TireSlipRatio', 'SpeedMetersPerSecond'] as const;
    frames.current.push(Object.fromEntries(channels.map(key => [key, frame[key]])) as Partial<TelemetryData>);
    publish();
  }), [publish]);

  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const tick = async () => {
      const r = ref.current; const end = frames.current.length;
      if ((r.phase === 'collecting' || r.phase === 'paused') && cursor.current < end) {
        try {
          const response = await backendFetch('/api/tuning/ev-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ schemaVersion: 'ev-batch/v1', state: r.state, frames: frames.current.slice(cursor.current, end) }) });
          if (!response.ok) throw new Error();
          const result = await response.json() as { state: EvMeasurement; readyGears: number[]; diagnostics: EvQualificationDiagnostic[]; warnings: string[] };
          if (!stopped && ref.current === r && r.key === keyRef.current) {
            cursor.current = end;
            ref.current = { ...r, ...result, transportError: false, phase: result.state.status === 'blocked' ? 'invalidated' : r.phase,
              ...(result.state.status === 'blocked' ? { evidenceId: undefined, result: null, confirmation: undefined } : {}) };
            publish(true);
          }
        } catch {
          if (!stopped && ref.current === r && r.key === keyRef.current) {
            ref.current = { ...r, transportError: true }; publish(true);
          }
        }
      }
      if (!stopped) timer = setTimeout(tick, 250);
    };
    void tick(); return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [publish]);

  const restart = () => {
    if (!enabled.current || key !== keyRef.current || (usesCvt(profile) || !profile?.isElectric) || !profile.evGearbox?.allForwardGearsConfirmed) return;
    calculationSequence.current++;
    ref.current = { key, phase: 'collecting', state: createEvMeasurement(carId), result: null };
    frames.current = [];
    cursor.current = 0;
    publish(true);
  };
  const calculate = async (candidateFinalDrive: number | null = profile?.evGearbox?.finalDrive ?? null) => {
    const r = ref.current;
    if (!enabled.current || (usesCvt(profile) || !profile?.isElectric) || !profile.evGearbox || r.key !== key || r.phase === 'collecting' ||
      r.phase === 'invalidated' || cursor.current !== frames.current.length || r.state.status === 'blocked' || !evMeasurementMatchesLive(r.state, live)) return;
    const token = ++calculationSequence.current;
    try {
      let evidenceId = r.evidenceId;
      let measuredState = r.state;
      if (!evidenceId) {
        const evidenceResponse = await backendFetch('/api/tuning/ev-evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'ev-capture', carId, setup: profile.evGearbox, powertrain: evPowertrainContext(profile), recording: { source: 'decoded-websocket' }, frames: frames.current }) });
        if (!evidenceResponse.ok) throw new Error('EV evidence could not be qualified');
        const evidence = await evidenceResponse.json() as { evidenceId: string; state: EvMeasurement };
        evidenceId = evidence.evidenceId; measuredState = evidence.state;
      }
      const identity = connected && live ? evIdentity(live) : measuredState.identity;
      if (!identity) throw new Error('Current EV identity unavailable');
      const confirmation: EvEvidenceConfirmation = r.confirmation ?? { schemaVersion: 'ev-context/v1', carId,
        identity, setup: profile.evGearbox, powertrain: evPowertrainContext(profile) };
      const response = await backendFetch('/api/tuning/ev-gearing', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, setup: profile.evGearbox, candidateFinalDrive, confirmation }) });
      if (!response.ok) throw new Error('EV calculation unavailable');
      const result = await response.json() as EvGearingResult | null;
      if (token !== calculationSequence.current || key !== keyRef.current || ref.current !== r) return;
      ref.current = { ...r, calculationError: undefined, evidenceId, evidenceLifetime: r.evidenceLifetime ?? token,
        confirmation, state: measuredState, result, phase: result ? 'complete' : r.phase };
      publish(true);
    } catch {
      if (token === calculationSequence.current && key === keyRef.current && ref.current === r) {
        ref.current = { ...r, result: null, calculationError: 'EV calculation is unavailable or the captured evidence did not qualify. Try again.' }; publish(true);
      }
    }
  };
  const selectEvidence = async (evidenceId: string, confirmation: EvEvidenceConfirmation) => {
    const r = ref.current;
    if (!enabled.current || r.key !== key || r.phase === 'collecting') return;
    const token = ++calculationSequence.current;
    // Selection starts a new evidence lifetime immediately, including A→B→A.
    ref.current = { ...initial(), source: 'selecting', pendingIdentity: confirmation.identity }; frames.current = []; cursor.current = 0; publish(true);
    const pending = ref.current;
    try {
      const response = await backendFetch('/api/tuning/ev-selection', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, confirmation }) });
      if (!response.ok) throw new Error();
      const saved = await response.json() as { evidenceId: string; state: EvMeasurement; readyGears: number[]; diagnostics: EvQualificationDiagnostic[]; capture: { frames: Partial<TelemetryData>[]; powertrain?: EvPowertrainContext | null; recording?: unknown } };
      if (token !== calculationSequence.current || key !== keyRef.current || ref.current !== pending) return;
      frames.current = saved.capture.frames; cursor.current = frames.current.length;
      ref.current = { ...pending, state: saved.state, evidenceId: saved.evidenceId, readyGears: saved.readyGears, diagnostics: saved.diagnostics,
        source: 'saved', sourcePowertrain: saved.capture.powertrain ?? null, sourceRecording: saved.capture.recording ?? null, evidenceLifetime: token, confirmation, phase: 'paused' };
      publish(true);
    } catch {
      if (token === calculationSequence.current && key === keyRef.current && ref.current === pending) {
        ref.current = { ...pending, calculationError: 'Saved EV evidence is unavailable or does not match the confirmed current configuration.' }; publish(true);
      }
    }
  };
  // Synchronous gate prevents a stale result rendering before reset effects run.
  const current = runtime.key === key && !usesCvt(profile) && profile?.isElectric && evMeasurementMatchesLive(runtime.state, live)
    ? runtime : initial();
  return {
    ...current,
    sampleCount: frames.current.length,
    pendingSamples: frames.current.length - cursor.current,
    restart, calculate, selectEvidence,
    clearEvidence: () => { calculationSequence.current++; ref.current = initial(); frames.current = []; cursor.current = 0; publish(true); },
    pauseOrResume: () => {
      if (ref.current.source === 'saved' || (ref.current.phase !== 'collecting' && ref.current.phase !== 'paused')) return;
      ref.current = { ...ref.current, phase: ref.current.phase === 'collecting' ? 'paused' : 'collecting',
        result: null, evidenceId: undefined, state: { ...ref.current.state, lastAcceptedTimestamp: undefined } };
      publish(true);
    },
    snapshot: () => ({
      schema: 'ev-capture/v1' as const, carId, exportedAt: new Date().toISOString(), dependencyKey: ref.current.key,
      powertrain: ref.current.source === 'saved' ? ref.current.sourcePowertrain : evPowertrainContext(profile),
      setup: profile?.evGearbox, measurement: ref.current.state, result: ref.current.result,
      recording: ref.current.source ? ref.current.sourceRecording ?? null : { source: 'decoded-websocket', phase: ref.current.phase }, frames: [...frames.current],
    }),
  };
}
