import React from "react";
import type { AnalysisDataPoint } from "../../context/TelemetryRecorderContext";
import type { AnalysisMetric } from "../sessions/SessionsStateProvider";
import TrackMapCanvas from "./TrackMapCanvas";
import SessionHealthDebrief from "./SessionHealthDebrief";
import LapDeltaCanvas from "./LapDeltaCanvas";
import type { SessionDebriefData } from "./sessionDebriefMath";

export interface AnalysisSessionVisualsProps {
  readonly t: (text: string) => string;
  readonly isLoading: boolean;
  readonly activeSession: AnalysisDataPoint[];
  readonly activeCanvasData: Array<{ x: number; z: number; val: number; raw: AnalysisDataPoint }>;
  readonly baseCanvasData: Array<{ x: number; z: number; val: number; raw: AnalysisDataPoint }>;
  readonly compareSessionData: AnalysisDataPoint[];
  readonly fallbackDebrief: SessionDebriefData;
  readonly selectedMetric: AnalysisMetric;
  readonly primaryLap: number;
  readonly compareLap: number;
  readonly isRecording: boolean;
  readonly isSavedSession: boolean;
  readonly onSelectMetric: (metric: AnalysisMetric) => void;
}

const AnalysisSessionVisuals: React.FC<AnalysisSessionVisualsProps> = ({
  t,
  isLoading,
  activeSession,
  activeCanvasData,
  baseCanvasData,
  compareSessionData,
  fallbackDebrief,
  selectedMetric,
  primaryLap,
  compareLap,
  isRecording,
  isSavedSession,
  onSelectMetric,
}) => {
  if (isLoading) {
    return (
      <div className="glass-panel analysis-empty-state">
        {t("Loading Telemetry Data...")}
      </div>
    );
  }

  if (activeSession.length === 0) {
    return (
      <div className="glass-panel analysis-empty-state">
        {t("No data recorded. Start racing to record telemetry.")}
      </div>
    );
  }

  return (
    <>
      <SessionHealthDebrief debrief={fallbackDebrief} />
      <div className="analysis-charts">
        <div className="glass-panel" style={{ height: "360px", display: "flex", flexDirection: "column", padding: "1rem" }}>
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
            <span style={{ fontWeight: "bold", color: "var(--text-primary)", fontSize: "0.95rem" }}>{t("GPS Track Heatmap")}</span>
            <label className="d-flex align-items-center gap-2">
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Metric")}:</span>
              <select className="form-select form-select-sm" value={selectedMetric} onChange={event => onSelectMetric(event.target.value as AnalysisMetric)}>
                <option value="speed">{t("Speed")}</option>
                <option value="throttle">{t("Throttle")}</option>
                <option value="brake">{t("Brake")}</option>
                <option value="grip">{t("Grip Slip")}</option>
                <option value="suspension">{t("Suspension")}</option>
              </select>
            </label>
          </div>
          <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%", height: "100%" }}>
            <TrackMapCanvas
              data={activeCanvasData}
              fullTrackData={baseCanvasData}
              currentPlaybackIndex={-1}
              selectedMetricLabel={selectedMetric}
              isRecording={isRecording}
              isSavedSession={isSavedSession}
            />
          </div>
        </div>
        <LapDeltaCanvas
          primaryLapData={activeSession}
          compareLapData={compareSessionData}
          primaryLapNumber={primaryLap}
          compareLapNumber={compareLap}
        />
      </div>
    </>
  );
};

export default AnalysisSessionVisuals;
