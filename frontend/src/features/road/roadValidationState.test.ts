import { describe, expect, it } from 'vitest';
import type { RoadLive, RoadSetup } from './roadTypes';
import {
  createRoadCandidateDraft,
  createRoadValidationSession,
  markRoadWorkflowCreated,
  reconcileRoadLive,
  roadRunConfirmationFor,
  selectRoadWorkflow,
  setRoadRunConfirmation,
  settleRoadOperation,
  startRoadOperation,
} from './roadValidationState';

const identity = { ordinal: 17, performanceIndex: 700, drivetrain: 1 };
const setup: RoadSetup = {
  id: 'setup-a', workflowId: 'workflow-a', createdAt: 1, schema: 'road-workflow/v1', kind: 'setup', label: 'A',
  fields: { 'pressure.front': { value: 28, unit: 'psi', minimum: 15, maximum: 45, step: 0.5, source: 'game-confirmed' } },
  confirmationScope: 'baseline', source: 'recommendation', baselineSetupId: null,
};

const live = (activeRun: RoadLive['activeRun']): RoadLive => ({
  identity, fresh: true, source: 'telemetry', activeRun, sampleCount: 0, state: 'ready', error: null,
});

describe('Road validation session state', () => {
  it('keeps the unsubmitted prepare draft in app memory while switching the saved workflow', () => {
    const session = createRoadValidationSession();
    const withDraft = { ...session, prepareDraft: { ...session.prepareDraft, name: 'Goliath', conditions: 'dry' } };

    const selected = selectRoadWorkflow(withDraft, 'workflow-a');

    expect(selected.selectedWorkflowId).toBe('workflow-a');
    expect(selected.step).toBe('results');
    expect(selected.prepareDraft).toEqual({ ...session.prepareDraft, name: 'Goliath', conditions: 'dry' });
    expect(selected.setupId).toBe('');
    expect(selected.runConfirmation).toBeNull();
  });

  it('creates a candidate form draft from the actual saved field values', () => {
    expect(createRoadCandidateDraft('run-a', setup)).toMatchObject({
      runId: 'run-a', basisSetupId: 'setup-a', parameter: 'pressure.front', unit: 'psi',
      values: { value: '28', minimum: '15', maximum: '45', step: '0.5' }, direction: 1, confirmed: false,
    });
  });

  it('does not reuse confirmations when the setup, inputs, or backend run changes', () => {
    const initial = markRoadWorkflowCreated(createRoadValidationSession(), 'workflow-a');
    const baselineIdentity = { workflowId: 'workflow-a', setupId: 'setup-a', activeRunId: null, inputSnapshot: { carId: '17', season: 'Summer' }, liveIdentity: identity };
    const confirmed = setRoadRunConfirmation(initial, baselineIdentity, { confirmed: true, unchanged: true });

    expect(roadRunConfirmationFor(confirmed, baselineIdentity)).toMatchObject({ confirmed: true, unchanged: true });
    expect(roadRunConfirmationFor(confirmed, { ...baselineIdentity, setupId: 'setup-b' })).toMatchObject({ confirmed: false, unchanged: false });
    expect(roadRunConfirmationFor(confirmed, { ...baselineIdentity, inputSnapshot: { carId: '17', season: 'Winter' } })).toMatchObject({ confirmed: false, unchanged: false });
    expect(roadRunConfirmationFor(reconcileRoadLive(confirmed, live({ id: 'active-b', workflowId: 'workflow-a' })), baselineIdentity))
      .toMatchObject({ confirmed: false, unchanged: false });
  });

  it('uses backend live state to restore the active workflow without retaining its old confirmation', () => {
    const confirmed = setRoadRunConfirmation(
      markRoadWorkflowCreated(createRoadValidationSession(), 'workflow-a'),
      { workflowId: 'workflow-a', setupId: 'setup-a', activeRunId: null, inputSnapshot: {}, liveIdentity: identity },
      { confirmed: true, unchanged: true },
    );

    const reconciled = reconcileRoadLive({ ...confirmed, step: 'results' }, live({ id: 'run-b', workflowId: 'workflow-a' }));

    expect(reconciled.step).toBe('drive');
    expect(reconciled.activeRun).toEqual({ id: 'run-b', workflowId: 'workflow-a' });
    expect(reconciled.runConfirmation).toBeNull();
  });

  it('ignores a late operation completion after a newer operation has started', () => {
    const pending = startRoadOperation(createRoadValidationSession(), 4, '/workflows');
    const newer = startRoadOperation(pending, 5, '/workflows/workflow-a/runs');

    expect(settleRoadOperation(newer, 4, 'succeeded')).toBe(newer);
    expect(settleRoadOperation(newer, 5, 'succeeded').operation).toMatchObject({ id: 5, status: 'succeeded' });
  });
});
