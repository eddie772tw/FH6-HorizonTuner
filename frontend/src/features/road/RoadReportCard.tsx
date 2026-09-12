import { useSettings } from '../../context/SettingsContext';
import { reasonText, roadConclusions } from './roadPresentation';
import type { RoadReport } from './roadTypes';
import { RoadLocalDetails } from './RoadLocalDetails';

interface Props { report: RoadReport; change?: { parameter: string; before: number; after: number; unit: string }; busy: boolean; decide: (choice: string) => Promise<void> }
export function RoadReportCard({ report, change, busy, decide }: Props) {
  const { t } = useSettings();
  const delta = report.time.medianChangeSeconds;
  return <section className="glass-panel p-4">
    <span className="badge text-bg-secondary mb-2">{t('Descriptive comparison')}</span>
    <h2 className="h5">{t(roadConclusions[report.conclusion] || 'The runs are not ready for a setting conclusion.')}</h2>
    {change && <p>{t(change.parameter)}: A {change.before} → B {change.after} {change.unit}</p>}
    {report.reasons.length > 0 && <p>{t('Next useful action')}: {t(reasonText(report.reasons[0]))}</p>}
    <div className="row g-3 my-2">
      <div className="col-md-4"><div className="small text-body-secondary">{t('Candidate minus baseline time')}</div><strong>{delta === null ? t('Unknown') : (delta > 0 ? '+' : '') + delta.toFixed(3) + ' s'}</strong></div>
      <div className="col-md-4"><div className="small text-body-secondary">{t('Starting thermal state')}</div><strong>{t(report.thermalStart.status)}</strong></div>
      <div className="col-md-4"><div className="small text-body-secondary">{t('Local normalized slip change')}</div><strong>{report.local.meanNormalizedAngleChange?.toFixed(3) ?? t('Unknown')}</strong></div>
    </div>
    <p className="small">{t('Independent events')}: A {report.independentRuns.baseline} / B {report.independentRuns.candidate}. {t('A single comparison does not establish a setting effect. Lower slip alone is not an improvement.')}</p>
    <div className="d-flex flex-wrap gap-2">
      <button className="btn btn-primary" disabled={busy} onClick={() => void decide('keep-baseline')}>{t('Prepare return to A')}</button>
      <button className="btn btn-outline-secondary" disabled={busy} onClick={() => void decide('keep-candidate')}>{t('Save choice B')}</button>
      <button className="btn btn-outline-secondary" disabled={busy} onClick={() => void decide('retest-baseline')}>{t('Revisit A once')}</button>
    </div>
    <p className="small text-body-secondary mt-2">{t('These actions save a choice and an application draft. Confirm game values before recording again.')}</p>
    <RoadLocalDetails segments={report.local.segments} />
    <details><summary>{t('Comparison eligibility and method')}</summary>
      <p className="small mt-2">{t('Matched route coverage')}: A {(report.local.baselineCoverage * 100).toFixed(0)}% / B {(report.local.candidateCoverage * 100).toFixed(0)}% · {t('Matched driving conditions')}: {report.local.matchedDrivingConditions}</p>
      <ul>{report.reasons.map(reason => <li key={reason}>{t(reasonText(reason))} <span className="text-body-secondary">({reason})</span></li>)}</ul>
      <ul>{report.limitations.map(note => <li key={note}>{t(note)}</li>)}</ul>
      <p className="small text-body-secondary">{report.methodVersion}</p>
    </details>
  </section>;
}
