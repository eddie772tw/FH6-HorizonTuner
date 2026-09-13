import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SessionIntent, WorkspaceId } from "../../app/workspaceManifest";
import { useSettings } from "../../context/SettingsContext";
import { type AnalysisDataPoint, type SavedSessionHeader } from "../../context/TelemetryRecorderContext";
import { backendFetch } from "../../services/backend";
import {
  type AnalysisRecordingStatus,
  type RaceCompletionReader,
} from "./raceCompletion";
import { RaceCompletionLifecycle } from "./raceLifecycle";
import { RaceStatusPoller } from "./raceStatusPoller";

export interface SessionsRuntimeProps {
  readonly activeWorkspace: WorkspaceId;
  readonly onOpenSessions: (intent?: SessionIntent, isRequestCurrent?: () => boolean) => void;
}

interface PendingCompletion {
  readonly sessionId: string;
  readonly intent: SessionIntent | null;
  readonly isCurrent?: () => boolean;
}

interface RuntimeRaceCompletionReader extends RaceCompletionReader {
  readStatus(signal?: AbortSignal): Promise<AnalysisRecordingStatus | null>;
}

function createRaceCompletionReader(): RuntimeRaceCompletionReader {
  return {
    async readStatus(signal?: AbortSignal): Promise<AnalysisRecordingStatus | null> {
      try {
        const response = await backendFetch("/api/analysis/status", { signal });
        if (!response.ok) return null;
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
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data as SavedSessionHeader[] : [];
      } catch {
        return [];
      }
    },
    async readSessionData(sessionId: string): Promise<AnalysisDataPoint[] | null> {
      try {
        const response = await backendFetch(`/api/analysis/sessions/${encodeURIComponent(sessionId)}?lap=0`);
        if (!response.ok) return null;
        const data = await response.json();
        return Array.isArray(data) ? data as AnalysisDataPoint[] : null;
      } catch {
        return null;
      }
    },
  };
}

export const SessionsRuntime: React.FC<SessionsRuntimeProps> = ({ activeWorkspace, onOpenSessions }) => {
  const { t } = useSettings();
  const activeWorkspaceRef = useRef(activeWorkspace);
  const onOpenSessionsRef = useRef(onOpenSessions);
  const [pending, setPending] = useState<PendingCompletion | null>(null);
  const lifecycleRef = useRef<RaceCompletionLifecycle | null>(null);

  // Completion may finish while a user changes workspace. Layout timing keeps
  // the Live-only auto-open decision current before a poll callback can act.
  useLayoutEffect(() => {
    activeWorkspaceRef.current = activeWorkspace;
    onOpenSessionsRef.current = onOpenSessions;
  }, [activeWorkspace, onOpenSessions]);

  useEffect(() => {
    const reader = createRaceCompletionReader();
    const lifecycle = new RaceCompletionLifecycle(reader, {
      onStarted: () => setPending(null),
      onPending: sessionId => setPending({ sessionId, intent: null }),
      onCompleted: (completed, isCurrent) => {
        const intent: SessionIntent = { kind: "analysis", filename: completed.filename };
        if (activeWorkspaceRef.current === "live") {
          setPending(null);
          onOpenSessionsRef.current(intent, isCurrent);
          return;
        }
        setPending({ sessionId: completed.session_id, intent, isCurrent });
      },
    });
    const statusPoller = new RaceStatusPoller(
      signal => reader.readStatus(signal),
      status => lifecycle.observeStatus(status),
    );
    lifecycleRef.current = lifecycle;
    statusPoller.start();
    return () => {
      statusPoller.dispose();
      lifecycle.dispose();
      lifecycleRef.current = null;
    };
  }, []);

  if (!pending) return null;
  const openOrRetry = () => {
    if (pending.intent) {
      onOpenSessions(pending.intent, pending.isCurrent);
      // Shell now owns this explicit request, including its failure/retry UI.
      setPending(null);
    }
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
