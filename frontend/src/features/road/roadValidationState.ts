import type { RoadFinish, RoadIdentity, RoadLive, RoadSetup, RoadSummary } from './roadTypes';

export const ROAD_SELECTED_WORKFLOW_KEY = 'road-selected-workflow';

export type RoadValidationStep = 'prepare' | 'drive' | 'results';

export interface RoadPrepareDraft {
  name: string;
  format: 'circuit' | 'sprint';
  conditions: string;
  assists: string;
  configuration: string;
  gameBuild: string;
}

export interface RoadCandidateValues {
  value: string;
  minimum: string;
  maximum: string;
  step: string;
}

export interface RoadCandidateDraft {
  runId: string;
  basisSetupId: string;
  parameter: string;
  unit: string;
  values: RoadCandidateValues;
  direction: -1 | 1;
  confirmed: boolean;
  hypothesis: string;
}

export interface RoadComparisonSelection {
  baselineRunId: string;
  candidateRunId: string;
  extraBaselineRunIds: string[];
  extraCandidateRunIds: string[];
}

export interface RoadResultSelection {
  selectedRunId: string;
  showCandidate: boolean;
  comparison: RoadComparisonSelection;
}

export interface RoadFinishDraft {
  summaryId: string;
  finishId: string | null;
  runId: string;
  time: string;
  clean: boolean;
}

export interface RoadRunConfirmationIdentity {
  workflowId: string;
  setupId: string;
  activeRunId: string | null;
  inputSnapshot: Record<string, unknown>;
  liveIdentity: RoadIdentity | null;
}

export interface RoadRunConfirmation {
  identityKey: string;
  confirmed: boolean;
  unchanged: boolean;
}

export interface RoadOperationState {
  id: number;
  kind: string;
  status: 'pending' | 'succeeded' | 'failed';
}

export interface RoadOperationLease {
  id: number;
  selectionRevision: number;
}

export interface RoadValidationSessionState {
  selectedWorkflowId: string;
  step: RoadValidationStep;
  setupId: string;
  choiceSaved: boolean;
  prepareDraft: RoadPrepareDraft;
  candidateDraft: RoadCandidateDraft | null;
  finishDraft: RoadFinishDraft | null;
  resultSelection: RoadResultSelection;
  runConfirmation: RoadRunConfirmation | null;
  activeRun: RoadLive['activeRun'];
  operation: RoadOperationState | null;
}

export const emptyRoadPrepareDraft = (): RoadPrepareDraft => ({
  name: '',
  format: 'circuit',
  conditions: '',
  assists: '',
  configuration: '',
  gameBuild: '',
});

export const emptyRoadResultSelection = (): RoadResultSelection => ({
  selectedRunId: '',
  showCandidate: false,
  comparison: {
    baselineRunId: '',
    candidateRunId: '',
    extraBaselineRunIds: [],
    extraCandidateRunIds: [],
  },
});

export function createRoadValidationSession(selectedWorkflowId = ''): RoadValidationSessionState {
  return {
    selectedWorkflowId,
    step: selectedWorkflowId ? 'results' : 'prepare',
    setupId: '',
    choiceSaved: false,
    prepareDraft: emptyRoadPrepareDraft(),
    candidateDraft: null,
    finishDraft: null,
    resultSelection: emptyRoadResultSelection(),
    runConfirmation: null,
    activeRun: null,
    operation: null,
  };
}

export function selectRoadWorkflow(state: RoadValidationSessionState, selectedWorkflowId: string): RoadValidationSessionState {
  return {
    ...state,
    selectedWorkflowId,
    step: selectedWorkflowId ? 'results' : 'prepare',
    setupId: '',
    choiceSaved: false,
    candidateDraft: null,
    finishDraft: null,
    resultSelection: emptyRoadResultSelection(),
    runConfirmation: null,
    operation: state.operation,
  };
}

export function markRoadWorkflowCreated(state: RoadValidationSessionState, workflowId: string): RoadValidationSessionState {
  return {
    ...selectRoadWorkflow(state, workflowId),
    step: 'drive',
    prepareDraft: emptyRoadPrepareDraft(),
  };
}

export function setRoadStep(state: RoadValidationSessionState, step: RoadValidationStep): RoadValidationSessionState {
  return { ...state, step };
}

export function setRoadPrepareDraft(state: RoadValidationSessionState, prepareDraft: RoadPrepareDraft): RoadValidationSessionState {
  return { ...state, prepareDraft };
}

export function setRoadSetupId(state: RoadValidationSessionState, setupId: string): RoadValidationSessionState {
  return { ...state, setupId, runConfirmation: setupId === state.setupId ? state.runConfirmation : null };
}

export function setRoadChoiceSaved(state: RoadValidationSessionState, choiceSaved: boolean): RoadValidationSessionState {
  return { ...state, choiceSaved };
}

export function createRoadCandidateDraft(runId: string, basis: RoadSetup): RoadCandidateDraft {
  const parameter = Object.keys(basis.fields)[0] || '';
  const field = basis.fields[parameter];
  return {
    runId,
    basisSetupId: basis.id,
    parameter,
    unit: field?.unit || '',
    values: {
      value: field ? String(field.value) : '',
      minimum: field?.minimum == null ? '' : String(field.minimum),
      maximum: field?.maximum == null ? '' : String(field.maximum),
      step: field?.step == null ? '' : String(field.step),
    },
    direction: 1,
    confirmed: false,
    hypothesis: '',
  };
}

export function setRoadCandidateDraft(state: RoadValidationSessionState, candidateDraft: RoadCandidateDraft | null): RoadValidationSessionState {
  return { ...state, candidateDraft };
}

export function createRoadFinishDraft(summary: RoadSummary, finish?: RoadFinish): RoadFinishDraft {
  return {
    summaryId: summary.id,
    finishId: finish?.id || null,
    runId: summary.runId,
    time: finish?.timeSeconds.toString() || '',
    clean: finish?.clean === 'confirmed',
  };
}

export function roadFinishDraftFor(state: RoadValidationSessionState, summary: RoadSummary, finish?: RoadFinish): RoadFinishDraft {
  const finishId = finish?.id || null;
  return state.finishDraft?.summaryId === summary.id && state.finishDraft.finishId === finishId
    ? state.finishDraft
    : createRoadFinishDraft(summary, finish);
}

export function setRoadFinishDraft(state: RoadValidationSessionState, finishDraft: RoadFinishDraft | null): RoadValidationSessionState {
  return { ...state, finishDraft };
}

export function setRoadResultSelection(state: RoadValidationSessionState, resultSelection: RoadResultSelection): RoadValidationSessionState {
  return { ...state, resultSelection };
}

export function roadRunConfirmationKey(identity: RoadRunConfirmationIdentity): string {
  return JSON.stringify({
    workflowId: identity.workflowId,
    setupId: identity.setupId,
    activeRunId: identity.activeRunId,
    inputSnapshot: identity.inputSnapshot,
    liveIdentity: identity.liveIdentity,
  });
}

export function roadRunConfirmationFor(state: RoadValidationSessionState, identity: RoadRunConfirmationIdentity): RoadRunConfirmation {
  const identityKey = roadRunConfirmationKey(identity);
  return state.runConfirmation?.identityKey === identityKey
    ? state.runConfirmation
    : { identityKey, confirmed: false, unchanged: false };
}

/** Remember a changed identity, so returning to an earlier value cannot revive its confirmation. */
export function observeRoadRunConfirmation(state: RoadValidationSessionState, identity: RoadRunConfirmationIdentity): RoadValidationSessionState {
  const confirmation = roadRunConfirmationFor(state, identity);
  return confirmation === state.runConfirmation ? state : { ...state, runConfirmation: confirmation };
}

export function setRoadRunConfirmation(
  state: RoadValidationSessionState,
  identity: RoadRunConfirmationIdentity,
  changes: Pick<RoadRunConfirmation, 'confirmed' | 'unchanged'>,
): RoadValidationSessionState {
  const current = roadRunConfirmationFor(state, identity);
  return {
    ...state,
    runConfirmation: {
      identityKey: current.identityKey,
      confirmed: changes.confirmed,
      unchanged: changes.unchanged,
    },
  };
}

export function reconcileRoadLive(state: RoadValidationSessionState, live: RoadLive | null): RoadValidationSessionState {
  const activeRun = live?.activeRun ?? null;
  const activeRunChanged = state.activeRun?.id !== activeRun?.id;
  const activeRunStartedForSelectedWorkflow = activeRun !== null && activeRun.workflowId === state.selectedWorkflowId
    && state.activeRun?.id !== activeRun.id;
  const activeRunFinishedForSelectedWorkflow = state.activeRun?.workflowId === state.selectedWorkflowId && activeRun === null;
  return {
    ...state,
    activeRun,
    runConfirmation: activeRunChanged ? null : state.runConfirmation,
    step: activeRunStartedForSelectedWorkflow ? 'drive' : activeRunFinishedForSelectedWorkflow ? 'results' : state.step,
  };
}

export function startRoadOperation(state: RoadValidationSessionState, id: number, kind: string): RoadValidationSessionState {
  return { ...state, operation: { id, kind, status: 'pending' } };
}

export function roadOperationResultApplies(lease: RoadOperationLease, selectionRevision: number): boolean {
  return lease.selectionRevision === selectionRevision;
}

export function settleRoadOperation(
  state: RoadValidationSessionState,
  id: number,
  status: Extract<RoadOperationState['status'], 'succeeded' | 'failed'>,
): RoadValidationSessionState {
  if (state.operation?.id !== id || state.operation.status !== 'pending') return state;
  return { ...state, operation: { ...state.operation, status } };
}
