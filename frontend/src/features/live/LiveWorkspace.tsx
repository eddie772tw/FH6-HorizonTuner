import React, { useId, useRef, useState, type KeyboardEvent } from "react";
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
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const panels = ['dashboard', 'launch-test'] as const;
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1
      : event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? 1 - index : null;
    if (next === null) return;
    event.preventDefault();
    setPanel(panels[next]);
    tabs.current[next]?.focus();
  };

  if (variant === "lite") return <TelemetryView dashboardOnly />;

  return (
    <div className="live-workspace d-flex flex-column h-100 gap-2">
      <div className="workspace-toolbar flex-shrink-0">
        <div className="nav nav-pills gap-1" role="tablist" aria-label={t('Live')}>
          {panels.map((value, index) => <button key={value} type="button" role="tab"
            id={`${id}-tab-${value}`} aria-controls={`${id}-panel-${value}`} aria-selected={panel === value}
            tabIndex={panel === value ? 0 : -1} ref={element => { tabs.current[index] = element; }}
            onKeyDown={event => onTabKey(event, index)}
            className={`nav-link btn-sm ${panel === value ? 'active fw-bold' : ''}`} onClick={() => setPanel(value)}>
            {t(value === 'dashboard' ? 'Dashboard' : 'Drag Test')}
          </button>)}
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onOpenSessions({ kind: "latest-analysis" })}>
          {t("Post-Race Analysis")}
        </button>
      </div>
      {panels.map(value => <div key={value} id={`${id}-panel-${value}`} role="tabpanel"
        aria-labelledby={`${id}-tab-${value}`} tabIndex={0} hidden={panel !== value}
        className="live-workspace-panel flex-grow-1 overflow-hidden">
        {panel === value && (value === 'dashboard' ? <TelemetryView /> : <DragTestView />)}
      </div>)}
    </div>
  );
};
