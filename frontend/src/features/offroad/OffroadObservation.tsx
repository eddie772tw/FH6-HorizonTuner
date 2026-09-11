import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { parseGameTime } from './offroadPresentation';
import type { OffroadFinish, OffroadSummary } from './offroadTypes';

interface Props {
  summary: OffroadSummary;
  finish?: OffroadFinish;
  busy: boolean;
  saveFinish: (body: unknown) => Promise<unknown>;
}

export function OffroadObservation({ summary, finish, busy, saveFinish }: Props) {
  const { t } = useSettings();
  const [time, setTime] = useState('');
  const [clean, setClean] = useState(false);
  useEffect(() => { setTime(finish?.timeSeconds.toString() || ''); setClean(finish?.clean === 'confirmed'); }, [summary.id, finish?.id]);
  const seconds = parseGameTime(time);
  const obs = summary.observations;

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-2">{t('Offroad Run Observations')}</h2>
      <p className="small text-body-secondary mb-3">
        {t('Observed')}: {obs.quality.observedSeconds.toFixed(1)} s · {t('Airborne')}: {obs.airborne.count} jumps ({obs.airborne.totalAirtimeSeconds.toFixed(1)} s) · {t('Landing Peak')}: {obs.landing.maxImpactG?.toFixed(1) ?? t('Unknown')} G · {t('Roughness RMS')}: {obs.terrain.surfaceRoughnessRms.toFixed(2)}
      </p>
      <form onSubmit={e => { e.preventDefault(); if (seconds !== null) void saveFinish({ completed: true, timeSeconds: seconds, clean: clean ? 'confirmed' : 'unknown', source: 'game-confirmed' }); }}>
        <div className="d-flex flex-wrap align-items-end gap-3 mb-2">
          <label className="form-label mb-0">{t('Game Event Time')}<input className="form-control" value={time} onChange={e => setTime(e.target.value)} placeholder="1:23.456" required /></label>
          <button className="btn btn-outline-primary" disabled={busy || seconds === null}>{t('Confirm Finish Result')}</button>
        </div>
        <label className="d-flex gap-2 my-2 small"><input type="checkbox" checked={clean} onChange={e => setClean(e.target.checked)} />{t('I completed the run cleanly without collision or rewind.')}</label>
      </form>
      <details className="mt-3"><summary className="small">{t('Four-Wheel Suspension & Bottoming Metrics')}</summary>
        <div className="table-responsive"><table className="table table-sm mt-2 mb-0"><thead><tr><th>{t('Wheel')}</th><th>{t('Peak Travel')}</th><th>{t('Near-Compression (>=95%)')}</th><th>{t('Severe Bottoming (>=98%)')}</th></tr></thead><tbody>
          {Object.entries(obs.wheels).map(([key, w]) => (
            <tr key={key}><th>{key}</th><td>{w.peakTravelPct?.toFixed(1) ?? t('Unknown')}%</td><td>{w.nearCompression.count ?? 0} ({w.nearCompression.seconds?.toFixed(1) ?? '0.0'} s)</td><td>{w.severeBottoming.count ?? 0} ({w.severeBottoming.seconds?.toFixed(1) ?? '0.0'} s)</td></tr>
          ))}
        </tbody></table></div>
      </details>
    </section>
  );
}
