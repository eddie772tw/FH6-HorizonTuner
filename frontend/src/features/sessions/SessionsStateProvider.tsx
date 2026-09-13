import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisDataPoint, SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import { useTelemetryRecorder } from "../../context/TelemetryRecorderContext";
import { backendFetch } from "../../services/backend";
import type { SessionIntent } from "../../app/workspaceManifest";
import {
  analysisSelectionKey,
  analysisSessionId,
  shouldConsumeSessionRequest,
  type AnalysisSelection,
  readSelectionData,
  SessionLoadGate,
} from "./sessionSelection";

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
  setImportedSession(data: AnalysisDataPoint[]): void;
  applySessionIntent(intent: SessionIntent, sequence?: number): Promise<void>;
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

async function readSavedSessionHeaders(): Promise<SavedSessionHeader[]> {
  try {
    const response = await backendFetch("/api/analysis/sessions");
    const data = await response.json();
    return Array.isArray(data) ? data as SavedSessionHeader[] : [];
  } catch {
    return [];
  }
}

export const SessionsStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { savedSessions, setLoadedSession } = useTelemetryRecorder();
  const [state, setState] = useState<SessionsViewState>(initialState);
  const stateRef = useRef(state);
  const primaryGateRef = useRef(new SessionLoadGate());
  const primaryInFlightRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const intentGenerationRef = useRef(0);
  const consumedIntentSequenceRef = useRef<number | null>(null);
  stateRef.current = state;

  useEffect(() => () => primaryGateRef.current.dispose(), []);

  const invalidateSelectionRequest = useCallback(() => {
    intentGenerationRef.current += 1;
    primaryGateRef.current.invalidate();
  }, []);

  const chooseSelection = useCallback((selection: AnalysisSelection) => {
    invalidateSelectionRequest();
    // A selection change must not keep rendering data from the previous
    // source if the new read fails or is still finalizing.
    setLoadedSession(null);
    setState(previous => ({
      ...previous,
      selection,
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

  const setImportedSession = useCallback((data: AnalysisDataPoint[]) => {
    invalidateSelectionRequest();
    setLoadedSession(data);
    setState(previous => ({
      ...previous,
      selection: { kind: "local" },
      primaryLap: 0,
      compareLap: -1,
      isLoading: false,
    }));
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

  const applySessionIntent = useCallback(async (intent: SessionIntent, sequence?: number): Promise<void> => {
    if (sequence !== undefined) {
      if (!shouldConsumeSessionRequest(consumedIntentSequenceRef.current, sequence)) return;
      consumedIntentSequenceRef.current = sequence;
    }
    if (intent.kind === "road") {
      setState(previous => ({ ...previous, roadWorkflowId: intent.workflowId }));
      return;
    }
    if (intent.kind === "analysis") {
      chooseSelection({ kind: "saved", filename: intent.filename });
      return;
    }

    const generation = ++intentGenerationRef.current;
    const latest = savedSessions[0] ?? (await readSavedSessionHeaders())[0];
    if (!latest || generation !== intentGenerationRef.current) return;
    chooseSelection({ kind: "latest", filename: latest.filename });
  }, [chooseSelection, savedSessions]);

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
      setImportedSession,
      applySessionIntent,
      loadPrimaryLap,
      cancelPrimaryLoad,
      refreshCurrent,
    };
  }, [applySessionIntent, cancelPrimaryLoad, loadPrimaryLap, refreshCurrent, selectCurrent, selectSaved, setCompareLap, setImportedSession, setMetric, setPrimaryLap, state]);

  return <SessionsStateContext.Provider value={value}>{children}</SessionsStateContext.Provider>;
};

export function useSessionsState(): SessionsStateContextValue {
  const context = useContext(SessionsStateContext);
  if (!context) throw new Error("useSessionsState must be used within SessionsStateProvider");
  return context;
}
