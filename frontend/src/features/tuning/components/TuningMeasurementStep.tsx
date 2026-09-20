import { useEffect, useState } from 'react';
import { captureSaveRequest } from '../captureDownload';
import { useFileSave } from '../../../hooks/useFileSave';
import { useSettings } from '../../../context/SettingsContext';
import { LiveDynoCurveCanvas } from './LiveDynoCurveCanvas';
import {
  getTuningMeasurementReadiness,
  TUNING_MEASUREMENT_MIN_ACCEPTED_MS,
  getTuningMeasurementMinBins,
  type TuningMeasurementGuidance,
} from '../tuningMeasurement';
import { canFinishAdditionalMeasurement } from '../tuneSessionController';
import { useTuneSession } from '../TuneSessionProvider';

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
  'bins-insufficient': 'The middle of the rev range is incomplete. Accelerate smoothly through it.',
};

export function TuningMeasurementStep({ carId, enabled }: { carId: string; enabled: boolean }) {
  const { t } = useSettings();
  const { save, isSaving } = useFileSave();
  const session = useTuneSession();
  const measurement = session.engineMeasurement;
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    session.engineMeasurement.ensureStarted(enabled);
  }, [enabled, session.engineMeasurement]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 1000 / 5);
    return () => window.clearInterval(timer);
  }, []);

  const state = measurement.state;
  const readiness = getTuningMeasurementReadiness(state, now);
  const complete = enabled && measurement.phase === 'complete' && state.status !== 'blocked' && state.carId === carId;
  const canFinishExtra = enabled
    && canFinishAdditionalMeasurement(measurement.phase, measurement.autoFinish, measurement.sampleCount,
      measurement.hasReadySnapshot, state.status)
    && !['car-mismatch', 'identity-incomplete'].includes(state.guidance);
  const guidance = measurement.phase === 'invalidated' ? 'identity-changed'
    : measurement.phase === 'complete' ? 'ready'
      : ['timestamp-stalled', 'rpm-coverage-low', 'rpm-coverage-high', 'bins-insufficient'].includes(readiness.guidance)
        ? readiness.guidance : state.guidance;

  return (
    <section className="glass-panel p-4" style={{ color: 'var(--text-primary)' }}>
      <h3 className="fs-5">{t('Prepare engine data for gearing')}</h3>
      <p>{t('Drive one or more smooth full-throttle runs on a clear straight, starting low in the rev range and holding the gear toward the engine limit. The app reads the numbers for you; no target speed or RPM entry is needed.')}</p>
      <p className="small" style={{ color: 'var(--text-secondary)' }}>{t('Decoded frames and the measured summary are saved together when you continue. Collection is limited to 30,000 frames. Collected frames remain available while you switch Tune steps; export them before restarting collection or closing the app.')}</p>
      <div role="status" aria-live="polite" className="mb-3" style={{ minHeight: '3rem' }}>
        {!enabled ? t('Enter valid weight, front weight percentage and power in Step 1 first.') :
          canFinishExtra ? t('A usable result is retained. Continue driving to add data, or finish additional collection before calculating.') :
            measurement.phase === 'paused' ? t('Collection paused. Resume when you are ready to drive.') :
              (guidance === 'ready' || guidance === 'timestamp-stalled' || guidance === 'telemetry-disconnected')
              ? t('A usable result is retained. Continue driving to add data, or finish additional collection before calculating.')
              : t(guidanceText[guidance])}
      </div>
      <div className="mb-3">
        <LiveDynoCurveCanvas state={state} height={180} />
      </div>
      <ul>
        <li>{t('Engine limit received')}: {state.engineMaxRpm ? `${Math.round(state.engineMaxRpm)} RPM` : t('Waiting')}
          {state.effectiveRedline ? ` · ${t('Effective limit')}: ${Math.round(state.effectiveRedline)} RPM` : ''}
        </li>
        <li>{t('Clean acceleration data')}: {(state.acceptedMs / 1000).toFixed(1)} / {TUNING_MEASUREMENT_MIN_ACCEPTED_MS / 1000} {t('seconds')}</li>
        <li>{t('Low rev range')}: {t(readiness.lowRpmCoverage ? 'Collected' : 'Still needed')}</li>
        <li>{t('High rev range')}: {t(readiness.highRpmCoverage ? 'Collected' : 'Still needed')}
          {readiness.cutoffDetected ? ` (${t('Cutoff detected')})` : readiness.powerDropoffDetected ? ` (${t('Powerband roll-off')})` : ''}
        </li>
        <li>{t('Rev range coverage')}: {readiness.binCount} / {getTuningMeasurementMinBins(state)} {t('required sample bands')}</li>
        {state.powerbandStartRpm && state.powerbandEndRpm && (
          <li>{t('Observed powerband')}: {Math.round(state.powerbandStartRpm)} - {Math.round(state.powerbandEndRpm)} RPM</li>
        )}
      </ul>
      <p className="small" style={{ color: 'var(--text-secondary)' }}>{t('Engine-output collection checks throttle, controls, gear changes and rev-range coverage. Tire slip is recorded as context, not used as an engine-output rejection threshold. This does not validate road grip or gearing against vehicle speed.')}</p>
      <p className="small">{t('Meeting the collection requirements allows calculation; it does not prove that engine peaks are stable. You can keep the collected data and add another run.')}</p>
      {!measurement.autoFinish && measurement.phase !== 'complete' && <p role="status">{t('Additional collection is active. Finish when you have completed another run; the last usable result remains available after returning to the menu.')}</p>}
      {state.maxObservedNormalizedSlip !== undefined && <p className="small">
        {t('Maximum observed normalized tire slip')}: {state.maxObservedNormalizedSlip.toFixed(2)}
        {' · '}{t('Not a physical slip percentage')}
      </p>}
      <div className="d-flex gap-2 flex-wrap">
        {measurement.phase === 'complete' && <button type="button" className="btn btn-outline-secondary" disabled={!complete}
          onClick={measurement.collectMore}>{t('Collect more without restarting')}</button>}
        {!measurement.autoFinish && measurement.phase !== 'complete' && <button type="button" className="btn btn-outline-primary" disabled={!canFinishExtra}
          onClick={measurement.finishAdditional}>{t('Finish additional collection')}</button>}
        {measurement.phase !== 'complete' && measurement.phase !== 'invalidated' && <button type="button" className="btn btn-outline-secondary" disabled={!enabled}
          onClick={measurement.pauseOrResume}>{t(measurement.phase === 'paused' ? 'Resume collection' : 'Pause collection')}</button>}
        <button type="button" className="btn btn-outline-secondary" disabled={!enabled} onClick={() => measurement.restart(enabled)}>{t('Restart collection')}</button>
        <button type="button" className="btn btn-outline-secondary" disabled={!measurement.sampleCount || isSaving}
          onClick={() => void save(captureSaveRequest(measurement.captureSnapshot(), 'engine-attempt.json'))}>{t('Export collected frames')}</button>
        <button type="button" className="btn btn-primary" disabled={!complete || session.engine.pendingSave}
          onClick={measurement.complete}>{t(session.engine.pendingSave ? 'Saving engine data…' : 'Next: calculate from collected data')}</button>
      </div>
    </section>
  );
}
