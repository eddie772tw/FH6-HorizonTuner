import { useEffect, useState } from 'react';
import { useCarParams } from '../../../context/CarParamsContext';
import { useSettings } from '../../../context/SettingsContext';
import { useTelemetry } from '../../../hooks/useTelemetry';
import { useFileSave } from '../../../hooks/useFileSave';
import { useLocalCalculation } from '../useLocalCalculation';
import { backendFetch } from '../../../services/backend';
import type { EvGearingResult } from '../../../domain/tuning/ev/types';
import { useTuneSession } from '../TuneSessionProvider';
import { captureSaveRequest } from '../captureDownload';
import { EvGearboxSetup } from './EvGearboxSetup';

export function EvPowertrainStep({ enabled }: { enabled: boolean }) {
  const { t } = useSettings();
  const { carId, carParams, setCarParams, saveCarParams } = useCarParams();
  const { isConnected } = useTelemetry();
  const session = useTuneSession();
  const m = session.evMeasurement;
  const setup = session.profile?.evGearbox;
  const { save, isSaving } = useFileSave();
  const [candidate, setCandidate] = useState<number | null>(setup?.finalDrive ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setCandidate(setup?.finalDrive ?? null), [m.key]);
  const setupValidation = useLocalCalculation<{ ready: boolean }>('/api/tuning/ev-profile', { isElectric: true, evGearbox: setup });
  const setupValid = setupValidation?.ready === true;
  const previewKey = JSON.stringify([setup, candidate, m.state, m.pendingSamples]);
  const [previewResult, setPreviewResult] = useState<{ key: string; result: EvGearingResult | null } | null>(null);
  useEffect(() => {
    if (!setup || m.state.status === 'blocked' || m.phase === 'collecting' || m.pendingSamples) return;
    const controller = new AbortController(); let active = true;
    void backendFetch('/api/tuning/ev-gearing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ setup, candidateFinalDrive: candidate, measurements: m.state.gears })
    }).then(async response => { if (!response.ok) throw new Error(); const result = await response.json() as EvGearingResult | null; if (active) setPreviewResult({ key: previewKey, result }); }).catch(() => {});
    return () => { active = false; controller.abort(); };
  }, [previewKey, m.phase]);
  const preview = previewResult?.key === previewKey ? previewResult.result : null;
  const recording = m.phase === 'collecting';
  const result = m.result;
  const start = async () => {
    setSaving(true); setError('');
    try { await saveCarParams(); m.restart(); }
    catch { setError('EV setup could not be saved. Try again.'); }
    finally { setSaving(false); }
  };
  return <section className="d-flex flex-column gap-3">
    <div className="workspace-section">
      <h3 className="workspace-section-heading">{t('EV measurement & gearing')} <span className="badge text-bg-secondary">{t('Foundation model')}</span></h3>
      <p>{t('Record a separate full-throttle run in each fixed gear, from low RPM toward the motor limit. Do not shift during a run. Pause when finished, then calculate.')}</p>
      <p className="small text-body-secondary mb-0">{t('This model measures power bands and RPM-to-speed relationships. It does not yet optimize launch grip, shift points or lap time.')}</p>
    </div>
    <div className="glass-panel p-3">
      <EvGearboxSetup key={carId} value={setup} disabled={recording || saving} t={t}
        onChange={evGearbox => carParams && setCarParams({ ...carParams, evGearbox })} />
    </div>
    <div className="glass-panel p-3">
      <div role="status" aria-live="polite" style={{ minHeight: '3rem' }}>
        {error ? t(error) : m.phase === 'invalidated' ? t('The vehicle, build or driving session changed. Restart EV collection.') :
          !isConnected ? t('Connect the game and enable Data Out to start receiving driving data.') :
          !setupValid ? t('Confirm the current EV gearbox before recording.') :
          t(recording ? 'EV collection is active. You can switch to the game now.' : result ? 'EV calculation is ready.' : 'Pause collection after all gear runs, then calculate the EV baseline.')}
        <div className="small text-body-secondary">{t('Collected frames')}: {m.sampleCount} / 30000 · {t(m.phase)}</div>
      </div>
      <div className="table-responsive">
        <table className="table table-sm">
          <thead><tr><th>{t('Gear')}</th><th>{t('Clean acceleration data')}</th><th>RPM</th><th>{t('Zero-output samples')}</th><th>{t('Measurement status')}</th></tr></thead>
          <tbody>{(setup?.gearRatios ?? []).map((_, i) => {
            const g = m.state.gears.find(v => v.gear === i + 1);
            return <tr key={i}><th>{i + 1}</th><td>{((g?.acceptedMs ?? 0) / 1000).toFixed(1)} s</td>
              <td>{g ? Math.round(g.lowestRpm) + '–' + Math.round(g.highestRpm) : '—'}</td>
              <td>{g?.zeroOutputSamples ?? 0}</td><td>{t(g && m.readyGears?.includes(g.gear) ? 'Collected' : 'Still needed')}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <p className="small text-body-secondary">{t('Each gear needs 3 seconds of output data, low and high RPM coverage, and a stable low-slip straight-line speed relationship. Zero idle RPM is valid. Constant positive power is not a limiter signal.')}</p>
      <div className="d-flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!enabled || !setupValid || recording || saving}
          onClick={() => void start()}>{t(m.sampleCount ? 'Restart EV collection' : 'Start EV collection')}</button>
        <button className="btn btn-outline-secondary" disabled={!['collecting', 'paused'].includes(m.phase)}
          onClick={m.pauseOrResume}>{t(recording ? 'Pause collection' : 'Resume collection')}</button>
        <button className="btn btn-outline-secondary" disabled={!m.sampleCount || isSaving}
          onClick={() => void save(captureSaveRequest(m.snapshot(), 'ev-measurement.json'))}>{t('Export EV data')}</button>
      </div>
      <p className="small text-body-secondary mt-2 mb-0">{t('EV scans stay available while switching steps during this app session. Export before restarting collection or closing the app.')}</p>
    </div>
    <div className="glass-panel p-3">
      <label className="form-label" htmlFor="ev-candidate-fd">{t('Candidate final drive')}</label>
      <input id="ev-candidate-fd" type="number" className="form-control mb-2" min="0.01" max="20" step="0.01"
        disabled={!setup?.finalDriveAdjustable || setup.finalDrive === null} placeholder={t('Unknown / not shown')}
        value={candidate ?? ''} onChange={e => setCandidate(e.target.value === '' ? null : Number(e.target.value))} />
      <p className="small text-body-secondary">{t('A locked or unknown final drive still allows a measured baseline. A ratio preview requires a known, adjustable final drive. Locked gears are excluded from settings to apply.')}</p>
      <p className="small text-body-secondary">{t('Keep the measured final drive for a baseline, or enter a candidate to preview the same RPM envelope at a different ratio. Confirm slider limits in game.')}</p>
      <button className="btn btn-primary" disabled={!enabled || recording || m.phase === 'invalidated' || !preview}
        onClick={() => m.calculate(candidate)}>{t('Calculate EV model')}</button>
      {!preview && <p className="small text-body-secondary mt-2">{t('Calculation needs every confirmed gear, enough RPM coverage and a stable speed relationship consistent with the entered ratios.')}</p>}
    </div>
    {result && <div className="glass-panel p-3">
      <h4 className="fs-6">{t(result.basis === 'measured-baseline' ? 'Measured EV baseline' : 'EV ratio preview')}</h4>
      <p>{t('Final Drive')}: {result.finalDrive?.toFixed(2) ?? t('Unknown / not shown')} · {t('Gear Ratios')}: {result.gears.map(v => v?.toFixed(2) ?? t('Unknown / not shown')).join(' / ')}</p>
      <div className="table-responsive"><table className="table table-sm">
        <thead><tr><th>{t('Gear')}</th><th>{t('Observed powerband')}</th><th>{t('Peak power')}</th><th>{t('RPM boundary')}</th><th>{t('Boundary speed')}</th></tr></thead>
        <tbody>{result.envelopes.map(e => <tr key={e.gear}><th>{e.gear}</th>
          <td>{Math.round(e.powerBandStartRpm)}–{Math.round(e.powerBandEndRpm)} RPM</td><td>{e.peakPowerKw.toFixed(1)} kW</td>
          <td>{Math.round(e.boundRpm)} RPM · {t(e.boundKind === 'observed-cut' ? 'Observed output interruption' : 'Measured range only')}</td>
          <td>{e.boundSpeedKmh.toFixed(1)} km/h</td></tr>)}</tbody>
      </table></div>
      <p className="small text-body-secondary">{t('Boundary speed is a kinematic estimate, not a predicted top speed. Road load, traction and shift losses are not identified. Power bands use 95% of the observed peak; they are not shift targets.')}</p>
    </div>}
  </section>;
}
