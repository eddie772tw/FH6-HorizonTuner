import { useEffect, useRef } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useRoadWorkflow } from './useRoadWorkflow';
import { documentsOf, type RoadWorkflow } from './roadTypes';
import { RoadPrepare } from './RoadPrepare';
import type { WorkflowRecommendation } from '../tuning/workflowSnapshot';
import { verificationState } from '../tuning/tuningWorkflow';
import { RoadRunPanel } from './RoadRunPanel';
import { RoadResults } from './RoadResults';
import { RoadValidationBoundary, useRoadValidation } from './RoadValidationController';

interface Props {
  recommendation: WorkflowRecommendation | null;
  carId: string;
}

export function RoadWorkflowView(props: Props) {
  return <RoadValidationBoundary><RoadWorkflowContent {...props} /></RoadValidationBoundary>;
}

function RoadWorkflowContent({ recommendation, carId }: Props) {
  const { t } = useSettings();
  const validation = useRoadValidation();
  const state = useRoadWorkflow({
    selectedId: validation.selectedWorkflowId,
    onSelect: validation.selectWorkflow,
    onLive: validation.reconcileLive,
  });
  const work = state.workflows.find(workflow => workflow.id === validation.selectedWorkflowId);
  const setups = documentsOf(state.documents, 'setup');
  const selectedSetupId = setups.find(setup => setup.id === validation.setupId)?.id || setups[0]?.id || '';
  const prefix = '/workflows/' + encodeURIComponent(validation.selectedWorkflowId);
  const pageActive = useRef(true);
  const operationStatus = validation.operation?.status;
  const operationId = validation.operation?.id;
  const busy = state.busy || operationStatus === 'pending';

  useEffect(() => {
    pageActive.current = true;
    return () => { pageActive.current = false; };
  }, []);

  useEffect(() => {
    if (operationStatus === 'succeeded') void state.refresh().catch(() => {});
  }, [operationId, operationStatus, state.refresh]);

  const perform = async <T,>(path: string, body: unknown): Promise<T | null> => {
    const operationId = validation.beginOperation(path);
    if (operationId === null) return null;
    const result = await state.perform<T>(path, body);
    const operationApplies = validation.finishOperation(operationId, result !== null);
    return pageActive.current && operationApplies ? result : null;
  };

  return <div className="d-flex flex-column gap-3 overflow-auto p-2" style={{ minHeight: 0 }}>
    <header className="glass-panel p-3">
      <div className="d-flex flex-wrap justify-content-between gap-3"><h1 className="h4 mb-0">{t('Road comparison assistant')}</h1>
        <select className="form-select w-auto" aria-label={t('Saved Road workflow')} value={validation.selectedWorkflowId} onChange={event => validation.selectWorkflow(event.target.value)}>
          <option value="">{t('New Road workflow')}</option>{state.workflows.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.carName} · {workflow.event.name}</option>)}
        </select>
      </div>
      <nav className="d-flex flex-wrap gap-2 mt-3" aria-label={t('Road workflow steps')}>
        {(['prepare', 'drive', 'results'] as const).map((key, index) => <button className={'btn btn-sm ' + (validation.step === key ? 'btn-primary' : 'btn-outline-secondary')} key={key} onClick={() => validation.setStep(key)} disabled={key !== 'prepare' && !work}>{index + 1}. {t(['Confirm car and event', 'Drive', 'Result and next step'][index])}</button>)}
      </nav>
      <div className="small mt-2" role="status" style={{ minHeight: '1.5em' }}>{t(verificationState(state.documents.map(document => document.kind)))} · {state.error ? t(state.error) : state.live?.error ? t(state.live.error) : validation.choiceSaved ? t('Choice saved. Game values must be confirmed again before another run.') : t('Saved observations and drafts are available after disconnecting.')}</div>
    </header>
    {!recommendation && <p>{t('Saved reports are available for review. Complete the current engine measurement to prepare a new validation run.')}</p>}
    {validation.step === 'prepare' && <RoadPrepare live={state.live} busy={!recommendation || busy || state.live?.identity?.ordinal !== Number(carId)}
      draft={validation.prepareDraft} onDraftChange={validation.setPrepareDraft}
      onCreate={body => perform<RoadWorkflow>('/workflows', { ...(body as object), recommendation })}
      onCreated={validation.markWorkflowCreated} />}
    {validation.step === 'prepare' && state.live?.identity?.ordinal !== Number(carId) && <p>{t('Connect fresh telemetry from this car to begin a new run. Saved results remain available.')}</p>}
    {validation.step === 'drive' && work && <RoadRunPanel workflow={work} setups={setups} selectedSetupId={selectedSetupId} selectSetup={validation.setSetupId} live={state.live} busy={busy}
      start={body => perform(prefix + '/runs', { ...(body as object), inputSnapshot: recommendation?.inputSnapshot })}
      readOnly={!recommendation} currentInputSnapshot={recommendation?.inputSnapshot || {}}
      stop={async () => { const result = await perform('/stop', {}); if (result) validation.setStep('results'); return result; }} />}
    {validation.step === 'results' && work && <RoadResults key={work.id} documents={state.documents} busy={busy} selection={validation.resultSelection} candidateDraft={validation.candidateDraft}
      finishDraftFor={validation.finishDraftFor} onSelectionChange={validation.setResultSelection} onCandidateDraftChange={validation.setCandidateDraft} onFinishDraftChange={validation.setFinishDraft} perform={perform} prefix={prefix}
      onDraft={(setupId, revisit) => { validation.setSetupId(setupId); validation.setChoiceSaved(true); if (revisit) validation.setStep('drive'); }} />}
  </div>;
}
