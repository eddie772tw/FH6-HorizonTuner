import { useSettings } from '../../context/SettingsContext';
import type { RoadReviewIo } from './roadReviewTypes';
import { useRoadReviewLibrary } from './useRoadReview';

export interface RoadReviewLibraryProps {
  workflowId?: string;
  onSelectWorkflow: (workflowId: string) => void;
  io?: RoadReviewIo;
}

export function RoadReviewLibrary({ workflowId = '', onSelectWorkflow, io }: RoadReviewLibraryProps) {
  const { t } = useSettings();
  const state = useRoadReviewLibrary(workflowId, io);
  return <section className="glass-panel p-4" aria-label={t('Saved Road workflows')} aria-busy={state.status === 'loading'}>
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <h2 className="h5 mb-0">{t('Saved Road workflows')}</h2>
      <button className="btn btn-outline-secondary btn-sm" disabled={state.status === 'loading'} onClick={() => void state.refresh()}>{t('Refresh')}</button>
    </div>
    {state.status === 'loading' && <p role="status">{t('Loading saved Road workflows…')}</p>}
    {state.status === 'empty' && <p role="status">{t('No saved Road workflows. Prepare a Road validation in Tune to begin.')}</p>}
    {state.status === 'error' && <p role="status">{t(state.error)}</p>}
    {state.status === 'ready' && <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
      {state.workflows.map(workflow => <li key={workflow.id}>
        <button className={'btn w-100 text-start ' + (workflowId === workflow.id ? 'btn-primary' : 'btn-outline-secondary')}
          aria-pressed={workflowId === workflow.id} onClick={() => onSelectWorkflow(workflow.id)}>
          <span className="d-block fw-semibold">{workflow.carName || workflow.identity.ordinal} · {workflow.event.name}</span>
          <span className="d-block small">{workflow.configuration} · {new Date(workflow.createdAt * 1000).toLocaleString()}</span>
        </button>
      </li>)}
    </ul>}
  </section>;
}
