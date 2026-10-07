import React from "react";
import { getRuntimeCapabilities } from '../../services/runtimeCapabilities';
import type { SavedSessionHeader, LapSummary } from "../../context/TelemetryRecorderContext";

export interface AnalysisSessionToolbarProps {
  readonly t: (text: string) => string;
  readonly isRecording: boolean;
  readonly recordingCount: number;
  readonly activeSessionLength: number;
  readonly selectedFilename: string;
  readonly savedSessions: SavedSessionHeader[];
  readonly lapsList: LapSummary[];
  readonly primaryLap: number;
  readonly compareLap: number;
  readonly isSavedSelection: boolean;
  readonly motecActionMsg: string | null;
  readonly isExporting?: boolean;
  readonly fileInputRef: React.RefObject<HTMLInputElement | null>;
  readonly onSelectSession: (filename: string) => void;
  readonly onSelectPrimaryLap: (lap: number) => void;
  readonly onSelectCompareLap: (lap: number) => void;
  readonly onOpenInMoTec: () => void;
  readonly onExportMoTec: () => void;
  readonly onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onOpenImport: () => void;
  readonly onDownloadTemplate: () => void;
  readonly onOpenChannelMapping?: () => void;
  readonly onDeleteSession: () => void;
  readonly onCloseMessage: () => void;
  readonly onLatestAnalysis: () => void;
}

const AnalysisSessionToolbar: React.FC<AnalysisSessionToolbarProps> = ({
  t,
  isRecording,
  recordingCount,
  activeSessionLength,
  selectedFilename,
  savedSessions,
  lapsList,
  primaryLap,
  compareLap,
  isSavedSelection,
  motecActionMsg,
  isExporting = false,
  fileInputRef,
  onSelectSession,
  onSelectPrimaryLap,
  onSelectCompareLap,
  onOpenInMoTec,
  onExportMoTec,
  onImportFile,
  onOpenImport,
  onDownloadTemplate,
  onOpenChannelMapping,
  onDeleteSession,
  onCloseMessage,
  onLatestAnalysis,
}) => (
  <>
    <div className="workspace-toolbar analysis-toolbar">
      <div className="analysis-toolbar__status" role="status">
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          {t("Status")}: {isRecording ? (
            <span className="text-danger fw-bold">
              {t("Recording...")} ({recordingCount} {t("samples")})
            </span>
          ) : (
            `${t("Idle")} (${activeSessionLength} ${t("samples")})`
          )}
          {selectedFilename !== "current" && selectedFilename !== "local" &&
            ` | ${t("Loaded Session")}: ${selectedFilename}`}
        </div>
      </div>

      <div className="analysis-toolbar__selectors">
        <label className="analysis-toolbar__session">
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {t("Select Session")}:
          </span>
          <select className="form-select" value={selectedFilename} onChange={event => onSelectSession(event.target.value)}>
            <option value="current">{t("Current / Latest Session")}</option>
            {savedSessions.map(session => (
              <option key={session.filename} value={session.filename}>
                {session.car_name || session.filename} ({session.total_laps ?? 0} Laps | Best: {" "}
                {session.best_lap_time && session.best_lap_time > 0 ? session.best_lap_time.toFixed(2) : t("Unknown")}s)
              </option>
            ))}
          </select>
        </label>

        {lapsList.length > 0 && (
          <label>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Primary Lap")}:</span>
            <select className="form-select" value={primaryLap} onChange={event => onSelectPrimaryLap(parseInt(event.target.value, 10))}>
              <option value={0}>{t("All Laps")}</option>
              {lapsList.map(lap => (
                <option key={lap.lap_number} value={lap.lap_number}>
                  Lap {lap.lap_number} ({lap.lap_time?.toFixed(2) ?? t("Unknown")}s | Max: {lap.max_speed_kmh?.toFixed(0) ?? t("Unknown")}km/h)
                </option>
              ))}
            </select>
          </label>
        )}

        {lapsList.length > 0 && (
          <label>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Compare Lap")}:</span>
            <select className="form-select" value={compareLap} onChange={event => onSelectCompareLap(parseInt(event.target.value, 10))}>
              <option value={-1}>{t("None")}</option>
              {lapsList.map(lap => (
                <option key={lap.lap_number} value={lap.lap_number}>
                  vs Lap {lap.lap_number} ({lap.lap_time?.toFixed(2) ?? t("Unknown")}s)
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="button" onClick={onLatestAnalysis} className="btn btn-primary">
          {t('Post-Race Analysis')}
        </button>
      </div>
      <div className="analysis-toolbar__actions">
        {getRuntimeCapabilities().localMotecLaunch && (
          <button onClick={onOpenInMoTec} className="btn btn-outline-secondary" title={t("Launch session in local MoTeC i2 viewer")}>
            {t("Open in MoTeC")}
          </button>
        )}
        <span
          className="d-inline-flex"
          title={isExporting ? t("Export is currently in progress") : undefined}
          style={isExporting ? { cursor: 'not-allowed' } : undefined}
        >
          <button onClick={onExportMoTec} disabled={isExporting} className="btn btn-outline-secondary" style={isExporting ? { pointerEvents: 'none' } : undefined}>
            MoTeC CSV {t("Export")}
          </button>
        </span>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onImportFile} />
        <button onClick={onOpenImport} className="btn btn-outline-secondary" title={t("Import MoTeC CSV for analysis")}>
          MoTeC CSV {t("Import")}
        </button>
        <span
          className="d-inline-flex"
          title={isExporting ? t("Export is currently in progress") : t("Download pre-configured HorizonTuner MoTeC i2 workspace template")}
          style={isExporting ? { cursor: 'not-allowed' } : undefined}
        >
          <button onClick={onDownloadTemplate} disabled={isExporting} className="btn btn-outline-secondary" style={isExporting ? { pointerEvents: 'none' } : undefined}>
            {t("Workspace Template")}
          </button>
        </span>
        {onOpenChannelMapping && (
          <button onClick={onOpenChannelMapping} className="btn btn-outline-secondary" title={t("View 41-channel mapping reference")}>
            {t("Channel Mapping")}
          </button>
        )}
        {isSavedSelection && <button onClick={onDeleteSession} className="btn btn-outline-danger">{t("Delete")}</button>}
      </div>
    </div>

    {motecActionMsg && (
      <div
        className="glass-panel text-success border-success"
        style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span>✓ {motecActionMsg}</span>
        <button onClick={onCloseMessage} className="btn-close" aria-label={t("Close")} />
      </div>
    )}
  </>
);

export default AnalysisSessionToolbar;
