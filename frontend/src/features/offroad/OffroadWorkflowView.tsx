import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { OffroadBaselineBuilder } from './OffroadBaselineBuilder';
import { OffroadPrepare } from './OffroadPrepare';
import { OffroadResults } from './OffroadResults';
import { OffroadRunPanel } from './OffroadRunPanel';
import { documentsOf, type OffroadWorkflow } from './offroadTypes';
import { useOffroadWorkflow } from './useOffroadWorkflow';

export function OffroadWorkflowView() {
  const { t } = useSettings();
  const { workflows, selectedId, select, documents, live, error, busy, perform } = useOffroadWorkflow();
  const [step, setStep] = useState<'prepare' | 'drive' | 'results'>('prepare');
  const workflow = workflows.find(w => w.id === selectedId);
  const setups = documentsOf(documents, 'setup');
  const activeSetup = setups[setups.length - 1];

  const handleCreate = async (body: unknown): Promise<OffroadWorkflow | null> => {
    const wf = await perform<OffroadWorkflow>('/workflows', body);
    if (wf) { select(wf.id); setStep('drive'); }
    return wf;
  };

  return (
    <div className="d-flex flex-column gap-3 p-3 overflow-auto" style={{ maxHeight: '100%' }}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="btn-group" role="group">
          <button type="button" className={`btn btn-sm ${step === 'prepare' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setStep('prepare')}>{t('1. Prepare')}</button>
          <button type="button" className={`btn btn-sm ${step === 'drive' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setStep('drive')}>{t('2. Drive & Record')}</button>
          <button type="button" className={`btn btn-sm ${step === 'results' ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setStep('results')}>{t('3. Results & A/B')}</button>
        </div>
        {workflows.length > 0 && (
          <select className="form-select form-select-sm" style={{ width: 'auto' }} value={selectedId} onChange={e => select(e.target.value)}>
            {workflows.map(w => <option key={w.id} value={w.id}>{w.carName} ({w.event.name})</option>)}
          </select>
        )}
      </div>
      {error && <div className="popover bs-popover-bottom glass-panel p-2 text-danger small">{error}</div>}
      {step === 'prepare' && (
        <div className="d-flex flex-column gap-3">
          <OffroadPrepare live={live} busy={busy} createWorkflow={handleCreate} />
          {activeSetup && <OffroadBaselineBuilder setup={activeSetup} busy={busy} saveInitial={b => perform(`/workflows/${selectedId}/initial-setups`, b)} />}
        </div>
      )}
      {step === 'drive' && workflow && activeSetup && (
        <OffroadRunPanel workflow={workflow} setup={activeSetup} live={live} busy={busy} startRun={b => perform(`/workflows/${selectedId}/runs`, b)} stopRun={() => perform('/stop', {})} />
      )}
      {step === 'results' && selectedId && (
        <OffroadResults workflowId={selectedId} documents={documents} busy={busy} saveFinish={(rid, b) => perform(`/workflows/${selectedId}/runs/${rid}/finish`, b)} createCandidate={b => perform(`/workflows/${selectedId}/candidates`, b)} compareRuns={(base, cand) => perform(`/workflows/${selectedId}/comparisons`, { baselineRunIds: base, candidateRunIds: cand })} decide={async c => { const rep = documentsOf(documents, 'comparison').slice(-1)[0]; if (rep) await perform(`/workflows/${selectedId}/decisions`, { reportId: rep.id, choice: c }); }} />
      )}
    </div>
  );
}
