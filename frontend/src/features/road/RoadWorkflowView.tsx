import { useEffect, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useRoadWorkflow } from './useRoadWorkflow';
import { documentsOf, type RoadWorkflow } from './roadTypes';
import { RoadPrepare } from './RoadPrepare';
import { RoadBaselineBuilder } from './RoadBaselineBuilder';
import { RoadRunPanel } from './RoadRunPanel';
import { RoadResults } from './RoadResults';

export function RoadWorkflowView() {
  const { t } = useSettings();
  const state = useRoadWorkflow();
  const [step, setStep] = useState<'prepare' | 'drive' | 'results'>('prepare');
  const [setupId, setSetupId] = useState('');
  const [choiceSaved, setChoiceSaved] = useState(false);
  const [building, setBuilding] = useState(false);
  const work = state.workflows.find(w => w.id === state.selectedId);
  const setups = documentsOf(state.documents, 'setup');
  const selectedSetupId = setups.find(s => s.id === setupId)?.id || setups[0]?.id || '';
  const prefix = '/workflows/' + encodeURIComponent(state.selectedId);
  const summaryCount = documentsOf(state.documents, 'summary').length;
  useEffect(() => { setSetupId(''); setChoiceSaved(false); }, [state.selectedId]);
  useEffect(() => {
    if (state.live?.activeRun?.workflowId === state.selectedId) setStep('drive');
    else if (summaryCount) setStep('results');
  }, [summaryCount, state.live?.activeRun?.id, state.selectedId]);
  return <div className="d-flex flex-column gap-3 overflow-auto p-2" style={{ minHeight: 0 }}>
    <header className="glass-panel p-3">
      <div className="d-flex flex-wrap justify-content-between gap-3"><h1 className="h4 mb-0">{t('Road comparison assistant')}</h1>
        <select className="form-select w-auto" aria-label={t('Saved Road workflow')} value={state.selectedId} onChange={e => { state.select(e.target.value); setStep(e.target.value ? 'results' : 'prepare'); }}>
          <option value="">{t('New Road workflow')}</option>{state.workflows.map(w => <option key={w.id} value={w.id}>{w.carName} · {w.event.name}</option>)}
        </select>
      </div>
      <nav className="d-flex flex-wrap gap-2 mt-3" aria-label={t('Road workflow steps')}>
        {(['prepare', 'drive', 'results'] as const).map((key, i) => <button className={'btn btn-sm ' + (step === key ? 'btn-primary' : 'btn-outline-secondary')} key={key} onClick={() => setStep(key)} disabled={key !== 'prepare' && !work}>{i + 1}. {t(['Confirm car and event', 'Drive', 'Result and next step'][i])}</button>)}
      </nav>
      <div className="small mt-2" role="status" style={{ minHeight: '1.5em' }}>{state.error ? t(state.error) : state.live?.error ? t(state.live.error) : choiceSaved ? t('Choice saved. Game values must be confirmed again before another run.') : t('Saved observations and drafts are available after disconnecting.')}</div>
    </header>
    {step === 'prepare' && !(building && work) && <RoadPrepare live={state.live} busy={state.busy} onCreate={body => state.perform<RoadWorkflow>('/workflows', body)} onCreated={(id, fromScratch) => { state.select(id); setBuilding(fromScratch); setStep(fromScratch ? 'prepare' : 'drive'); }} />}
    {step === 'prepare' && building && work && <RoadBaselineBuilder key={work.id} workflow={work} documents={state.documents} busy={state.busy} save={body => state.perform(prefix + '/initial-setups', body)} onReady={id => { setSetupId(id); setStep('drive'); }} />}
    {work && step !== 'prepare' && <button className="btn btn-sm btn-outline-secondary align-self-start" onClick={() => { setBuilding(true); setStep('prepare'); }}>{t('Build or complete initial baseline sections')}</button>}
    {step === 'drive' && work && <RoadRunPanel workflow={work} setups={setups} selectedSetupId={selectedSetupId} selectSetup={setSetupId} live={state.live} busy={state.busy}
      start={body => state.perform(prefix + '/runs', body)} stop={async () => { const result = await state.perform('/stop', {}); if (result) setStep('results'); return result; }} />}
    {step === 'results' && work && <RoadResults key={work.id} documents={state.documents} busy={state.busy} perform={state.perform} prefix={prefix} onDraft={(id, revisit) => { setSetupId(id); setChoiceSaved(true); if (revisit) setStep('drive'); }} />}
  </div>;
}
