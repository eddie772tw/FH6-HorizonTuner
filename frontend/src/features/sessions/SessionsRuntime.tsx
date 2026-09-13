import React, { useEffect, useRef, useState } from "react";
import type { SessionIntent, WorkspaceId } from "../../app/workspaceManifest";
import { useSettings } from "../../context/SettingsContext";
import { type AnalysisDataPoint, type SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import { useTelemetry } from "../../hooks/useTelemetry";
import { backendFetch } from "../../services/backend";
import {
  type AnalysisRecordingStatus,
  type RaceCompletionReader,
} from "./raceCompletion";
import { RaceCompletionLifecycle } from "./raceLifecycle";

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
  const { t } = useSettings();
  const wasRacingRef = useRef(false);
  const activeWorkspaceRef = useRef(activeWorkspace);
  const onOpenSessionsRef = useRef(onOpenSessions);
  const [pending, setPending] = useState<PendingCompletion | null>(null);
  const lifecycleRef = useRef<RaceCompletionLifecycle | null>(null);

  useEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
    onOpenSessionsRef.current = onOpenSessions;
  }, [activeWorkspace, onOpenSessions]);

  const isRacing = telemetryData?.IsRaceOn === 1;
  useEffect(() => {
    // The effect owns the observer. StrictMode cleanup must be followed by a
    // new observer, including a fresh edge when mounting during a race.
    const lifecycle = new RaceCompletionLifecycle(createRaceCompletionReader(), {
      onPending: sessionId => setPending({ sessionId, intent: null }),
      onCompleted: completed => {
        const intent: SessionIntent = { kind: "analysis", filename: completed.filename };
        if (activeWorkspaceRef.current === "live") {
          setPending(null);
          onOpenSessionsRef.current(intent);
          return;
        }
        setPending({ sessionId: completed.session_id, intent });
      },
    });
    lifecycleRef.current = lifecycle;
    wasRacingRef.current = false;
    return () => {
      lifecycle.dispose();
      lifecycleRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!wasRacingRef.current && isRacing) {
      setPending(null);
      lifecycleRef.current?.beginRace();
    }
    if (wasRacingRef.current && !isRacing) {
      lifecycleRef.current?.endRace();
    }
    wasRacingRef.current = isRacing;
  }, [isRacing]);

  if (!pending || (activeWorkspace === "live" && pending.intent)) return null;
  const openOrRetry = () => {
    if (pending.intent) onOpenSessions(pending.intent);
    else lifecycleRef.current?.retry(pending.sessionId);
  };
  return (
    <div className="position-fixed bottom-0 end-0 m-3 p-3 glass-panel shadow" style={{ zIndex: 1050, maxWidth: "22rem" }} role="status">
      <div className="fw-semibold">{pending.intent ? t("Post-Race Analysis") : t("Loading Telemetry Data...")}</div>
      <button type="button" className="btn btn-sm btn-primary mt-2" onClick={openOrRetry}>
        {pending.intent ? t("Post-Race Analysis") : t("Retry")}
      </button>
    </div>
  );
};
