import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { RoadCompare } from './RoadCompare';
import type { RoadResultSelection } from './roadValidationState';
import { documentsOf, type RoadDocument, type RoadSummary } from './roadTypes';
import type { RoadReviewIo } from './roadReviewTypes';
import { useRoadReview } from './useRoadReview';

export interface RoadReviewViewProps {
  workflowId: string;
  onReturnToTune: () => void;
  io?: RoadReviewIo;
}

export function RoadReviewView({ workflowId, onReturnToTune, io }: RoadReviewViewProps) {
  const { t } = useSettings();
  const state = useRoadReview(workflowId, io);
  const workflow = documentsOf(state.documents, 'workflow')[0];
  return <div className="d-flex flex-column gap-3" aria-label={t('Road validation review')} aria-busy={state.status === 'loading'}>
    <header className="glass-panel p-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
        <div><span className="badge text-bg-secondary mb-2">{t('Road validation review')}</span>
          <h2 className="h4 mb-0">{workflow ? `${workflow.carName || workflow.identity.ordinal} · ${workflow.event.name}` : t('Saved Road workflow')}</h2></div>
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-outline-secondary" disabled={state.status === 'loading' || state.busy} onClick={() => void state.refresh()}>{t('Refresh')}</button>
          <button className="btn btn-primary" onClick={onReturnToTune}>{t('Return to Tune')}</button>
        </div>
      </div>
      {workflow && <p className="small text-body-secondary mt-3 mb-0">{workflow.configuration} · {workflow.event.conditions} · {workflow.event.driverAssists}</p>}
      <p role="status" className="small mb-0 mt-2" style={{ minHeight: '1.5em' }}>{state.notice ? t(state.notice) : state.busy ? t('Saving Road changes…') : ''}</p>
    </header>
    {state.status !== 'ready' && <section className="glass-panel p-4"><p role="status" className="mb-0">
      {t(state.status === 'loading' ? 'Loading saved Road workflow…' : state.status === 'missing' ? 'This Road workflow is no longer available. Select another saved workflow or return to Tune.'
        : state.status === 'empty' ? 'Select a saved Road workflow to review.' : state.error)}
    </p></section>}
    {state.status === 'ready' && <RoadReviewDocuments key={workflowId} documents={state.documents} busy={state.busy} exporting={state.exporting}
      compare={state.compare} decide={state.decide} exportCapture={state.exportCapture} />}
  </div>;
}

function RoadReviewDocuments({ documents, busy, exporting, compare, decide, exportCapture }: {
  documents: RoadDocument[]; busy: boolean; exporting: boolean;
  compare: ReturnType<typeof useRoadReview>['compare']; decide: ReturnType<typeof useRoadReview>['decide']; exportCapture: (runId: string) => Promise<void>;
}) {
  const { t } = useSettings();
  const [selection, setSelection] = useState<RoadResultSelection>({ selectedRunId: '', showCandidate: false,
    comparison: { baselineRunId: '', candidateRunId: '', extraBaselineRunIds: [], extraCandidateRunIds: [] } });
  const summaries = documentsOf(documents, 'summary');
  const summary = summaries.find(item => item.runId === selection.selectedRunId) ?? summaries.slice(-1)[0];
  const decisions = documentsOf(documents, 'decision');
  return <>
    <RoadCompare documents={documents} busy={busy} selection={selection} onSelectionChange={setSelection} compare={compare} decide={decide} onDecision={() => { /* Only the explicit Return to Tune action navigates. */ }} />
    {!summary && <section className="glass-panel p-4"><p className="mb-0">{t('Complete or stop the first run to view saved observations here.')}</p></section>}
    {summary && <>
      <label className="form-label">{t('Saved event')}<select className="form-select" value={summary.runId} onChange={event => setSelection({ ...selection, selectedRunId: event.target.value })}>
        {summaries.map((item, index) => <option key={item.id} value={item.runId}>{index + 1} · {new Date(item.createdAt * 1000).toLocaleString()}</option>)}
      </select></label>
      <SavedObservations summary={summary} documents={documents} />
      <button className="btn btn-outline-secondary align-self-start" disabled={exporting} onClick={() => void exportCapture(summary.runId)}>{t(exporting ? 'Exporting recorded frames…' : 'Export recorded frames')}</button>
    </>}
    <SavedSetups documents={documents} />
    {decisions.length > 0 && <section className="glass-panel p-4"><h3 className="h5">{t('Saved choices')}</h3>
      <ul className="mb-0">{decisions.map(decision => <li key={decision.id}>{t(decision.choice)} · {t(decision.status)} · {decision.setupId}</li>)}</ul>
    </section>}
    <details><summary>{t('Saved snapshots and report history')}</summary><pre className="small p-3" style={{ maxHeight: 360, overflow: 'auto', background: 'var(--surface-1)' }}>{JSON.stringify(documents, null, 2)}</pre></details>
  </>;
}

function SavedSetups({ documents }: { documents: RoadDocument[] }) {
  const { t } = useSettings();
  const setups = documentsOf(documents, 'setup');
  return <section className="glass-panel p-4"><h3 className="h5">{t('Saved baseline and candidate setups')}</h3>
    <p className="small text-body-secondary">{t('Return to Tune to prepare or edit a candidate and confirm game values.')}</p>
    {setups.length === 0 && <p>{t('No saved setups.')}</p>}
    {setups.map(setup => <details key={setup.id} className="mb-2"><summary>{setup.label} · {setup.targetParameter ? t(setup.targetParameter) : t('Baseline')} · {t(setup.status ?? setup.source)}</summary>
      <dl className="mt-2">{Object.entries(setup.fields).map(([key, setting]) => <div key={key} className="d-flex flex-wrap gap-2"><dt>{t(key)}</dt><dd>{setting.value} {setting.unit} · {t(setting.source)}</dd></div>)}</dl>
      <p className="small">{t(setup.confirmationScope)} · {setup.id}</p>
    </details>)}
    {documentsOf(documents, 'feedback').map(feedback => <p key={feedback.id} className="small mb-1">{feedback.hypothesis} · {t(feedback.source)}</p>)}
  </section>;
}

function SavedObservations({ summary, documents }: { summary: RoadSummary; documents: RoadDocument[] }) {
  const { t } = useSettings();
  const finish = documentsOf(documents, 'finish').filter(item => item.runId === summary.runId).slice(-1)[0];
  const fmt = (value: number | null, digits = 1) => value === null ? t('Unknown') : value.toFixed(digits);
  return <section className="glass-panel p-4">
    <h3 className="h5">{t('Saved run observations')}</h3>
    <p>{t('Observed driving')}: {fmt(summary.observations.quality.observedSeconds)} s · {t('Saved samples')}: {summary.observations.sampleCount}</p>
    <p>{t('Full-event time shown in game')}: {finish ? `${fmt(finish.timeSeconds, 3)} s · ${t(finish.clean)} · ${t(finish.source)}` : t('No confirmed finish result. Return to Tune to confirm the result.')}</p>
    <p className="small text-body-secondary">{t('Optional until comparing performance. Telemetry sample duration is not a finish time.')}</p>
    <details><summary>{t('Four-wheel observations and data quality')}</summary>
      <div className="table-responsive"><table className="table table-sm mt-3"><thead><tr><th>{t('Wheel')}</th><th>{t('Start / end temperature')} °C</th><th>{t('Mean / change')} °C</th><th>{t('Near-compression events')}</th></tr></thead><tbody>
        {Object.entries(summary.observations.wheels).map(([key, wheel]) => <tr key={key}><th>{key}</th><td>{fmt(wheel.startTemperatureC)} / {fmt(wheel.endTemperatureC)}</td><td>{fmt(wheel.temperatureC.mean)} / {fmt(wheel.temperatureChangeC)}</td><td>{fmt(wheel.nearCompression.count, 0)} · {fmt(wheel.nearCompression.seconds)} s</td></tr>)}
      </tbody></table></div>
      <p className="small">{t('Temperatures describe this run. Near-compression is not proof of bottoming. No pressure or tire compound was inferred.')}</p>
      <p className="small">{t('Telemetry gaps')}: {fmt(summary.observations.quality.gapSeconds)} s · {t('End reason')}: {t(summary.recording.endReason)}</p>
      <ul>{summary.observations.laps.map(lap => <li key={lap.lapNumber}>{t('Lap')} {lap.lapNumber}: {fmt(lap.lapTimeSeconds, 3)} s · {t(lap.complete ? 'Complete observed lap' : 'Partial or unconfirmed lap')}</li>)}</ul>
      {summary.observations.channels && <div className="table-responsive"><table className="table table-sm"><thead><tr><th>{t('Telemetry channel')}</th><th>{t('Mean')}</th><th>P05 / P50 / P95</th><th>{t('Observed driving')} s</th></tr></thead><tbody>
        {Object.entries(summary.observations.channels).map(([key, value]) => <tr key={key}><th>{t(key)}</th><td>{fmt(value.mean, 3)}</td><td>{fmt(value.p05, 3)} / {fmt(value.p50, 3)} / {fmt(value.p95, 3)}</td><td>{fmt(value.observedSeconds)}</td></tr>)}
      </tbody></table><p className="small">{t('Raw units: speed m/s, power W, torque Nm, acceleration m/s², angular velocity rad/s, controls in game input units. Gaps do not count toward observed duration.')}</p></div>}
    </details>
  </section>;
}
