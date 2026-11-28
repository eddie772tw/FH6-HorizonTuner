import React, { useEffect, useId, useRef, useState } from "react";

export interface ManualRecordingToolbarProps {
  readonly mode: "circuit" | "time_trial" | "roaming";
  readonly onModeChange: (mode: "circuit" | "time_trial" | "roaming") => void;
  readonly isRecording: boolean;
  readonly recordingCount: number;
  readonly manualMode: boolean;
  readonly armed: boolean;
  readonly canStart?: boolean;
  readonly onStartManual: () => void;
  readonly onStopManual: () => void;
  readonly onClear: () => void;
  readonly onSave: () => void;
  readonly t: (text: string, params?: Record<string, string | number>) => string;
}

export const ManualRecordingToolbar: React.FC<ManualRecordingToolbarProps> = ({
  mode,
  onModeChange,
  isRecording,
  recordingCount,
  manualMode,
  armed,
  canStart = true,
  onStartManual,
  onStopManual,
  onClear,
  onSave,
  t,
}) => {
  const confirmId = useId();
  const [confirmClear, setConfirmClear] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const clearBtnRef = useRef<HTMLButtonElement>(null);
  const cancelClearBtnRef = useRef<HTMLButtonElement>(null);
  const hadConfirmation = useRef(false);
  const modeLocked = isRecording || armed;
  const startDisabled = armed || !canStart;
  const statusText = isRecording ? (manualMode ? t("Manual Recording") : t("Auto Recording"))
    : armed ? t("Armed & Awaiting Gate Crossing") : t("Idle");
  const startDisabledReason = armed ? t("Armed & Awaiting Gate Crossing") : !canStart ? t("Select Route") : undefined;
  const modes = [["circuit", "Circuit Race"], ["time_trial", "Time Trial"], ["roaming", "Free Roam"]] as const;

  useEffect(() => { if (isRecording) setConfirmClear(false); }, [isRecording]);
  useEffect(() => {
    const active = document.activeElement;
    if (active === document.body || toolbarRef.current?.contains(active)) {
      if (confirmClear) cancelClearBtnRef.current?.focus();
      else if (hadConfirmation.current && !isRecording) clearBtnRef.current?.focus();
    }
    hadConfirmation.current = confirmClear;
  }, [confirmClear, isRecording]);

  return (
    <div ref={toolbarRef} className="card mb-3 p-3 border">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <div className="d-flex flex-wrap gap-1" role="group" aria-label={t("Recording Mode")} title={modeLocked ? statusText : undefined} style={modeLocked ? { cursor: "not-allowed" } : undefined}>
            {modes.map(([value, label]) => (
              <button key={value} type="button" className={`btn btn-sm ${mode === value ? "btn-primary" : "btn-outline-secondary"}`} aria-pressed={mode === value} onClick={() => onModeChange(value)} disabled={modeLocked} style={modeLocked ? { pointerEvents: "none" } : undefined}>
                {t(label)}
              </button>
            ))}
          </div>

          <div className="d-flex align-items-center gap-1" style={{ maxWidth: "100%" }}>
            <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{statusText}</span>
            {isRecording ? (
              <span className="badge text-bg-danger text-wrap text-start">{manualMode ? t("Manual Recording ({count} samples)", { count: recordingCount }) : t("Auto Recording ({count} samples)", { count: recordingCount })}</span>
            ) : armed ? (
              <span className="badge text-bg-warning text-wrap text-start">{t("Armed & Awaiting Gate Crossing")}</span>
            ) : (
              <span className="badge text-bg-secondary text-wrap text-start">{t("Idle")}</span>
            )}
          </div>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-2">
          {!isRecording ? (
            <span className="d-inline-flex" title={startDisabledReason} style={startDisabled ? { cursor: "not-allowed" } : undefined}>
              <button type="button" className="btn btn-sm btn-success" onClick={onStartManual} disabled={startDisabled} style={startDisabled ? { pointerEvents: "none" } : undefined}>{mode === "circuit" ? t("Start Recording") : t("Arm Route")}</button>
            </span>
          ) : manualMode ? (
            <button type="button" className="btn btn-sm btn-danger" onClick={onStopManual}>{t("Stop & Save")}</button>
          ) : (
            <button type="button" className="btn btn-sm btn-warning" onClick={onSave} title={t("Save current recording to backend")}>{t("Save Current")}</button>
          )}

          <span className="d-inline-flex" title={isRecording ? t("Cannot clear while capturing") : undefined} style={isRecording ? { cursor: "not-allowed" } : undefined}>
            <button ref={clearBtnRef} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setConfirmClear(true)} disabled={isRecording || confirmClear} aria-expanded={confirmClear} aria-controls={confirmClear ? `${confirmId}-confirm` : undefined} title={t("Clear recording buffer")} style={isRecording ? { pointerEvents: "none" } : undefined}>{t("Clear Buffer")}</button>
          </span>
        </div>
      </div>
      {!isRecording && confirmClear && (
        <div id={`${confirmId}-confirm`} role="group" aria-labelledby={`${confirmId}-confirm-label`} className="border-top pt-2 mt-2 d-flex flex-wrap align-items-center justify-content-between gap-2"
          onKeyDownCapture={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setConfirmClear(false); } }}>
          <p id={`${confirmId}-confirm-label`} className="fs-7 fw-semibold mb-0" style={{ color: "var(--bs-danger-text-emphasis)", overflowWrap: "anywhere" }}>{t("Clear recording buffer")}</p>
          <div className="d-flex flex-wrap gap-2">
            <button ref={cancelClearBtnRef} type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setConfirmClear(false)}>{t("Cancel")}</button>
            <button type="button" className="btn btn-danger btn-sm fw-bold" onClick={() => { setConfirmClear(false); onClear(); }}>{t("Clear Buffer")}</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualRecordingToolbar;
