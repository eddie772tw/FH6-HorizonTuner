import React, { useState } from "react";
import type { AppVariant, SessionIntent } from "../../app/workspaceManifest";
import { useSettings } from "../../context/SettingsContext";
import DragTestView from "../drag_test/DragTestView";
import TelemetryView from "../telemetry/TelemetryView";

export interface LiveWorkspaceProps {
  readonly variant: AppVariant;
  readonly onOpenSessions: (intent?: SessionIntent) => void;
}

type FullLivePanel = "dashboard" | "launch-test";

/** Full owns Dashboard plus the existing launch-test flow; Lite is dashboard-only. */
export const LiveWorkspace: React.FC<LiveWorkspaceProps> = ({ variant, onOpenSessions }) => {
  const { t } = useSettings();
  const [panel, setPanel] = useState<FullLivePanel>("dashboard");

  if (variant === "lite") return <TelemetryView dashboardOnly />;

  return (
    <div className="d-flex flex-column h-100 gap-2">
      <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
        <div className="nav nav-pills gap-1" role="tablist">
          <button type="button" className={`nav-link btn-sm ${panel === "dashboard" ? "active fw-bold" : ""}`} onClick={() => setPanel("dashboard")}>
            {t("Dashboard")}
          </button>
          <button type="button" className={`nav-link btn-sm ${panel === "launch-test" ? "active fw-bold" : ""}`} onClick={() => setPanel("launch-test")}>
            {t("Drag Test")}
          </button>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onOpenSessions({ kind: "latest-analysis" })}>
          {t("Post-Race Analysis")}
        </button>
      </div>
      <div className="flex-grow-1 overflow-hidden">
        {panel === "dashboard" ? <TelemetryView /> : <DragTestView />}
      </div>
    </div>
  );
};
