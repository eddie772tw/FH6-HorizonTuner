import { useSettings } from '../../context/SettingsContext';
import { offroadConclusions, reasonText } from './offroadPresentation';
import type { OffroadReport } from './offroadTypes';
import { OffroadLocalDetails } from './OffroadLocalDetails';

interface Props {
  report: OffroadReport;
  change?: { parameter: string; before: number; after: number; unit: string };
  busy: boolean;
  decide: (choice: string) => Promise<void>;
}

export function OffroadReportCard({ report, change, busy, decide }: Props) {
  const { t } = useSettings();
  const delta = report.time.medianChangeSeconds;
  const off = report.offroadMetrics;

  return (
    <section className="glass-panel p-4">
      <span className="badge text-bg-secondary mb-2">{t('Descriptive Offroad Comparison')}</span>
      <h2 className="h5">{t(offroadConclusions[report.conclusion] || 'Comparison ready.')}</h2>
      {change && <p className="small mb-2">{t(change.parameter)}: A {change.before} → B {change.after} {change.unit}</p>}
      <div className="row g-3 my-2">
        <div className="col-md-3"><div className="small text-body-secondary">{t('Event Time Delta')}</div><strong>{delta === null ? t('Unknown') : (delta > 0 ? '+' : '') + delta.toFixed(3) + ' s'}</strong></div>
        <div className="col-md-3"><div className="small text-body-secondary">{t('Severe Bottoming')}</div><strong>{off?.bottomingCountChange !== undefined ? (off.bottomingCountChange > 0 ? '+' : '') + off.bottomingCountChange : t('Unknown')}</strong></div>
        <div className="col-md-3"><div className="small text-body-secondary">{t('Landing Peak G')}</div><strong>{off?.candidateLandingImpactG?.toFixed(1) ?? t('Unknown')} G</strong></div>
        <div className="col-md-3"><div className="small text-body-secondary">{t('Roughness RMS')}</div><strong>{off?.candidateRoughnessRms?.toFixed(2) ?? t('Unknown')}</strong></div>
      </div>
      <div className="d-flex flex-wrap gap-2 my-3">
        <button className="btn btn-primary" disabled={busy} onClick={() => void decide('keep-candidate')}>{t('Keep Candidate B as New Baseline')}</button>
        <button className="btn btn-outline-secondary" disabled={busy} onClick={() => void decide('keep-baseline')}>{t('Return to Baseline A')}</button>
        <button className="btn btn-outline-secondary" disabled={busy} onClick={() => void decide('retest-baseline')}>{t('Retest Baseline A')}</button>
      </div>
      <OffroadLocalDetails segments={report.local.segments} />
      <details className="mt-3"><summary className="small">{t('Eligibility, Reasons & Limitations')}</summary>
        <ul className="small mt-2">{report.reasons.map(r => <li key={r}>{t(reasonText(r))} ({r})</li>)}</ul>
        <ul className="small">{report.limitations.map(l => <li key={l}>{t(l)}</li>)}</ul>
      </details>
    </section>
  );
}
