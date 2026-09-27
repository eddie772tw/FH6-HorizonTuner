import { useCallback, useEffect, useRef, useState } from 'react';
import type { CarParams } from '../../context/CarParamsContext';
import { subscribeToDecodedTelemetry, type TelemetryData } from '../../hooks/useTelemetry';
import { advanceEvMeasurement, createEvMeasurement, EV_MAX_FRAMES } from '../../domain/tuning/ev/measurement';
import { calculateEvGearing } from '../../domain/tuning/ev/solver';
import { evDependencyKey, evMeasurementMatchesLive } from './evSession';
import type { EvGearingResult, EvMeasurement } from '../../domain/tuning/ev/types';

type Phase = 'idle' | 'collecting' | 'paused' | 'complete' | 'invalidated';
interface Runtime { key: string; phase: Phase; state: EvMeasurement; result: EvGearingResult | null }

/** Mounted at TuneSession scope: navigating between steps never unmounts a recording. */
export function useEvMeasurementSession(carId: string, profile: CarParams | null, live: TelemetryData | null) {
  const key = evDependencyKey(carId, profile);
  const initial = (): Runtime => ({ key, phase: 'idle', state: createEvMeasurement(carId), result: null });
  const ref = useRef<Runtime>(initial());
  const [runtime, setRuntime] = useState(ref.current);
  const frames = useRef<TelemetryData[]>([]);
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
    ref.current = initial();
    frames.current = [];
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
    frames.current.push(frame);
    const state = advanceEvMeasurement(ref.current.state, frame);
    ref.current = { ...ref.current, state, phase: state.status === 'blocked' ? 'invalidated' : 'collecting' };
    publish(state.status === 'blocked');
  }), [publish]);

  const restart = () => {
    if (key !== keyRef.current || !profile?.isElectric || !profile.evGearbox?.allForwardGearsConfirmed) return;
    ref.current = { key, phase: 'collecting', state: createEvMeasurement(carId), result: null };
    frames.current = [];
    publish(true);
  };
  const calculate = (candidateFinalDrive: number | null = profile?.evGearbox?.finalDrive ?? null) => {
    const r = ref.current;
    if (!profile?.isElectric || !profile.evGearbox || r.key !== key || r.phase === 'collecting' ||
      r.phase === 'invalidated' || r.state.status === 'blocked' || !evMeasurementMatchesLive(r.state, live)) return;
    const result = calculateEvGearing({ setup: profile.evGearbox, measurements: r.state.gears, candidateFinalDrive });
    ref.current = { ...r, result, phase: result ? 'complete' : r.phase };
    publish(true);
  };
  // Synchronous gate prevents a stale result rendering before reset effects run.
  const current = runtime.key === key && profile?.isElectric && evMeasurementMatchesLive(runtime.state, live)
    ? runtime : initial();
  return {
    ...current,
    sampleCount: frames.current.length,
    restart, calculate,
    pauseOrResume: () => {
      if (ref.current.phase !== 'collecting' && ref.current.phase !== 'paused') return;
      ref.current = { ...ref.current, phase: ref.current.phase === 'collecting' ? 'paused' : 'collecting',
        result: null, state: { ...ref.current.state, lastAcceptedTimestamp: undefined } };
      publish(true);
    },
    snapshot: () => ({
      schema: 'ev-capture/v1' as const, capturedAt: new Date().toISOString(), dependencyKey: ref.current.key,
      setup: profile?.evGearbox, measurement: ref.current.state, result: ref.current.result,
      recording: { source: 'decoded-websocket', phase: ref.current.phase }, frames: [...frames.current],
    }),
  };
}
