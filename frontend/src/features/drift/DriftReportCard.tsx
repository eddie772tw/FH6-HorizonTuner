import { useSettings } from '../../context/SettingsContext';
import type { DriftReport } from './driftTypes';

interface Props {
  report: DriftReport;
  busy: boolean;
  decide: (choice: string) => Promise<void>;
}

export function DriftReportCard({ report, busy, decide }: Props) {
  const { t } = useSettings();
  const { conclusion, conclusionNote, driftMetrics, limitations } = report;

  const getBadgeClass = (c: string) => {
    switch (c) {
      case 'score-higher-descriptive': return 'text-bg-success';
      case 'score-lower-descriptive': return 'text-bg-danger';
      default: return 'text-bg-secondary';
    }
  };

  return (
    <section className="glass-panel p-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h5 mb-0">{t('A/B Drift Comparison Report')}</h2>
        <span className={`badge ${getBadgeClass(conclusion)}`}>{conclusion}</span>
      </div>

      <p className="small text-body-secondary mb-3">{conclusionNote}</p>

      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Game Score Delta')}</span>
            <span className="h6 mb-0">
              {driftMetrics.deltaScore !== null ? `${driftMetrics.deltaScore > 0 ? '+' : ''}${driftMetrics.deltaScore.toLocaleString()} pts` : 'N/A'}
            </span>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card p-2 text-center">
            <span className="small text-body-secondary">{t('Mean Yaw Rate Delta')}</span>
            <span className="h6 mb-0">
              {driftMetrics.deltaYawRateRads !== null ? `${driftMetrics.deltaYawRateRads > 0 ? '+' : ''}${driftMetrics.deltaYawRateRads.toFixed(3)} rad/s` : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {limitations && limitations.length > 0 && (
        <div className="mb-3 text-body-secondary small">
          <strong>{t('Declared Limitations & Unmodeled Physics')}:</strong>
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
