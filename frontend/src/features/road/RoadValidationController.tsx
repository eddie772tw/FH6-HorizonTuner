import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { RoadFinish, RoadLive, RoadSummary } from './roadTypes';
import {
  ROAD_SELECTED_WORKFLOW_KEY,
  createRoadValidationSession,
  markRoadWorkflowCreated,
  observeRoadRunConfirmation,
  reconcileRoadLive,
  roadFinishDraftFor,
  roadOperationResultApplies,
  roadRunConfirmationFor,
  selectRoadWorkflow,
  setRoadCandidateDraft,
  setRoadChoiceSaved,
  setRoadFinishDraft,
  setRoadPrepareDraft,
  setRoadResultSelection,
  setRoadRunConfirmation,
  setRoadSetupId,
  setRoadStep,
  settleRoadOperation,
  startRoadOperation,
  type RoadCandidateDraft,
  type RoadFinishDraft,
  type RoadOperationState,
  type RoadPrepareDraft,
  type RoadResultSelection,
  type RoadRunConfirmation,
  type RoadRunConfirmationIdentity,
  type RoadValidationStep,
} from './roadValidationState';

export type {
  RoadCandidateDraft,
  RoadCandidateValues,
  RoadComparisonSelection,
  RoadFinishDraft,
  RoadOperationState,
  RoadPrepareDraft,
  RoadResultSelection,
  RoadRunConfirmation,
  RoadRunConfirmationIdentity,
  RoadValidationStep,
} from './roadValidationState';

export interface RoadValidationController {
  selectedWorkflowId: string;
  step: RoadValidationStep;
  setupId: string;
  choiceSaved: boolean;
  prepareDraft: RoadPrepareDraft;
  candidateDraft: RoadCandidateDraft | null;
  finishDraft: RoadFinishDraft | null;
  resultSelection: RoadResultSelection;
  activeRun: RoadLive['activeRun'];
  operation: RoadOperationState | null;
  selectWorkflow: (workflowId: string) => void;
  markWorkflowCreated: (workflowId: string) => void;
  setStep: (step: RoadValidationStep) => void;
  setSetupId: (setupId: string) => void;
  setChoiceSaved: (choiceSaved: boolean) => void;
  setPrepareDraft: (draft: RoadPrepareDraft) => void;
  setCandidateDraft: (draft: RoadCandidateDraft | null) => void;
  setFinishDraft: (draft: RoadFinishDraft | null) => void;
  finishDraftFor: (summary: RoadSummary, finish?: RoadFinish) => RoadFinishDraft;
  setResultSelection: (selection: RoadResultSelection) => void;
  runConfirmationFor: (identity: RoadRunConfirmationIdentity) => RoadRunConfirmation;
  observeRunConfirmation: (identity: RoadRunConfirmationIdentity) => void;
  setRunConfirmation: (identity: RoadRunConfirmationIdentity, confirmation: Pick<RoadRunConfirmation, 'confirmed' | 'unchanged'>) => void;
  reconcileLive: (live: RoadLive | null) => void;
  beginOperation: (kind: string) => number | null;
  finishOperation: (operationId: number, succeeded: boolean) => boolean;
}

const RoadValidationContext = createContext<RoadValidationController | null>(null);

function initialSelectedWorkflowId(): string {
  try {
    return localStorage.getItem(ROAD_SELECTED_WORKFLOW_KEY) || '';
  } catch {
    return '';
  }
}

export function RoadValidationProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState(() => createRoadValidationSession(initialSelectedWorkflowId()));
  const nextOperationId = useRef(0);
  const activeOperationId = useRef<number | null>(null);
  const activeOperationRevision = useRef<number | null>(null);
  const selectionRevision = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(ROAD_SELECTED_WORKFLOW_KEY, session.selectedWorkflowId);
    } catch {
      // Browser storage is an optional convenience. Road workflows remain backend-owned.
    }
  }, [session.selectedWorkflowId]);

  const selectWorkflow = useCallback((workflowId: string) => {
    selectionRevision.current += 1;
    setSession(previous => selectRoadWorkflow(previous, workflowId));
  }, []);

  const markWorkflowCreated = useCallback((workflowId: string) => {
    setSession(previous => markRoadWorkflowCreated(previous, workflowId));
  }, []);

  const setStep = useCallback((step: RoadValidationStep) => {
    selectionRevision.current += 1;
    setSession(previous => setRoadStep(previous, step));
  }, []);
  const setSetupId = useCallback((setupId: string) => {
    selectionRevision.current += 1;
    setSession(previous => setRoadSetupId(previous, setupId));
  }, []);
  const setChoiceSaved = useCallback((choiceSaved: boolean) => setSession(previous => setRoadChoiceSaved(previous, choiceSaved)), []);
  const setPrepareDraft = useCallback((draft: RoadPrepareDraft) => {
    selectionRevision.current += 1;
    setSession(previous => setRoadPrepareDraft(previous, draft));
  }, []);
  const setCandidateDraft = useCallback((draft: RoadCandidateDraft | null) => {
    selectionRevision.current += 1;
    setSession(previous => setRoadCandidateDraft(previous, draft));
  }, []);
  const setFinishDraft = useCallback((draft: RoadFinishDraft | null) => {
    selectionRevision.current += 1;
    setSession(previous => setRoadFinishDraft(previous, draft));
  }, []);
  const setResultSelection = useCallback((selection: RoadResultSelection) => {
    selectionRevision.current += 1;
    setSession(previous => setRoadResultSelection(previous, selection));
  }, []);
  const reconcileLive = useCallback((live: RoadLive | null) => setSession(previous => reconcileRoadLive(previous, live)), []);
  const runConfirmationFor = useCallback((identity: RoadRunConfirmationIdentity) => roadRunConfirmationFor(session, identity), [session]);
  const observeRunConfirmation = useCallback((identity: RoadRunConfirmationIdentity) => {
    setSession(previous => observeRoadRunConfirmation(previous, identity));
  }, []);
  const finishDraftFor = useCallback((summary: RoadSummary, finish?: RoadFinish) => roadFinishDraftFor(session, summary, finish), [session]);
  const setRunConfirmation = useCallback((identity: RoadRunConfirmationIdentity, confirmation: Pick<RoadRunConfirmation, 'confirmed' | 'unchanged'>) => {
    setSession(previous => setRoadRunConfirmation(previous, identity, confirmation));
  }, []);

  const beginOperation = useCallback((kind: string) => {
    if (activeOperationId.current !== null) return null;
    const id = ++nextOperationId.current;
    activeOperationId.current = id;
    activeOperationRevision.current = selectionRevision.current;
    setSession(previous => startRoadOperation(previous, id, kind));
    return id;
  }, []);

  const finishOperation = useCallback((operationId: number, succeeded: boolean) => {
    if (activeOperationId.current !== operationId) return false;
    const resultAppliesToCurrentSelection = roadOperationResultApplies({
      id: operationId,
      selectionRevision: activeOperationRevision.current ?? -1,
    }, selectionRevision.current);
    activeOperationId.current = null;
    activeOperationRevision.current = null;
    setSession(previous => settleRoadOperation(previous, operationId, succeeded ? 'succeeded' : 'failed'));
    return resultAppliesToCurrentSelection;
  }, []);

  const controller = useMemo<RoadValidationController>(() => ({
    selectedWorkflowId: session.selectedWorkflowId,
    step: session.step,
    setupId: session.setupId,
    choiceSaved: session.choiceSaved,
    prepareDraft: session.prepareDraft,
    candidateDraft: session.candidateDraft,
    finishDraft: session.finishDraft,
    resultSelection: session.resultSelection,
    activeRun: session.activeRun,
    operation: session.operation,
    selectWorkflow,
    markWorkflowCreated,
    setStep,
    setSetupId,
    setChoiceSaved,
    setPrepareDraft,
    setCandidateDraft,
    setFinishDraft,
    finishDraftFor,
    setResultSelection,
    runConfirmationFor,
    observeRunConfirmation,
    setRunConfirmation,
    reconcileLive,
    beginOperation,
    finishOperation,
  }), [
    beginOperation, finishDraftFor, finishOperation, markWorkflowCreated, observeRunConfirmation, reconcileLive, runConfirmationFor, selectWorkflow, session,
    setCandidateDraft, setChoiceSaved, setFinishDraft, setPrepareDraft, setResultSelection, setRunConfirmation, setSetupId, setStep,
  ]);

  return <RoadValidationContext.Provider value={controller}>{children}</RoadValidationContext.Provider>;
}

export function RoadValidationBoundary({ children }: PropsWithChildren) {
  const controller = useContext(RoadValidationContext);
  return controller ? <>{children}</> : <RoadValidationProvider>{children}</RoadValidationProvider>;
}

export function useRoadValidation(): RoadValidationController {
  const controller = useContext(RoadValidationContext);
  if (!controller) throw new Error('RoadValidationProvider is required to render Road validation state.');
  return controller;
}
