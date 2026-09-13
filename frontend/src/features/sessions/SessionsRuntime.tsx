import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SessionIntent, WorkspaceId } from "../../app/workspaceManifest";
import { useSettings } from "../../context/SettingsContext";
import { useTelemetryRecorder, type AnalysisDataPoint, type SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import { useTelemetry } from "../../hooks/useTelemetry";
import { backendFetch } from "../../services/backend";
import {
  type AnalysisRecordingStatus,
  type RaceCompletionReader,
  waitForCompletedRaceSession,
} from "./raceCompletion";

export interface SessionsRuntimeProps {
  readonly activeWorkspace: WorkspaceId;
  readonly onOpenSessions: (intent?: SessionIntent) => void;
}

interface PendingCompletion {
  readonly sessionId: string;
  readonly intent: SessionIntent | null;
}

function createRaceCompletionReader(): RaceCompletionReader {
  return {
    async readStatus(): Promise<AnalysisRecordingStatus | null> {
      try {
        const response = await backendFetch("/api/analysis/status");
        const data = await response.json() as Partial<AnalysisRecordingStatus>;
        return typeof data.isRecording === "boolean"
          ? { isRecording: data.isRecording, currentSessionId: typeof data.currentSessionId === "string" ? data.currentSessionId : null }
          : null;
      } catch {
        return null;
      }
    },
    async readSessions(): Promise<readonly SavedSessionHeader[]> {
      try {
        const response = await backendFetch("/api/analysis/sessions");
        const data = await response.json();
        return Array.isArray(data) ? data as SavedSessionHeader[] : [];
      } catch {
        return [];
      }
    },
    async readSessionData(sessionId: string): Promise<AnalysisDataPoint[] | null> {
      try {
        const response = await backendFetch(`/api/analysis/sessions/${encodeURIComponent(sessionId)}?lap=0`);
        const data = await response.json();
        return Array.isArray(data) ? data as AnalysisDataPoint[] : null;
      } catch {
        return null;
      }
    },
  };
}

export const SessionsRuntime: React.FC<SessionsRuntimeProps> = ({ activeWorkspace, onOpenSessions }) => {
  const { data: telemetryData } = useTelemetry();
  const { currentSessionId } = useTelemetryRecorder();
  const { t } = useSettings();
  const wasRacingRef = useRef(false);
  const recordingSessionIdRef = useRef<string | null>(null);
  const completionGenerationRef = useRef(0);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const onOpenSessionsRef = useRef(onOpenSessions);
  const [pending, setPending] = useState<PendingCompletion | null>(null);

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
    onOpenSessionsRef.current = onOpenSessions;
  }, [activeWorkspace, onOpenSessions]);

  const runCompletionCheck = useCallback(async (sessionId: string) => {
    const generation = ++completionGenerationRef.current;
    setPending({ sessionId, intent: null });
    const completed = await waitForCompletedRaceSession(createRaceCompletionReader(), sessionId, {
      isCurrent: () => generation === completionGenerationRef.current,
    });
    if (generation !== completionGenerationRef.current) return;
    if (!completed) {
      setPending({ sessionId, intent: null });
      return;
    }
    const intent: SessionIntent = { kind: "analysis", filename: completed.filename };
    if (activeWorkspaceRef.current === "live") {
      setPending(null);
      onOpenSessionsRef.current(intent);
      return;
    }
    setPending({ sessionId, intent });
  }, []);

  const isRacing = telemetryData?.IsRaceOn === 1;
  useEffect(() => {
    if (isRacing && currentSessionId) recordingSessionIdRef.current = currentSessionId;
  }, [currentSessionId, isRacing]);

  useEffect(() => {
    if (!wasRacingRef.current && isRacing) {
      const generation = ++completionGenerationRef.current;
      recordingSessionIdRef.current = null;
      setPending(null);
      void createRaceCompletionReader().readStatus().then(status => {
        if (generation === completionGenerationRef.current && status?.isRecording && status.currentSessionId) {
          recordingSessionIdRef.current = status.currentSessionId;
        }
      });
    }
    if (wasRacingRef.current && !isRacing) {
      const sessionId = recordingSessionIdRef.current;
      if (sessionId) void runCompletionCheck(sessionId);
    }
    wasRacingRef.current = isRacing;
  }, [isRacing, runCompletionCheck]);

  useEffect(() => () => {
    completionGenerationRef.current += 1;
  }, []);

  if (!pending || (activeWorkspace === "live" && pending.intent)) return null;
  const openOrRetry = () => {
    if (pending.intent) onOpenSessions(pending.intent);
    else void runCompletionCheck(pending.sessionId);
  };
  return (
    <div className="position-fixed bottom-0 end-0 m-3 p-3 glass-panel shadow" style={{ zIndex: 1050, maxWidth: "22rem" }} role="status">
      <div className="fw-semibold">{pending.intent ? t("Post-Race Analysis") : t("Loading Telemetry Data...")}</div>
      <button type="button" className="btn btn-sm btn-primary mt-2" onClick={openOrRetry}>
        {pending.intent ? t("Post-Race Analysis") : "Retry"}
      </button>
    </div>
  );
};
