import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { RoadLive } from './roadTypes';
import {
  ROAD_SELECTED_WORKFLOW_KEY,
  createRoadValidationSession,
  markRoadWorkflowCreated,
  reconcileRoadLive,
  roadRunConfirmationFor,
  selectRoadWorkflow,
  setRoadCandidateDraft,
  setRoadChoiceSaved,
  setRoadPrepareDraft,
  setRoadResultSelection,
  setRoadRunConfirmation,
  setRoadSetupId,
  setRoadStep,
  settleRoadOperation,
  startRoadOperation,
  type RoadCandidateDraft,
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
  setResultSelection: (selection: RoadResultSelection) => void;
  runConfirmationFor: (identity: RoadRunConfirmationIdentity) => RoadRunConfirmation;
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

  useEffect(() => {
    try {
      localStorage.setItem(ROAD_SELECTED_WORKFLOW_KEY, session.selectedWorkflowId);
    } catch {
      // Browser storage is an optional convenience. Road workflows remain backend-owned.
    }
  }, [session.selectedWorkflowId]);

  const invalidatePendingOperation = useCallback(() => {
    activeOperationId.current = null;
  }, []);

  const selectWorkflow = useCallback((workflowId: string) => {
    invalidatePendingOperation();
    setSession(previous => selectRoadWorkflow(previous, workflowId));
  }, [invalidatePendingOperation]);

  const markWorkflowCreated = useCallback((workflowId: string) => {
    invalidatePendingOperation();
    setSession(previous => markRoadWorkflowCreated(previous, workflowId));
  }, [invalidatePendingOperation]);

  const setStep = useCallback((step: RoadValidationStep) => setSession(previous => setRoadStep(previous, step)), []);
  const setSetupId = useCallback((setupId: string) => setSession(previous => setRoadSetupId(previous, setupId)), []);
  const setChoiceSaved = useCallback((choiceSaved: boolean) => setSession(previous => setRoadChoiceSaved(previous, choiceSaved)), []);
  const setPrepareDraft = useCallback((draft: RoadPrepareDraft) => setSession(previous => setRoadPrepareDraft(previous, draft)), []);
  const setCandidateDraft = useCallback((draft: RoadCandidateDraft | null) => setSession(previous => setRoadCandidateDraft(previous, draft)), []);
  const setResultSelection = useCallback((selection: RoadResultSelection) => setSession(previous => setRoadResultSelection(previous, selection)), []);
  const reconcileLive = useCallback((live: RoadLive | null) => setSession(previous => reconcileRoadLive(previous, live)), []);
  const runConfirmationFor = useCallback((identity: RoadRunConfirmationIdentity) => roadRunConfirmationFor(session, identity), [session]);
  const setRunConfirmation = useCallback((identity: RoadRunConfirmationIdentity, confirmation: Pick<RoadRunConfirmation, 'confirmed' | 'unchanged'>) => {
    setSession(previous => setRoadRunConfirmation(previous, identity, confirmation));
  }, []);

  const beginOperation = useCallback((kind: string) => {
    if (activeOperationId.current !== null) return null;
    const id = ++nextOperationId.current;
    activeOperationId.current = id;
    setSession(previous => startRoadOperation(previous, id, kind));
    return id;
  }, []);

  const finishOperation = useCallback((operationId: number, succeeded: boolean) => {
    if (activeOperationId.current !== operationId) return false;
    activeOperationId.current = null;
    setSession(previous => settleRoadOperation(previous, operationId, succeeded ? 'succeeded' : 'failed'));
    return true;
  }, []);

  const controller = useMemo<RoadValidationController>(() => ({
    selectedWorkflowId: session.selectedWorkflowId,
    step: session.step,
    setupId: session.setupId,
    choiceSaved: session.choiceSaved,
    prepareDraft: session.prepareDraft,
    candidateDraft: session.candidateDraft,
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
    setResultSelection,
    runConfirmationFor,
    setRunConfirmation,
    reconcileLive,
    beginOperation,
    finishOperation,
  }), [
    beginOperation, finishOperation, markWorkflowCreated, reconcileLive, runConfirmationFor, selectWorkflow, session,
    setCandidateDraft, setChoiceSaved, setPrepareDraft, setResultSelection, setRunConfirmation, setSetupId, setStep,
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
