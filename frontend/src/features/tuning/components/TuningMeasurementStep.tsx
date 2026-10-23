import { useEffect } from 'react';
import { captureSaveRequest } from '../captureDownload';
import { useFileSave } from '../../../hooks/useFileSave';
import { useSettings } from '../../../context/SettingsContext';
import { LiveDynoCurveCanvas } from './LiveDynoCurveCanvas';
import { canFinishAdditionalMeasurement } from '../tuneSessionController';
import { useTuneSession } from '../TuneSessionProvider';
import { guidanceText } from '../measurementGuidance';

export function TuningMeasurementStep({ carId, enabled, offline = false }: { carId: string; enabled: boolean; offline?: boolean }) {
  const { t } = useSettings();
  const { save, isSaving } = useFileSave();
  const session = useTuneSession();
  const measurement = session.engineMeasurement;

  useEffect(() => {
    session.engineMeasurement.ensureStarted(enabled);
  }, [enabled, session.engineMeasurement]);

  const state = measurement.state;
  const readiness = measurement.readiness;
  const complete = enabled && measurement.phase === 'complete' && state.status !== 'blocked' && state.carId === carId;
  const canFinishExtra = enabled
    && canFinishAdditionalMeasurement(measurement.phase, measurement.autoFinish, measurement.sampleCount,
      measurement.hasReadySnapshot, state.status)
    && !['car-mismatch', 'identity-incomplete'].includes(state.guidance);
  const guidance = measurement.phase === 'invalidated' ? 'identity-changed'
    : measurement.phase === 'complete' ? 'ready'
      : ['timestamp-stalled', 'rpm-coverage-low', 'rpm-coverage-high', 'bins-insufficient'].includes(readiness?.guidance ?? '')
        ? readiness!.guidance : state.guidance;

  return (
    <section className="glass-panel p-4" style={{ color: 'var(--text-primary)' }}>
      <h3 className="fs-5">{t('Prepare engine data for gearing')}</h3>
      <div role="status" aria-live="polite" className="mb-3" style={{ minHeight: '3rem' }}>
        {offline ? t('Offline selection does not supply live telemetry. Follow Data Out to collect new data.') : !enabled ? t('Enter valid weight, front weight percentage and power in Step 1 first.') :
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
        <li>{t('Clean acceleration data')}: {(state.acceptedMs / 1000).toFixed(1)} / {readiness ? readiness.minimumAcceptedMs / 1000 : '—'} {t('seconds')}</li>
        <li>{t('Low rev range')}: {t(readiness?.lowRpmCoverage ? 'Collected' : 'Still needed')}</li>
        <li>{t('High rev range')}: {t(readiness?.highRpmCoverage ? 'Collected' : 'Still needed')}
          {readiness?.cutoffDetected ? ` (${t('Cutoff detected')})` : readiness?.powerDropoffDetected ? ` (${t('Powerband roll-off')})` : ''}
        </li>
        <li>{t('Rev range coverage')}: {readiness?.binCount} / {readiness?.minimumBins ?? '—'} {t('required sample bands')}</li>
        {state.powerbandStartRpm && state.powerbandEndRpm && (
          <li>{t('Observed powerband')}: {Math.round(state.powerbandStartRpm)} - {Math.round(state.powerbandEndRpm)} RPM</li>
        )}
      </ul>
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
