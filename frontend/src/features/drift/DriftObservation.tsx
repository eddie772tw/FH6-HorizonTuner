import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { DriftFinish, DriftSummary } from './driftTypes';

interface Props {
  summary: DriftSummary;
  finish?: DriftFinish;
  busy: boolean;
  saveFinish: (body: unknown) => Promise<unknown>;
}

export function DriftObservation({ summary, finish, busy, saveFinish }: Props) {
  const { t } = useSettings();
  const [scoreInput, setScoreInput] = useState('');
  const [durationInput, setDurationInput] = useState('30.0');
  const obs = summary.observations;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const scoreVal = parseFloat(scoreInput);
    const durVal = parseFloat(durationInput);
    if (isNaN(scoreVal) || scoreVal < 0 || isNaN(durVal) || durVal <= 0) return;
    void saveFinish({
      completed: true,
      score: scoreVal,
      durationSeconds: durVal,
      source: 'game-confirmed',
    });
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Drift Kinematic Observation')}</h2>
      <p className="small text-body-secondary mb-3">
        {t('Descriptive kinematic metrics only. No composite drift score or causal optimum is fabricated.')}
      </p>

      <div className="row g-3 mb-3">
        <div className="col-md-4 col-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Mean Yaw Rate')}</span>
            <span className="h6 mb-0">
              {obs.yawRate.distribution.mean !== null ? `${obs.yawRate.distribution.mean.toFixed(2)} rad/s` : 'N/A'}
            </span>
          </div>
        </div>
        <div className="col-md-4 col-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Sustained Slide Time')}</span>
            <span className="h6 mb-0">
              {obs.sideslipProxy.sustainedSlideEvents.seconds !== null ? `${obs.sideslipProxy.sustainedSlideEvents.seconds.toFixed(1)}s` : 'N/A'}
            </span>
          </div>
        </div>
        <div className="col-md-4 col-12">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Slide Events')}</span>
            <span className="h6 mb-0">
              {obs.sideslipProxy.sustainedSlideEvents.count ?? 0} {t('events')}
            </span>
          </div>
        </div>
      </div>

      <div className="border-top pt-3 mt-3">
        <h3 className="h6 mb-2">{t('Game Drift Score (Descriptive Observable)')}</h3>
        {finish ? (
          <p className="mb-0 text-success small">{t('Confirmed Game Score')}: <strong>{finish.score.toLocaleString()} pts</strong> ({finish.durationSeconds.toFixed(1)}s)</p>
        ) : (
          <form onSubmit={handleSave} className="d-flex gap-2 align-items-center flex-wrap">
            <input
              type="number"
              min="0"
              step="100"
              placeholder={t('Drift Score (e.g. 65000)')}
              className="form-control form-control-sm"
              style={{ maxWidth: '180px' }}
              value={scoreInput}
              onChange={e => setScoreInput(e.target.value)}
              required
            />
            <input
              type="number"
              min="1"
              step="0.1"
              placeholder={t('Duration (s)')}
              className="form-control form-control-sm"
              style={{ maxWidth: '120px' }}
              value={durationInput}
              onChange={e => setDurationInput(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              {t('Save Score')}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
