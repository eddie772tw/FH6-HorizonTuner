import React from "react";
import type { WorkspaceProps } from "../../app/AppShell";
import AnalysisView from "../analysis/AnalysisView";

/** The Road library attaches here in W3; it never shares analysis filenames. */
export const SessionsWorkspace: React.FC<WorkspaceProps> = () => <AnalysisView />;
