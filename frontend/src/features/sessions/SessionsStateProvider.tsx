import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisDataPoint } from "../../context/TelemetryRecorderContext";
import { useTelemetryRecorder } from "../../context/TelemetryRecorderContext";
import { backendFetch } from "../../services/backend";
import type { SessionIntent } from "../../app/workspaceManifest";
import {
  analysisSelectionKey,
  analysisSessionId,
  type AnalysisSelection,
  readSelectionData,
  SessionLoadGate,
  SessionOperationGate,
  type SessionOperationGuard,
} from "./sessionSelection";
import { prepareAnalysisSessionIntent } from "./sessionIntentPreparation";
import { createSessionsIo } from "./sessionsIo";

export type AnalysisMetric = "speed" | "throttle" | "brake" | "grip" | "suspension";

export interface SessionsViewState {
  readonly selection: AnalysisSelection;
  readonly primaryLap: number;
  readonly compareLap: number;
  readonly metric: AnalysisMetric;
  readonly roadWorkflowId: string | null;
  readonly isLoading: boolean;
}

interface SessionsStateContextValue {
  readonly state: SessionsViewState;
  readonly selectedFilename: string;
  readonly selectedSessionId: string | null;
  readonly isSavedSelection: boolean;
  selectCurrent(): void;
  selectSaved(filename: string): void;
  setPrimaryLap(lap: number): void;
  setCompareLap(lap: number): void;
  setMetric(metric: AnalysisMetric): void;
  beginSelectionOperation(): SessionOperationGuard;
  setImportedSession(data: AnalysisDataPoint[], operation: SessionOperationGuard): boolean;
  applySessionIntent(intent: SessionIntent, isNavigationCurrent?: () => boolean): Promise<boolean>;
  loadPrimaryLap(): Promise<AnalysisDataPoint[] | null>;
  cancelPrimaryLoad(): void;
  refreshCurrent(): Promise<AnalysisDataPoint[] | null>;
}

const SessionsStateContext = createContext<SessionsStateContextValue | undefined>(undefined);

const initialState: SessionsViewState = {
  selection: { kind: "current" },
  primaryLap: 0,
  compareLap: -1,
  metric: "speed",
  roadWorkflowId: null,
  isLoading: false,
};

function normalizeLap(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= -1 ? value : fallback;
}

export const SessionsStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { fetchSavedSessionsList, setLoadedSession } = useTelemetryRecorder();
  const [state, setState] = useState<SessionsViewState>(initialState);
  const stateRef = useRef(state);
  const primaryGateRef = useRef(new SessionLoadGate());
  const selectionOperationGateRef = useRef(new SessionOperationGate());
  const primaryInFlightRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const intentGenerationRef = useRef(0);
  stateRef.current = state;

  useEffect(() => {
    const primary = primaryGateRef.current;
    const operations = selectionOperationGateRef.current;
    primary.activate();
    operations.activate();
    return () => {
      primary.dispose();
      operations.dispose();
    };
  }, []);

  const invalidateSelectionRequest = useCallback(() => {
    intentGenerationRef.current += 1;
    primaryGateRef.current.invalidate();
    selectionOperationGateRef.current.invalidate();
  }, []);

  const chooseSelection = useCallback((selection: AnalysisSelection) => {
    invalidateSelectionRequest();
    // A selection change must not keep rendering data from the previous
    // source if the new read fails or is still finalizing.
    setLoadedSession(null);
    setState(previous => ({
      ...previous,
      selection,
      roadWorkflowId: null,
      primaryLap: 0,
      compareLap: -1,
      isLoading: selection.kind !== "local",
    }));
  }, [invalidateSelectionRequest, setLoadedSession]);

  const selectCurrent = useCallback(() => chooseSelection({ kind: "current" }), [chooseSelection]);
  const selectSaved = useCallback((filename: string) => {
    if (filename) chooseSelection({ kind: "saved", filename });
  }, [chooseSelection]);

  const setPrimaryLap = useCallback((lap: number) => {
    const normalized = normalizeLap(lap, 0);
    if (normalized < 0) return;
    primaryGateRef.current.invalidate();
    setState(previous => previous.primaryLap === normalized
      ? previous
      : { ...previous, primaryLap: normalized, isLoading: previous.selection.kind !== "local" });
  }, []);

  const setCompareLap = useCallback((lap: number) => {
    setState(previous => ({ ...previous, compareLap: normalizeLap(lap, -1) }));
  }, []);

  const setMetric = useCallback((metric: AnalysisMetric) => {
    setState(previous => previous.metric === metric ? previous : { ...previous, metric });
  }, []);

  const beginSelectionOperation = useCallback(() => selectionOperationGateRef.current.begin(), []);

  const setImportedSession = useCallback((data: AnalysisDataPoint[], operation: SessionOperationGuard): boolean => {
    if (!operation.isCurrent()) return false;
    invalidateSelectionRequest();
    setLoadedSession(data);
    setState(previous => ({
      ...previous,
      selection: { kind: "local" },
      roadWorkflowId: null,
      primaryLap: 0,
      compareLap: -1,
      isLoading: false,
    }));
    return true;
  }, [invalidateSelectionRequest, setLoadedSession]);

  const loadPrimaryLap = useCallback(async (): Promise<AnalysisDataPoint[] | null> => {
    const snapshot = stateRef.current;
    if (snapshot.selection.kind === "local") return null;
    const selectionKey = analysisSelectionKey(snapshot.selection);
    const requestedLap = snapshot.primaryLap;
    const guard = primaryGateRef.current.begin();
    primaryInFlightRef.current += 1;
    setState(previous => analysisSelectionKey(previous.selection) === selectionKey && previous.primaryLap === requestedLap
      ? { ...previous, isLoading: true }
      : previous);
    try {
      const data = await readSelectionData(
        {
          read: async (path, signal) => {
            const response = await backendFetch(path, { signal });
            return response.json();
          },
        },
        snapshot.selection,
        requestedLap,
        guard,
      );
      const current = stateRef.current;
      if (!data || !guard.isCurrent() || analysisSelectionKey(current.selection) !== selectionKey || current.primaryLap !== requestedLap) {
        return null;
      }
      setLoadedSession(data);
      return data;
    } finally {
      primaryInFlightRef.current -= 1;
      if (guard.isCurrent()) {
        setState(previous => analysisSelectionKey(previous.selection) === selectionKey && previous.primaryLap === requestedLap
          ? { ...previous, isLoading: false }
          : previous);
      }
    }
  }, [setLoadedSession]);

  const refreshCurrent = useCallback(async (): Promise<AnalysisDataPoint[] | null> => {
    if (stateRef.current.selection.kind !== "current" || refreshInFlightRef.current || primaryInFlightRef.current > 0) {
      return null;
    }
    refreshInFlightRef.current = true;
    try {
      return await loadPrimaryLap();
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [loadPrimaryLap]);

  const cancelPrimaryLoad = useCallback(() => {
    primaryGateRef.current.invalidate();
  }, []);

  const applySessionIntent = useCallback(async (
    intent: SessionIntent,
    isNavigationCurrent: () => boolean = () => true,
  ): Promise<boolean> => {
    const operation = beginSelectionOperation();
    const isCurrent = () => operation.isCurrent() && isNavigationCurrent();
    if (!isCurrent()) return false;

    if (intent.kind === "road") {
      // Road has its own workflow contract in W3. Invalidate an older analysis
      // request before remembering its independent identifier so a late
      // primary read cannot overwrite the next review surface.
      invalidateSelectionRequest();
      setState(previous => ({ ...previous, roadWorkflowId: intent.workflowId }));
      return true;
    }

    return prepareAnalysisSessionIntent(intent, {
      io: createSessionsIo(),
      operation,
      isNavigationCurrent,
      refreshLibrary: fetchSavedSessionsList,
      apply: ({ selection, samples }) => {
        // There are no awaits between this final ownership check and the two
        // related writes, so selection and its verified samples move together.
        if (!isCurrent()) return;
        invalidateSelectionRequest();
        setLoadedSession(samples);
        setState(previous => ({
          ...previous,
          selection,
          roadWorkflowId: null,
          primaryLap: 0,
          compareLap: -1,
          isLoading: false,
        }));
      },
    });
  }, [beginSelectionOperation, fetchSavedSessionsList, invalidateSelectionRequest, setLoadedSession]);

  const value = useMemo<SessionsStateContextValue>(() => {
    const selectedSessionId = analysisSessionId(state.selection);
    return {
      state,
      selectedFilename: selectedSessionId ?? "local",
      selectedSessionId,
      isSavedSelection: state.selection.kind === "saved" || state.selection.kind === "latest",
      selectCurrent,
      selectSaved,
      setPrimaryLap,
      setCompareLap,
      setMetric,
      beginSelectionOperation,
      setImportedSession,
      applySessionIntent,
      loadPrimaryLap,
      cancelPrimaryLoad,
      refreshCurrent,
    };
  }, [applySessionIntent, beginSelectionOperation, cancelPrimaryLoad, loadPrimaryLap, refreshCurrent, selectCurrent, selectSaved, setCompareLap, setImportedSession, setMetric, setPrimaryLap, state]);

  return <SessionsStateContext.Provider value={value}>{children}</SessionsStateContext.Provider>;
};

export function useSessionsState(): SessionsStateContextValue {
  const context = useContext(SessionsStateContext);
  if (!context) throw new Error("useSessionsState must be used within SessionsStateProvider");
  return context;
}
