import type { RoadIdentity, RoadLive, RoadSetup } from './roadTypes';

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

export interface RoadValidationSessionState {
  selectedWorkflowId: string;
  step: RoadValidationStep;
  setupId: string;
  choiceSaved: boolean;
  prepareDraft: RoadPrepareDraft;
  candidateDraft: RoadCandidateDraft | null;
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
    resultSelection: emptyRoadResultSelection(),
    runConfirmation: null,
    operation: null,
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
  return { ...state, setupId };
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
  return {
    ...state,
    activeRun,
    runConfirmation: activeRunChanged ? null : state.runConfirmation,
    step: activeRun?.workflowId === state.selectedWorkflowId ? 'drive' : state.step,
  };
}

export function startRoadOperation(state: RoadValidationSessionState, id: number, kind: string): RoadValidationSessionState {
  return { ...state, operation: { id, kind, status: 'pending' } };
}

export function settleRoadOperation(
  state: RoadValidationSessionState,
  id: number,
  status: Extract<RoadOperationState['status'], 'succeeded' | 'failed'>,
): RoadValidationSessionState {
  if (state.operation?.id !== id || state.operation.status !== 'pending') return state;
  return { ...state, operation: { ...state.operation, status } };
}
