import React, { useEffect, useId, useRef, useState } from "react";
import { getRuntimeCapabilities } from '../../services/runtimeCapabilities';
import type { SavedSessionHeader, LapSummary } from "../../context/TelemetryRecorderContext";

export interface AnalysisSessionToolbarProps {
  readonly t: (text: string, params?: Record<string, string | number>) => string;
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
  readonly nativeMotecEnabled?: boolean;
  readonly fileInputRef: React.RefObject<HTMLInputElement | null>;
  readonly onSelectSession: (filename: string) => void;
  readonly onSelectPrimaryLap: (lap: number) => void;
  readonly onSelectCompareLap: (lap: number) => void;
  readonly onOpenInMoTec: (format?: "csv" | "ld") => void;
  readonly onExportMoTec: (format?: "csv" | "ld") => void;
  readonly onImportFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onOpenImport: () => void;
  readonly onDownloadTemplate: () => void;
  readonly onOpenChannelMapping?: () => void;
  readonly onDeleteSession: () => Promise<boolean | void> | boolean | void;
  readonly onCloseMessage: () => void;
  readonly onLatestAnalysis: () => void;
}

function formatBestLapTime(t: AnalysisSessionToolbarProps["t"], bestLapTime?: number): string {
  return bestLapTime && Number.isFinite(bestLapTime) && bestLapTime > 0
    ? `${bestLapTime.toFixed(2)}s`
    : t("Unknown");
}

function formatLapTime(t: AnalysisSessionToolbarProps["t"], lap: LapSummary): string {
  if (lap.lap_time == null || !Number.isFinite(lap.lap_time) || lap.lap_time <= 0) {
    return t("Unknown");
  }
  const formatted = `${lap.lap_time.toFixed(2)}s`;
  return lap.is_estimated ? `${t("Estimated")} ${formatted}` : formatted;
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
  nativeMotecEnabled = false,
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
}) => {
  const deleteId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteStatus, setDeleteStatus] = useState("");
  const deleteInFlight = useRef(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const sessionSelectRef = useRef<HTMLSelectElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteBtnRef = useRef<HTMLButtonElement>(null);
  const hadConfirmation = useRef(false);

  useEffect(() => { setConfirmDelete(false); setDeleteError(null); }, [selectedFilename, isSavedSelection]);
  useEffect(() => {
    if (isDeleting) return;
    const active = document.activeElement;
    const ownsFocus = active === document.body || Boolean(toolbarRef.current?.contains(active));
    if (ownsFocus) {
      if (confirmDelete) cancelDeleteBtnRef.current?.focus();
      else if (hadConfirmation.current) (deleteBtnRef.current ?? sessionSelectRef.current)?.focus();
    }
    hadConfirmation.current = confirmDelete;
  }, [confirmDelete, isDeleting]);

  const handleConfirmDelete = async () => {
    if (deleteInFlight.current) return;
    deleteInFlight.current = true; setIsDeleting(true); setDeleteStatus(""); setDeleteError(null);
    try {
      const ok = await onDeleteSession();
      setConfirmDelete(false);
      if (ok === false) setDeleteError(t("Failed to delete session.")); else setDeleteStatus(t("Session deleted."));
    } catch {
      setConfirmDelete(false); setDeleteError(t("Failed to delete session."));
    } finally { deleteInFlight.current = false; setIsDeleting(false); }
  };

  return (<>
    <div ref={toolbarRef} className="workspace-toolbar analysis-toolbar">
      <div className="visually-hidden" role="status" aria-live="polite">{deleteStatus}</div>
      <div className="analysis-toolbar__status" role="status" aria-live="polite">
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          {t("Status")}: {isRecording ? (
            <span className="text-danger fw-bold">
              {t("Recording... ({count} samples)", { count: recordingCount })}
            </span>
          ) : (
            t("Idle ({count} samples)", { count: activeSessionLength })
          )}
          {selectedFilename !== "current" && selectedFilename !== "local" &&
            ` | ${t("Loaded Session: {filename}", { filename: selectedFilename })}`}
        </div>
      </div>

      <div className="analysis-toolbar__selectors">
        <label className="analysis-toolbar__session">
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {t("Select Session")}:
          </span>
          <select ref={sessionSelectRef} className="form-select" value={selectedFilename} onChange={event => onSelectSession(event.target.value)} aria-label={t("Select Session")}>
            {selectedFilename === "local" && <option value="local">{t("MoTeC CSV Import")}</option>}
            <option value="current">{t("Current / Latest Session")}</option>
            {savedSessions.map(session => (
              <option key={session.filename} value={session.filename}>
                {t("{car} ({laps} Laps | Best: {best})", {
                  car: session.car_name || session.filename,
                  laps: session.total_laps ?? 0,
                  best: formatBestLapTime(t, session.best_lap_time),
                })}
              </option>
            ))}
          </select>
        </label>

        {lapsList.length > 0 && (
          <label>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Primary Lap")}:</span>
            <select className="form-select" value={primaryLap} onChange={event => onSelectPrimaryLap(parseInt(event.target.value, 10))} aria-label={t("Primary Lap")}>
              <option value={0}>{t("All Laps")}</option>
              {lapsList.map(lap => (
                <option key={lap.lap_number} value={lap.lap_number}>
                  {t("Lap {lap} ({time} | Max: {maxSpeed})", {
                    lap: lap.lap_number,
                    time: formatLapTime(t, lap),
                    maxSpeed: lap.max_speed_kmh != null && Number.isFinite(lap.max_speed_kmh) && lap.max_speed_kmh >= 0
                      ? `${lap.max_speed_kmh.toFixed(0)} km/h`
                      : t("Unknown"),
                  })}
                </option>
              ))}
            </select>
          </label>
        )}

        {lapsList.length > 0 && (
          <label>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{t("Compare Lap")}:</span>
            <select className="form-select" value={compareLap} onChange={event => onSelectCompareLap(parseInt(event.target.value, 10))} aria-label={t("Compare Lap")}>
              <option value={-1}>{t("None")}</option>
              {lapsList.map(lap => (
                <option key={lap.lap_number} value={lap.lap_number}>
                  {t("vs Lap {lap} ({time})", {
                    lap: lap.lap_number,
                    time: formatLapTime(t, lap),
                  })}
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
        {nativeMotecEnabled && getRuntimeCapabilities().localMotecLaunch && (
          <span
            className="d-inline-flex"
            title={selectedFilename === "local" ? t("Imported CSV is previewed locally; use the original file in MoTeC.") : t("Launch session in local MoTeC i2 viewer")}
            style={selectedFilename === "local" ? { cursor: 'not-allowed' } : undefined}
          >
            <button
              onClick={() => onOpenInMoTec("ld")}
              disabled={selectedFilename === "local"}
              className="btn btn-outline-secondary"
              style={selectedFilename === "local" ? { pointerEvents: 'none' } : undefined}
            >
              {t("Open in MoTeC")}
            </button>
          </span>
        )}
        {nativeMotecEnabled && <span
          className="d-inline-flex"
          title={isExporting ? t("Export is currently in progress") : t("Export native MoTeC .ld binary with .ldx lap beacons")}
          style={isExporting ? { cursor: 'not-allowed' } : undefined}
        >
          <button onClick={() => onExportMoTec("ld")} disabled={isExporting || selectedFilename === "local"} className="btn btn-outline-secondary" style={isExporting ? { pointerEvents: 'none' } : undefined}>
            {t("MoTeC .ld Export (Experimental)")}
          </button>
        </span>}
        <span
          className="d-inline-flex"
          title={isExporting ? t("Export is currently in progress") : t("Export legacy MoTeC CSV")}
          style={isExporting ? { cursor: 'not-allowed' } : undefined}
        >
          <button onClick={() => onExportMoTec("csv")} disabled={isExporting || selectedFilename === "local"} className="btn btn-outline-secondary" style={isExporting ? { pointerEvents: 'none' } : undefined}>
            {t("CSV Export")}
          </button>
        </span>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onImportFile} />
        <button onClick={onOpenImport} className="btn btn-outline-secondary" title={t("Import MoTeC CSV for analysis")} aria-label={t("MoTeC CSV Import")}>
          {t("MoTeC CSV Import")}
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
          <button onClick={onOpenChannelMapping} className="btn btn-outline-secondary" title={t("View 41-channel mapping reference")} aria-label={t("Channel Mapping")}>
            {t("Channel Mapping")}
          </button>
        )}
        {isSavedSelection && (
          <button ref={deleteBtnRef} type="button" onClick={() => { setDeleteStatus(""); setDeleteError(null); setConfirmDelete(true); }}
            disabled={confirmDelete || isDeleting} aria-expanded={confirmDelete} aria-controls={confirmDelete ? `${deleteId}-confirm` : undefined}
            className="btn btn-outline-danger" aria-label={t("Delete selected session")}>{t("Delete")}</button>
        )}
      </div>
      {isSavedSelection && confirmDelete && (
        <div id={`${deleteId}-confirm`} className="border-top pt-2 d-flex flex-wrap align-items-center justify-content-between gap-2"
          role="group" aria-labelledby={`${deleteId}-confirm-label`}
          onKeyDownCapture={event => {
            if (event.key !== "Escape") return;
            event.preventDefault(); event.stopPropagation();
            if (!deleteInFlight.current) setConfirmDelete(false);
          }}>
          <p id={`${deleteId}-confirm-label`} className="fs-7 fw-semibold mb-0" style={{ color: "var(--bs-danger-text-emphasis)", overflowWrap: "anywhere" }}>
            {`${t("Are you sure you want to delete this session?")} (${selectedFilename})`}
          </p>
          <div className="d-flex flex-wrap gap-2">
            <button ref={cancelDeleteBtnRef} type="button" className="btn btn-outline-secondary btn-sm" disabled={isDeleting} onClick={() => setConfirmDelete(false)}>{t("Cancel")}</button>
            <button type="button" className="btn btn-danger btn-sm fw-bold" disabled={isDeleting} aria-busy={isDeleting} onClick={() => void handleConfirmDelete()}>
              {isDeleting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
              {t("Delete")}
            </button>
          </div>
        </div>
      )}
      {deleteError && (
        <div className="glass-panel border-danger d-flex justify-content-between align-items-center gap-2" role="alert" style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", color: "var(--bs-danger-text-emphasis)" }}>
          <span>{deleteError}</span><button type="button" onClick={() => setDeleteError(null)} className="btn-close" aria-label={t("Close")} />
        </div>
      )}
    </div>
    {selectedFilename === "local" && <p className="text-muted small">{t("Imported CSV is previewed locally; use the original file in MoTeC.")}</p>}

    {motecActionMsg && (
      <div
        className="glass-panel text-success border-success"
        style={{ padding: "0.6rem 1rem", fontSize: "0.85rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <span>✓ {motecActionMsg}</span>
        <button onClick={onCloseMessage} className="btn-close" aria-label={t("Close")} />
      </div>
    )}
  </>);
};

export default AnalysisSessionToolbar;
