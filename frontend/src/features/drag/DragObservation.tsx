import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import type { DragFinish, DragSummary } from './dragTypes';

interface Props {
  summary: DragSummary;
  finish?: DragFinish;
  busy: boolean;
  saveFinish: (body: unknown) => Promise<unknown>;
}

export function DragObservation({ summary, finish, busy, saveFinish }: Props) {
  const { t } = useSettings();
  const [timeInput, setTimeInput] = useState('');
  const obs = summary.observations;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(timeInput);
    if (isNaN(val) || val <= 0) return;
    void saveFinish({
      completed: true,
      timeSeconds: val,
      clean: 'confirmed',
      source: 'game-confirmed',
    });
  };

  return (
    <section className="glass-panel p-4">
      <h2 className="h5 mb-3">{t('Drag Telemetry Observation')}</h2>
      <div className="row g-3 mb-3">
        <div className="col-md-3 col-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('0-100 km/h')}</span>
            <span className="h6 mb-0">{obs.milestones.zeroTo100KmhSeconds ? `${obs.milestones.zeroTo100KmhSeconds.toFixed(3)}s` : 'N/A'}</span>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('0-400m (1/4 mi)')}</span>
            <span className="h6 mb-0">{obs.milestones.zeroTo400mSeconds ? `${obs.milestones.zeroTo400mSeconds.toFixed(3)}s` : 'N/A'}</span>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Launch Peak Slip')}</span>
            <span className="h6 mb-0">{obs.launch.peakSlipRatio ? `${(obs.launch.peakSlipRatio * 100).toFixed(1)}%` : 'N/A'}</span>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Max Speed')}</span>
            <span className="h6 mb-0">{obs.maxSpeedKmh ? `${obs.maxSpeedKmh.toFixed(1)} km/h` : 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="border-top pt-3 mt-3">
        <h3 className="h6 mb-2">{t('Official Game Finish Time')}</h3>
        {finish ? (
          <p className="mb-0 text-success small">{t('Confirmed Finish Time')}: <strong>{finish.timeSeconds.toFixed(3)}s</strong></p>
        ) : (
          <form onSubmit={handleSave} className="d-flex gap-2 align-items-center">
            <input
              type="number"
              step="0.001"
              min="0.1"
              max="120"
              placeholder={t('Enter time (e.g. 9.850)')}
              className="form-control form-control-sm"
              style={{ maxWidth: '200px' }}
              value={timeInput}
              onChange={e => setTimeInput(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
              {t('Confirm Finish Time')}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
