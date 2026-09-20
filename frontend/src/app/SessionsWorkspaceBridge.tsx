import { useCallback, useMemo } from 'react';
import type { WorkspaceProps } from './AppShell';
import { useSettings } from '../context/SettingsContext';
import { RoadReviewLibrary } from '../features/road/RoadReviewLibrary';
import { RoadReviewView } from '../features/road/RoadReviewView';
import { useRoadValidation } from '../features/road/RoadValidationController';
import { SessionsWorkspace } from '../features/sessions/SessionsWorkspace';
import { useSessionsState } from '../features/sessions/SessionsStateProvider';
import type { ValidationReviewSlot, ValidationReviewSlotRenderer } from '../features/sessions/validationReviewSlot';

/** Coordinator-owned bridge that composes the D review surface into Sessions. */
export function SessionsWorkspaceBridge(props: WorkspaceProps) {
  const { state, applySessionIntent } = useSessionsState();
  const { t } = useSettings();
  const road = useRoadValidation();
  const workflowId = state.roadWorkflowId ?? '';

  const selectWorkflow = useCallback((nextWorkflowId: string) => {
    void applySessionIntent({ kind: 'road', workflowId: nextWorkflowId });
  }, [applySessionIntent]);

  const onReturnToTune = useCallback(() => {
    if (!workflowId) return;
    road.selectWorkflow(workflowId);
    props.onOpenTune();
  }, [props, road, workflowId]);

  const reviewSlot = useMemo<ValidationReviewSlot>(() => ({
    workflowId,
    onReturnToTune,
  }), [onReturnToTune, workflowId]);

  const renderReviewSlot = useCallback<ValidationReviewSlotRenderer>((slot) => (
    <div className="d-flex flex-column gap-3" data-review-workspace="road">
      <RoadReviewLibrary workflowId={slot.workflowId} onSelectWorkflow={selectWorkflow} />
      {slot.workflowId ? (
        <RoadReviewView workflowId={slot.workflowId} onReturnToTune={slot.onReturnToTune} />
      ) : (
        <section className="glass-panel p-4" aria-live="polite">
          <p className="mb-0">{t('Select a saved Road workflow to review its observations and decisions.')}</p>
        </section>
      )}
    </div>
  ), [selectWorkflow, t]);

  return <SessionsWorkspace {...props} reviewSlot={reviewSlot} renderReviewSlot={renderReviewSlot} />;
}

export default SessionsWorkspaceBridge;
