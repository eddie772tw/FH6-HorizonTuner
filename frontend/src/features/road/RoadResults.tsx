import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { documentsOf, type RoadDocument, type RoadSetup, type RoadReport, type RoadDecision } from './roadTypes';
import { RoadObservation } from './RoadObservation';
import { RoadCandidate } from './RoadCandidate';
import { RoadCompare } from './RoadCompare';

interface Props { documents: RoadDocument[]; busy: boolean; perform: <T>(path: string, body: unknown) => Promise<T | null>; prefix: string; onDraft: (id: string, revisit: boolean) => void }
export function RoadResults({ documents, busy, perform, prefix, onDraft }: Props) {
  const { t } = useSettings();
  const summaries = documentsOf(documents, 'summary');
  const [selectedRun, setSelectedRun] = useState(''), [showCandidate, setShowCandidate] = useState(false);
  const summary = summaries.find(s => s.runId === selectedRun) || summaries.slice(-1)[0];
  const finish = documentsOf(documents, 'finish').filter(f => f.runId === summary?.runId).slice(-1)[0];
  const setups = documentsOf(documents, 'setup');
  const runs = documentsOf(documents, 'run');
  const basis = setups.find(s => s.id === runs.find(r => r.id === summary?.runId)?.setupId);
  const isBaseline = basis && !basis.baselineSetupId;
  if (!summary) return <section className="glass-panel p-4"><p>{t('Complete or stop the first run to view saved observations here.')}</p></section>;
  return <>
    <RoadCompare documents={documents} busy={busy} compare={body => perform<RoadReport>(prefix + '/comparisons', body)} decide={body => perform<RoadDecision>(prefix + '/decisions', body)} onDecision={onDraft} />
    <label className="form-label">{t('Saved event')}<select className="form-select" value={summary.runId} onChange={e => { setSelectedRun(e.target.value); setShowCandidate(false); }}>
      {summaries.map((s, i) => <option key={s.id} value={s.runId}>{i + 1} · {new Date(s.createdAt * 1000).toLocaleString()}</option>)}
    </select></label>
    <RoadObservation key={summary.id} summary={summary} finish={finish} busy={busy} saveFinish={body => perform(prefix + '/runs/' + summary.runId + '/finish', body)} />
    {isBaseline && <button className="btn btn-outline-primary align-self-start" onClick={() => setShowCandidate(!showCandidate)}>{t(showCandidate ? 'Close exploratory change' : 'Try one reversible change')}</button>}
    {showCandidate && isBaseline && <RoadCandidate key={summary.runId} runId={summary.runId} basis={basis} busy={busy} create={body => perform<RoadSetup>(prefix + '/candidates', body)} onCreated={id => { setShowCandidate(false); onDraft(id, true); }} />}
    <details><summary>{t('Saved snapshots and report history')}</summary><pre className="small p-3" style={{ maxHeight: 360, overflow: 'auto', background: 'var(--surface-1)' }}>{JSON.stringify(documents, null, 2)}</pre></details>
  </>;
}
