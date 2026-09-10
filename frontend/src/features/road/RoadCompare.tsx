import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { documentsOf, type RoadDocument, type RoadReport, type RoadDecision } from './roadTypes';
import { RoadReportCard } from './RoadReportCard';

interface Props { documents: RoadDocument[]; busy: boolean; compare: (body: unknown) => Promise<RoadReport | null>; decide: (body: unknown) => Promise<RoadDecision | null>; onDecision: (setupId: string, revisit: boolean) => void }
export function RoadCompare({ documents, busy, compare, decide, onDecision }: Props) {
  const { t } = useSettings();
  const runs = documentsOf(documents, 'run'), setups = documentsOf(documents, 'setup'), reports = documentsOf(documents, 'comparison');
  const saved = new Set(documentsOf(documents, 'summary').map(s => s.runId));
  const candidates = runs.filter(r => saved.has(r.id) && setups.find(s => s.id === r.setupId)?.baselineSetupId);
  const [chosenA, setChosenA] = useState('');
  const [chosen, setChosen] = useState(''), [extraA, setExtraA] = useState<string[]>([]), [extraB, setExtraB] = useState<string[]>([]);
  const candidateRun = candidates.find(r => r.id === chosen) || candidates.slice(-1)[0];
  const candidate = setups.find(s => s.id === candidateRun?.setupId);
  const baseline = setups.find(s => s.id === candidate?.baselineSetupId);
  const baselines = runs.filter(r => saved.has(r.id) && (r.setupId === baseline?.id || r.id === baseline?.basisRunId));
  const baselineRun = baselines.find(r => r.id === chosenA) || baselines[baselines.length - 1];
  useEffect(() => { setExtraA([]); setExtraB([]); }, [candidateRun?.setupId]);
  const latest = reports.filter(r => r.candidateRunIds.includes(candidateRun?.id || '') && r.baselineRunIds.includes(baselineRun?.id || '')).slice(-1)[0];
  const target = candidate?.targetParameter;
  const change = target && baseline?.fields[target] && candidate?.fields[target] ? { parameter: target,
    before: baseline.fields[target].value, after: candidate.fields[target].value, unit: candidate.fields[target].unit } : undefined;
  const toggle = (items: string[], id: string) => items.includes(id) ? items.filter(v => v !== id) : [...items, id];
  const submit = async () => {
    if (!baselineRun || !candidateRun) return;
    await compare({ baselineRunIds: [baselineRun.id, ...extraA.filter(id => id !== baselineRun.id)],
      candidateRunIds: [candidateRun.id, ...extraB.filter(id => id !== candidateRun.id)] });
  };
  return <>
    {candidateRun && baselineRun && <section className="glass-panel p-4">
      <h2 className="h5">{t('Compare A with one candidate B')}</h2>
      <label className="form-label w-100">{t('Candidate event')}<select className="form-select" value={candidateRun.id} onChange={e => setChosen(e.target.value)}>
        {candidates.map((run, i) => <option key={run.id} value={run.id}>B · {i + 1} · {new Date(run.createdAt * 1000).toLocaleString()}</option>)}
      </select></label>
      <label className="form-label w-100">{t('Baseline event')}<select className="form-select" value={baselineRun.id} onChange={e => setChosenA(e.target.value)}>
        {baselines.map((run, i) => <option key={run.id} value={run.id}>A · {i + 1} · {new Date(run.createdAt * 1000).toLocaleString()}</option>)}
      </select></label>
      <details className="mb-3"><summary>{t('Include independent repeated events')}</summary>
        <p className="small text-body-secondary">{t('Select every relevant repeat. Laps within one event do not count as repetitions.')}</p>
        {baselines.filter(r => r.id !== baselineRun.id).map((run, i) => <label className="d-block" key={run.id}><input type="checkbox" checked={extraA.includes(run.id)} onChange={() => setExtraA(toggle(extraA, run.id))} /> A · {i + 2} · {new Date(run.createdAt * 1000).toLocaleString()}</label>)}
        {candidates.filter(r => r.setupId === candidateRun.setupId && r.id !== candidateRun.id).map((run, i) => <label className="d-block" key={run.id}><input type="checkbox" checked={extraB.includes(run.id)} onChange={() => setExtraB(toggle(extraB, run.id))} /> B · {i + 1} · {new Date(run.createdAt * 1000).toLocaleString()}</label>)}
      </details>
      <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>{t('Create saved comparison')}</button>
    </section>}
    {latest && <RoadReportCard report={latest} change={change} busy={busy} decide={async choice => {
      const result = await decide({ reportId: latest.id, choice });
      if (result) onDecision(result.setupId, choice !== 'keep-candidate');
    }} />}
    {!candidateRun && <p className="text-body-secondary">{t('Baseline saved. Keep the current setup, or try one reversible change when you have a specific question.')}</p>}
  </>;
}
