import { useSettings } from '../../context/SettingsContext';
import { documentsOf, type RoadDocument, type RoadSetup, type RoadReport, type RoadDecision, type RoadFinish, type RoadSummary } from './roadTypes';
import { RoadObservation } from './RoadObservation';
import { RoadCandidate } from './RoadCandidate';
import { RoadCompare } from './RoadCompare';
import { savedCaptureSaveRequest } from '../tuning/captureDownload';
import { useFileSave } from '../../hooks/useFileSave';
import type { RoadCandidateDraft, RoadFinishDraft, RoadResultSelection } from './RoadValidationController';

interface Props {
  documents: RoadDocument[];
  busy: boolean;
  selection: RoadResultSelection;
  candidateDraft: RoadCandidateDraft | null;
  finishDraftFor: (summary: RoadSummary, finish?: RoadFinish) => RoadFinishDraft;
  onSelectionChange: (selection: RoadResultSelection) => void;
  onCandidateDraftChange: (draft: RoadCandidateDraft | null) => void;
  onFinishDraftChange: (draft: RoadFinishDraft | null) => void;
  perform: <T>(path: string, body: unknown) => Promise<T | null>;
  prefix: string;
  onDraft: (id: string, revisit: boolean) => void;
}
export function RoadResults({ documents, busy, selection, candidateDraft, finishDraftFor, onSelectionChange, onCandidateDraftChange, onFinishDraftChange, perform, prefix, onDraft }: Props) {
  const { t } = useSettings();
  const { save, isSaving } = useFileSave();
  const summaries = documentsOf(documents, 'summary');
  const summary = summaries.find(s => s.runId === selection.selectedRunId) || summaries.slice(-1)[0];
  const finish = documentsOf(documents, 'finish').filter(f => f.runId === summary?.runId).slice(-1)[0];
  const setups = documentsOf(documents, 'setup');
  const runs = documentsOf(documents, 'run');
  const basis = setups.find(s => s.id === runs.find(r => r.id === summary?.runId)?.setupId);
  const isBaseline = basis && !basis.baselineSetupId;
  if (!summary) return <section className="glass-panel p-4"><p>{t('Complete or stop the first run to view saved observations here.')}</p></section>;
  return <>
    <RoadCompare documents={documents} busy={busy} selection={selection} onSelectionChange={onSelectionChange} compare={body => perform<RoadReport>(prefix + '/comparisons', body)} decide={body => perform<RoadDecision>(prefix + '/decisions', body)} onDecision={onDraft} />
    <label className="form-label">{t('Saved event')}<select className="form-select" value={summary.runId} onChange={e => onSelectionChange({ ...selection, selectedRunId: e.target.value, showCandidate: false })}>
      {summaries.map((s, i) => <option key={s.id} value={s.runId}>{i + 1} · {new Date(s.createdAt * 1000).toLocaleString()}</option>)}
    </select></label>
    <RoadObservation key={summary.id} summary={summary} busy={busy} draft={finishDraftFor(summary, finish)} onDraftChange={onFinishDraftChange}
      saveFinish={body => perform(prefix + '/runs/' + summary.runId + '/finish', body)} />
    <button className="btn btn-outline-secondary align-self-start" disabled={isSaving}
      onClick={() => void save(savedCaptureSaveRequest(prefix + '/runs/' + summary.runId + '/capture', 'road-capture.json'))}>{t('Export recorded frames')}</button>
    {isBaseline && <button className="btn btn-outline-primary align-self-start" onClick={() => onSelectionChange({ ...selection, showCandidate: !selection.showCandidate })}>{t(selection.showCandidate ? 'Close exploratory change' : 'Try one reversible change')}</button>}
    {selection.showCandidate && isBaseline && <RoadCandidate key={summary.runId} runId={summary.runId} basis={basis} busy={busy} draft={candidateDraft} onDraftChange={onCandidateDraftChange}
      create={body => perform<RoadSetup>(prefix + '/candidates', body)} onCreated={id => { onSelectionChange({ ...selection, showCandidate: false }); onCandidateDraftChange(null); onDraft(id, true); }} />}
    <details><summary>{t('Saved snapshots and report history')}</summary><pre className="small p-3" style={{ maxHeight: 360, overflow: 'auto', background: 'var(--surface-1)' }}>{JSON.stringify(documents, null, 2)}</pre></details>
  </>;
}
