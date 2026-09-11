import { useSettings } from '../../context/SettingsContext';
import type { DragReport } from './dragTypes';

interface Props {
  report: DragReport;
  busy: boolean;
  decide: (choice: string) => Promise<void>;
}

export function DragReportCard({ report, busy, decide }: Props) {
  const { t } = useSettings();
  const { conclusion, time, dragMetrics, limitations } = report;

  const getBadgeClass = (c: string) => {
    switch (c) {
      case 'provisional-keep': return 'text-bg-success';
      case 'candidate-slower': return 'text-bg-danger';
      default: return 'text-bg-secondary';
    }
  };

  return (
    <section className="glass-panel p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">{t('A/B Comparison Report')}</h2>
        <span className={`badge ${getBadgeClass(conclusion)}`}>{conclusion}</span>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Sprint Time Delta')}</span>
            <span className="h6 mb-0">
              {time.medianChangeSeconds !== null ? `${time.medianChangeSeconds > 0 ? '+' : ''}${time.medianChangeSeconds.toFixed(3)}s` : 'N/A'}
            </span>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('0-100 km/h Delta')}</span>
            <span className="h6 mb-0">
              {dragMetrics.delta0To100Seconds !== null ? `${dragMetrics.delta0To100Seconds > 0 ? '+' : ''}${dragMetrics.delta0To100Seconds.toFixed(3)}s` : 'N/A'}
            </span>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('0-400m Delta')}</span>
            <span className="h6 mb-0">
              {dragMetrics.delta0To400mSeconds !== null ? `${dragMetrics.delta0To400mSeconds > 0 ? '+' : ''}${dragMetrics.delta0To400mSeconds.toFixed(3)}s` : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {limitations && limitations.length > 0 && (
        <div className="mb-3 text-body-secondary small">
          <strong>{t('Declared Limitations')}:</strong>
          <ul className="mb-0 ps-3">
            {limitations.map((lim, i) => <li key={i}>{lim}</li>)}
          </ul>
        </div>
      )}

      <div className="d-flex gap-2">
        <button className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => void decide('keep-baseline')}>
          {t('Keep Baseline (A)')}
        </button>
        <button className="btn btn-success btn-sm" disabled={busy} onClick={() => void decide('keep-candidate')}>
          {t('Promote Candidate (B) as New Baseline')}
        </button>
      </div>
    </section>
  );
}
