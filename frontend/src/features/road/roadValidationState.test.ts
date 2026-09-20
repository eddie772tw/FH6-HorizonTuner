import { describe, expect, it } from 'vitest';
import type { RoadFinish, RoadLive, RoadSetup, RoadSummary } from './roadTypes';
import {
  createRoadCandidateDraft,
  createRoadFinishDraft,
  createRoadValidationSession,
  markRoadWorkflowCreated,
  observeRoadRunConfirmation,
  reconcileRoadLive,
  roadFinishDraftFor,
  roadOperationResultApplies,
  roadRunConfirmationFor,
  selectRoadWorkflow,
  setRoadFinishDraft,
  setRoadRunConfirmation,
  setRoadSetupId,
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

const summary: RoadSummary = {
  id: 'summary-a', workflowId: 'workflow-a', createdAt: 1, schema: 'road-workflow/v1', kind: 'summary', runId: 'run-a', sessionId: 'session-a',
  recording: { endReason: 'stopped' }, observations: { sampleCount: 1, quality: { observedSeconds: 1, gapSeconds: 0 }, wheels: {}, laps: [] },
};

const finish: RoadFinish = {
  id: 'finish-a', workflowId: 'workflow-a', createdAt: 2, schema: 'road-workflow/v1', kind: 'finish', runId: 'run-a', timeSeconds: 83.456, clean: 'confirmed', source: 'game-confirmed',
};

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

  it('does not revive confirmation after selecting another setup and returning to the original', () => {
    const initial = setRoadSetupId(createRoadValidationSession('workflow-a'), 'setup-a');
    const original = { workflowId: 'workflow-a', setupId: 'setup-a', activeRunId: null, inputSnapshot: {}, liveIdentity: identity };
    const confirmed = setRoadRunConfirmation(initial, original, { confirmed: true, unchanged: true });
    const returned = setRoadSetupId(setRoadSetupId(confirmed, 'setup-b'), 'setup-a');
    expect(roadRunConfirmationFor(returned, original)).toMatchObject({ confirmed: false, unchanged: false });
  });

  it('requires confirmation again after input or car identity changes back to an earlier value', () => {
    const original = { workflowId: 'workflow-a', setupId: 'setup-a', activeRunId: null, inputSnapshot: { season: 'Summer' }, liveIdentity: identity };
    const confirmed = setRoadRunConfirmation(createRoadValidationSession('workflow-a'), original, { confirmed: true, unchanged: true });
    for (const changed of [
      { ...original, inputSnapshot: { season: 'Winter' } },
      { ...original, liveIdentity: { ...identity, performanceIndex: 800 } },
    ]) {
      const returned = observeRoadRunConfirmation(observeRoadRunConfirmation(confirmed, changed), original);
      expect(roadRunConfirmationFor(returned, original)).toMatchObject({ confirmed: false, unchanged: false });
    }
  });

  it('preserves a manually selected step until a backend active-run transition requires reconciliation', () => {
    const selected = { ...createRoadValidationSession('workflow-a'), step: 'prepare' as const };

    expect(reconcileRoadLive(selected, live(null)).step).toBe('prepare');
    const started = reconcileRoadLive(selected, live({ id: 'run-b', workflowId: 'workflow-a' }));
    expect(started.step).toBe('drive');
    expect(reconcileRoadLive(started, live(null)).step).toBe('results');
  });

  it('keeps local finish inputs for the same summary and run when a saved finish is refreshed', () => {
    const initial = createRoadValidationSession('workflow-a');
    const drafted = setRoadFinishDraft(initial, { ...createRoadFinishDraft(summary, finish), time: '1:24.000', clean: false });

    expect(roadFinishDraftFor(drafted, summary, finish)).toMatchObject({ time: '1:24.000', clean: false });
    expect(roadFinishDraftFor(drafted, { ...summary, id: 'summary-b', runId: 'run-b' })).toMatchObject({ time: '', clean: false });
    expect(roadFinishDraftFor(drafted, summary, { ...finish, id: 'finish-b', timeSeconds: 82.5 })).toMatchObject({ time: '1:24.000', clean: false });
    expect(roadFinishDraftFor(initial, summary, finish)).toMatchObject({ time: '83.456', clean: true });
  });

  it('preserves newer finish input through a delayed save and document readback', async () => {
    let completeSave!: (value: RoadFinish) => void;
    const save = new Promise<RoadFinish>(resolve => { completeSave = resolve; });
    let session = setRoadFinishDraft(createRoadValidationSession('workflow-a'), createRoadFinishDraft(summary, finish));
    session = startRoadOperation(session, 9, '/workflows/workflow-a/runs/run-a/finish');
    const settled = save.then(saved => {
      session = settleRoadOperation(session, 9, 'succeeded');
      return roadFinishDraftFor(session, summary, saved);
    });

    session = setRoadFinishDraft(session, { ...session.finishDraft!, time: '1:25.000', clean: false });
    completeSave({ ...finish, id: 'finish-b' });

    expect(await settled).toMatchObject({ time: '1:25.000', clean: false });
    expect(session.operation?.status).toBe('succeeded');
    expect(roadFinishDraftFor(selectRoadWorkflow(session, 'workflow-b'), { ...summary, id: 'summary-b', runId: 'run-b' }))
      .toMatchObject({ time: '', clean: false });
  });

  it('ignores a late operation completion after a newer operation has started', () => {
    const pending = startRoadOperation(createRoadValidationSession(), 4, '/workflows');
    const newer = startRoadOperation(pending, 5, '/workflows/workflow-a/runs');

    expect(settleRoadOperation(newer, 4, 'succeeded')).toBe(newer);
    expect(settleRoadOperation(newer, 5, 'succeeded').operation).toMatchObject({ id: 5, status: 'succeeded' });
  });

  it('keeps a pending backend operation visible while the user views another workflow', () => {
    const pending = startRoadOperation(createRoadValidationSession('workflow-a'), 7, '/workflows/workflow-a/runs');

    expect(selectRoadWorkflow(pending, 'workflow-b').operation).toMatchObject({ id: 7, status: 'pending' });
  });

  it('settles a pending operation without applying its late result after selection changes', () => {
    const pending = startRoadOperation(createRoadValidationSession('workflow-a'), 8, '/workflows/workflow-a/runs');

    expect(settleRoadOperation(selectRoadWorkflow(pending, 'workflow-b'), 8, 'succeeded').operation).toMatchObject({ status: 'succeeded' });
    expect(roadOperationResultApplies({ id: 8, selectionRevision: 0 }, 1)).toBe(false);
  });
});
