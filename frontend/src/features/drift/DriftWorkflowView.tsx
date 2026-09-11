import { useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { DriftPrepare } from './DriftPrepare';
import { DriftResults } from './DriftResults';
import { DriftRunPanel } from './DriftRunPanel';
import { documentsOf, type DriftWorkflow } from './driftTypes';
import { useDriftWorkflow } from './useDriftWorkflow';

export function DriftWorkflowView() {
  const { t } = useSettings();
  const { workflows, selectedId, select, documents, live, error, busy, perform } = useDriftWorkflow();
  const [step, setStep] = useState<'prepare' | 'drive' | 'results'>('prepare');
  const workflow = workflows.find(w => w.id === selectedId);
  const setups = documentsOf(documents, 'setup');
  const activeSetup = setups[setups.length - 1];

  const handleCreate = async (body: unknown): Promise<DriftWorkflow | null> => {
    const wf = await perform<DriftWorkflow>('/workflows', body);
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
        <DriftPrepare live={live} busy={busy} createWorkflow={handleCreate} />
      )}
      {step === 'drive' && workflow && activeSetup && (
        <DriftRunPanel workflow={workflow} setup={activeSetup} live={live} busy={busy} startRun={b => perform(`/workflows/${selectedId}/runs`, b)} stopRun={() => perform('/stop', {})} />
      )}
      {step === 'results' && selectedId && (
        <DriftResults workflowId={selectedId} documents={documents} busy={busy} saveFinish={(rid, b) => perform(`/workflows/${selectedId}/runs/${rid}/finish`, b)} createCandidate={b => perform(`/workflows/${selectedId}/candidates`, b)} compareRuns={(base, cand) => perform(`/workflows/${selectedId}/comparisons`, { baselineRunIds: base, candidateRunIds: cand })} decide={async c => { const rep = documentsOf(documents, 'comparison').slice(-1)[0]; if (rep) await perform(`/workflows/${selectedId}/decisions`, { reportId: rep.id, choice: c }); }} />
      )}
    </div>
  );
}
