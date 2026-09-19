import React, { useEffect } from "react";
import type { SessionIntent } from "../../app/workspaceManifest";
import AnalysisView from "../analysis/AnalysisView";
import { useSessionsState } from "./SessionsStateProvider";

export interface SessionRequest {
  readonly sequence: number;
  readonly target: SessionIntent;
}

export interface SessionsWorkspaceProps {
  readonly sessionRequest: SessionRequest | null;
  readonly onOpenTune: () => void;
}

/** The Road library attaches here in W3; it never shares analysis filenames. */
export const SessionsWorkspace: React.FC<SessionsWorkspaceProps> = ({ sessionRequest }) => {
  const { applySessionIntent } = useSessionsState();

  useEffect(() => {
    if (sessionRequest) void applySessionIntent(sessionRequest.target, sessionRequest.sequence);
  }, [applySessionIntent, sessionRequest]);

  return <AnalysisView />;
};
