import { useEffect, useRef, useState } from 'react';
import { subscribeToDecodedTelemetry, useTelemetry } from '../../../hooks/useTelemetry';
import { useSettings } from '../../../context/SettingsContext';
import { createTuningMeasurement, advanceTuningMeasurement, getTuningMeasurementReadiness, retainReadyMeasurementSnapshot,
  TUNING_MEASUREMENT_MIN_ACCEPTED_MS, TUNING_MEASUREMENT_MIN_BINS,
  type TuningMeasurementState, type TuningMeasurementGuidance } from '../tuningMeasurement';

const guidanceText: Record<TuningMeasurementGuidance, string> = {
  collecting: 'Keep accelerating smoothly in one gear.',
  ready: 'Driving data is complete. You can stop the run and calculate when ready.',
  'telemetry-disconnected': 'Connect the game and enable Data Out to start receiving driving data.',
  'waiting-frame': 'Waiting for driving data from the game.',
  'car-mismatch': 'Return to the selected car before collecting data.',
  'identity-incomplete': 'Waiting for the game to report the car, class and performance index.',
  'identity-changed': 'The car or build changed. Restart collection with the current build.',
  'not-in-race': 'Return to driving in the game to continue collecting data.',
  'timestamp-stalled': 'Driving data stopped updating. Check Data Out and return to driving.',
  'timestamp-regressed': 'The driving session restarted. Restart collection to avoid mixing sessions.',
  'input-not-wide-open': 'On a clear straight, hold full throttle in one gear to record engine output.',
  'control-input-active': 'Release the brake, handbrake and clutch during the acceleration run.',
  'gear-not-forward': 'Select a forward gear and accelerate along a clear straight.',
  'gear-changing': 'Gear change detected. Hold the gear briefly while engine output settles.',
  'engine-rpm-invalid': 'Waiting for valid engine speed and engine limit from the game.',
  'output-unavailable': 'Waiting for valid power and torque telemetry.',
  'sampling-gap': 'Data was interrupted. Continue driving; the interruption is not counted.',
  'duration-insufficient': 'More clean acceleration data is needed. Repeat a smooth run if necessary.',
  'rpm-coverage-low': 'Low-engine-speed data is missing. Start the next run lower in the rev range.',
  'rpm-coverage-high': 'High-engine-speed data is missing. Hold the gear longer, approaching the engine limit.',
  'bins-insufficient': 'The middle of the rev range is incomplete. Accelerate smoothly through it.'
};

export function TuningMeasurementStep({ carId, enabled, onComplete }: {
  carId: string; enabled: boolean; onComplete: (data: TuningMeasurementState) => void;
}) {
  const { data, isConnected } = useTelemetry();
  const { t } = useSettings();
  const [state, setState] = useState(() => createTuningMeasurement(carId));
  const stateRef = useRef(state);
  const readySnapshotRef = useRef<TuningMeasurementState | undefined>(undefined);
  const [autoFinish, setAutoFinish] = useState(true);
  const [phase, setPhase] = useState<'collecting' | 'paused' | 'complete'>('collecting');
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    // Raw observations update stateRef at packet rate. React only receives a
    // display snapshot at the existing 5 Hz UI cadence.
    const timer = window.setInterval(() => {
      setNow(performance.now());
      setState(stateRef.current);
    }, 1000 / 5);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!enabled || phase !== 'collecting') return;
    return subscribeToDecodedTelemetry(frame => {
      const receivedAt = performance.now();
      stateRef.current = advanceTuningMeasurement(stateRef.current, frame, true, receivedAt);
      readySnapshotRef.current = retainReadyMeasurementSnapshot(readySnapshotRef.current, stateRef.current, receivedAt);
    });
  }, [enabled, phase]);
  useEffect(() => {
    if (!enabled || phase !== 'collecting' || isConnected) return;
    const next = advanceTuningMeasurement(stateRef.current, null, false, performance.now());
    stateRef.current = next;
    setState(next);
  }, [enabled, isConnected, phase]);
  const readiness = getTuningMeasurementReadiness(state, now);
  useEffect(() => {
    if (enabled && autoFinish && phase === 'collecting' && readiness.ready) setPhase('complete');
  }, [enabled, autoFinish, phase, readiness.ready]);
  // Completion is a recorded snapshot, so leaving the game to click Next does not lose it.
  // A newly reported car/build still invalidates it before it can be applied.
  const identityMatches = !data || data.IsRaceOn !== 1 || !state.identity || (
    String(data.CarOrdinal) === carId && data.CarClass === state.identity.carClass &&
    data.CarPerformanceIndex === state.identity.performanceIndex &&
    (state.engineMaxRpm === undefined || data.EngineMaxRpm === state.engineMaxRpm));
  const complete = enabled && phase === 'complete' && identityMatches;
  const canFinishExtra = enabled && !autoFinish && phase !== 'complete' && identityMatches
    && state.status !== 'blocked' && !['car-mismatch', 'identity-incomplete'].includes(state.guidance)
    && readySnapshotRef.current !== undefined;
  const guidance = !identityMatches ? 'identity-changed' : phase === 'complete' ? 'ready'
    : ['timestamp-stalled', 'rpm-coverage-low', 'rpm-coverage-high', 'bins-insufficient'].includes(readiness.guidance)
      ? readiness.guidance : state.guidance;
  const restart = () => {
    const next = createTuningMeasurement(carId);
    stateRef.current = next;
    setState(next);
    readySnapshotRef.current = undefined;
    setAutoFinish(true);
    setPhase('collecting');
  };
  return (
    <section className="glass-panel p-4" style={{ color: 'var(--text-primary)' }}>
      <h3 className="fs-5">{t('Prepare driving data before calculating')}</h3>
      <p>{t('Drive one or more smooth full-throttle runs on a clear straight, starting low in the rev range and holding the gear toward the engine limit. The app reads the numbers for you; no target speed or RPM entry is needed.')}</p>
      <p className="small" style={{ color: 'var(--text-secondary)' }}>{t('Collection uses the existing telemetry connection and keeps a small summary in this workflow. It does not enable global recording or save a recording file.')}</p>
      <div role="status" aria-live="polite" className="mb-3" style={{ minHeight: '3rem' }}>
        {!enabled ? t('Enter valid weight, front weight percentage and power in Step 1 first.') :
          phase === 'paused' ? t('Collection paused. Resume when you are ready to drive.') :
            canFinishExtra && (guidance === 'ready' || guidance === 'timestamp-stalled' || guidance === 'telemetry-disconnected')
              ? t('A usable result is retained. Continue driving to add data, or finish additional collection before calculating.')
              : t(guidanceText[guidance])}
      </div>
      <ul>
        <li>{t('Engine limit received')}: {state.engineMaxRpm ? `${Math.round(state.engineMaxRpm)} RPM` : t('Waiting')}</li>
        <li>{t('Clean acceleration data')}: {(state.acceptedMs / 1000).toFixed(1)} / {TUNING_MEASUREMENT_MIN_ACCEPTED_MS / 1000} {t('seconds')}</li>
        <li>{t('Low rev range')}: {t(readiness.lowRpmCoverage ? 'Collected' : 'Still needed')}</li>
        <li>{t('High rev range')}: {t(readiness.highRpmCoverage ? 'Collected' : 'Still needed')}</li>
        <li>{t('Rev range coverage')}: {readiness.binCount} / {TUNING_MEASUREMENT_MIN_BINS} {t('required sample bands')}</li>
      </ul>
      <p className="small" style={{ color: 'var(--text-secondary)' }}>{t('Engine-output collection checks throttle, controls, gear changes and rev-range coverage. Tire slip is recorded as context, not used as an engine-output rejection threshold. This does not validate road grip or gearing against vehicle speed.')}</p>
      <p className="small">{t('Meeting the collection requirements allows calculation; it does not prove that engine peaks are stable. You can keep the collected data and add another run.')}</p>
      {!autoFinish && phase !== 'complete' && <p role="status">{t('Additional collection is active. Finish when you have completed another run; the last usable result remains available after returning to the menu.')}</p>}
      {state.maxObservedNormalizedSlip !== undefined && <p className="small">
        {t('Maximum observed normalized tire slip')}: {state.maxObservedNormalizedSlip.toFixed(2)}
        {' · '}{t('Not a physical slip percentage')}
      </p>}
      <div className="d-flex gap-2 flex-wrap">
        {phase === 'complete' && <button type="button" className="btn btn-outline-secondary" disabled={!complete}
          onClick={() => {
            readySnapshotRef.current = state;
            const next = { ...stateRef.current, lastAcceptedTimestampMs: undefined };
            stateRef.current = next;
            setState(next);
            setAutoFinish(false);
            setPhase('collecting');
          }}>{t('Collect more without restarting')}</button>}
        {!autoFinish && phase !== 'complete' && <button type="button" className="btn btn-outline-primary" disabled={!canFinishExtra}
          onClick={() => {
            const snapshot = readySnapshotRef.current;
            if (!canFinishExtra || !snapshot || stateRef.current.status === 'blocked'
              || ['car-mismatch', 'identity-incomplete'].includes(stateRef.current.guidance)) return;
            stateRef.current = snapshot;
            setState(snapshot);
            setPhase('complete');
          }}>{t('Finish additional collection')}</button>}
        {phase !== 'complete' && <button type="button" className="btn btn-outline-secondary" disabled={!enabled}
          onClick={() => {
            const next = { ...stateRef.current, lastAcceptedTimestampMs: undefined };
            stateRef.current = next;
            setState(next);
            setPhase(phase === 'paused' ? 'collecting' : 'paused');
          }}>{t(phase === 'paused' ? 'Resume collection' : 'Pause collection')}</button>}
        <button type="button" className="btn btn-outline-secondary" disabled={!enabled} onClick={restart}>{t('Restart collection')}</button>
        <button type="button" className="btn btn-primary" disabled={!complete} onClick={() => { if (complete) onComplete(state); }}>{t('Next: calculate from collected data')}</button>
      </div>
    </section>
  );
}
