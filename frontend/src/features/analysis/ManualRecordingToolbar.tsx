import React from "react";

export interface ManualRecordingToolbarProps {
  readonly mode: "circuit" | "time_trial" | "roaming";
  readonly onModeChange: (mode: "circuit" | "time_trial" | "roaming") => void;
  readonly isRecording: boolean;
  readonly recordingCount: number;
  readonly manualMode: boolean;
  readonly armed: boolean;
  readonly onStartManual: () => void;
  readonly onStopManual: () => void;
  readonly onClear: () => void;
  readonly onSave: () => void;
  readonly t: (text: string) => string;
}

export const ManualRecordingToolbar: React.FC<ManualRecordingToolbarProps> = ({
  mode,
  onModeChange,
  isRecording,
  recordingCount,
  manualMode,
  armed,
  onStartManual,
  onStopManual,
  onClear,
  onSave,
  t,
}) => {
  return (
    <div className="card mb-3 p-3 bg-dark-subtle border">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex align-items-center gap-2">
          <div className="btn-group" role="group" aria-label={t("Recording Mode")}>
            <button
              type="button"
              className={`btn btn-sm ${mode === "circuit" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onModeChange("circuit")}
            >
              {t("Circuit Race")}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === "time_trial" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onModeChange("time_trial")}
            >
              {t("Time Trial")}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === "roaming" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onModeChange("roaming")}
            >
              {t("Free Roam")}
            </button>
          </div>

          <div className="d-flex align-items-center gap-1 ms-2">
            {isRecording ? (
              <span className="badge bg-danger">
                {manualMode ? t("Manual Recording") : t("Auto Recording")} ({recordingCount} {t("samples")})
              </span>
            ) : armed ? (
              <span className="badge bg-warning text-dark">
                {t("Armed & Awaiting Gate Crossing")}
              </span>
            ) : (
              <span className="badge bg-secondary">
                {t("Idle")}
              </span>
            )}
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {!isRecording ? (
            <button
              type="button"
              className="btn btn-sm btn-success"
              onClick={onStartManual}
            >
              {t("Start Recording")}
            </button>
          ) : manualMode ? (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={onStopManual}
            >
              {t("Stop & Save")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-outline-warning"
              onClick={onSave}
              title={t("Save current recording to backend")}
            >
              {t("Save Current")}
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={onClear}
            disabled={isRecording}
            title={t("Clear recording buffer")}
          >
            {t("Clear Buffer")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManualRecordingToolbar;
