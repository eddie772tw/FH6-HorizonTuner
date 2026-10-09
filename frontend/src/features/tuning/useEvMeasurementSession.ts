import { useCallback, useEffect, useRef, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import { subscribeToDecodedTelemetry, type TelemetryData } from '../../hooks/useTelemetry';
import { createEvMeasurement, EV_MAX_FRAMES } from '../../domain/tuning/ev/sessionIdentity';
import { backendFetch } from '../../services/backend';
import { evDependencyKey, evMeasurementMatchesLive } from './evSession';
import type { EvGearingResult, EvMeasurement } from '../../domain/tuning/ev/types';

type Phase = 'idle' | 'collecting' | 'paused' | 'complete' | 'invalidated';
interface Runtime { calculationError?: string; evidenceId?: string; readyGears?: number[]; key: string; phase: Phase; state: EvMeasurement; result: EvGearingResult | null }

/** Mounted at TuneSession scope: navigating between steps never unmounts a recording. */
export function useEvMeasurementSession(carId: string, profile: CarParams | null, live: TelemetryData | null, setupContext = '') {
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
  const enabled = useRef(false); enabled.current = profile?.isElectric === true;
  const lastPublish = useRef(0);
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
    if (!evMeasurementMatchesLive(ref.current.state, live)) {
      ref.current = { ...ref.current, phase: 'invalidated', result: null,
        state: { ...ref.current.state, status: 'blocked', guidance: 'identity-changed' } };
      publish(true);
    }
  }, [live, publish]);
  useEffect(() => subscribeToDecodedTelemetry(frame => {
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
          const result = await response.json() as { state: EvMeasurement; readyGears: number[] };
          if (!stopped && ref.current === r && r.key === keyRef.current) {
            cursor.current = end;
            ref.current = { ...r, ...result, phase: result.state.status === 'blocked' ? 'invalidated' : r.phase };
            publish(true);
          }
        } catch { /* Retain pending frames for backend recovery. */ }
      }
      if (!stopped) timer = setTimeout(tick, 250);
    };
    void tick(); return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [publish]);

  const restart = () => {
    if (key !== keyRef.current || !profile?.isElectric || !profile.evGearbox?.allForwardGearsConfirmed) return;
    calculationSequence.current++;
    ref.current = { key, phase: 'collecting', state: createEvMeasurement(carId), result: null };
    frames.current = [];
    cursor.current = 0;
    publish(true);
  };
  const calculate = async (candidateFinalDrive: number | null = profile?.evGearbox?.finalDrive ?? null) => {
    const r = ref.current;
    if (!profile?.isElectric || !profile.evGearbox || r.key !== key || r.phase === 'collecting' ||
      r.phase === 'invalidated' || cursor.current !== frames.current.length || r.state.status === 'blocked' || !evMeasurementMatchesLive(r.state, live)) return;
    const token = ++calculationSequence.current;
    try {
      let evidenceId = r.evidenceId;
      let measuredState = r.state;
      if (!evidenceId) {
        const evidenceResponse = await backendFetch('/api/tuning/ev-evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'ev-capture', carId, setup: profile.evGearbox, frames: frames.current }) });
        if (!evidenceResponse.ok) throw new Error('EV evidence could not be qualified');
        const evidence = await evidenceResponse.json() as { evidenceId: string; state: EvMeasurement };
        evidenceId = evidence.evidenceId; measuredState = evidence.state;
      }
      const response = await backendFetch('/api/tuning/ev-gearing', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evidenceId, setup: profile.evGearbox, candidateFinalDrive }) });
      if (!response.ok) throw new Error('EV calculation unavailable');
      const result = await response.json() as EvGearingResult | null;
      if (token !== calculationSequence.current || key !== keyRef.current || ref.current !== r) return;
      ref.current = { ...r, calculationError: undefined, evidenceId, state: measuredState, result, phase: result ? 'complete' : r.phase };
      publish(true);
    } catch {
      if (token === calculationSequence.current && key === keyRef.current && ref.current === r) {
        ref.current = { ...r, result: null, calculationError: 'EV calculation is unavailable or the captured evidence did not qualify. Try again.' }; publish(true);
      }
    }
  };
  // Synchronous gate prevents a stale result rendering before reset effects run.
  const current = runtime.key === key && profile?.isElectric && evMeasurementMatchesLive(runtime.state, live)
    ? runtime : initial();
  return {
    ...current,
    sampleCount: frames.current.length,
    pendingSamples: frames.current.length - cursor.current,
    restart, calculate,
    pauseOrResume: () => {
      if (ref.current.phase !== 'collecting' && ref.current.phase !== 'paused') return;
      ref.current = { ...ref.current, phase: ref.current.phase === 'collecting' ? 'paused' : 'collecting',
        result: null, evidenceId: undefined, state: { ...ref.current.state, lastAcceptedTimestamp: undefined } };
      publish(true);
    },
    snapshot: () => ({
      schema: 'ev-capture/v1' as const, capturedAt: new Date().toISOString(), dependencyKey: ref.current.key,
      setup: profile?.evGearbox, measurement: ref.current.state, result: ref.current.result,
      recording: { source: 'decoded-websocket', phase: ref.current.phase }, frames: [...frames.current],
    }),
  };
}
