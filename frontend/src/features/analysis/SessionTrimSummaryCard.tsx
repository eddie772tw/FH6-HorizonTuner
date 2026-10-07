import React from "react";

export interface TrimAnalysisData {
  head_trim_seconds?: number;
  tail_trim_seconds?: number;
  valid_start_time?: number;
  valid_end_time?: number;
  raw_sample_count?: number;
  trimmed_sample_count?: number;
}

export interface SessionTrimSummaryCardProps {
  readonly metadata: Record<string, unknown> | null;
  readonly showRawData: boolean;
  readonly onToggleRawData: (showRaw: boolean) => void;
  readonly exportRawData: boolean;
  readonly onToggleExportRawData: (exportRaw: boolean) => void;
  readonly t: (text: string) => string;
}

export const SessionTrimSummaryCard: React.FC<SessionTrimSummaryCardProps> = ({
  metadata,
  showRawData,
  onToggleRawData,
  exportRawData,
  onToggleExportRawData,
  t,
}) => {
  if (!metadata) return null;

  const trim = (metadata.trim_analysis as TrimAnalysisData | undefined) ?? null;
  const recordingMode = (metadata.recording_mode as string | undefined) ?? "circuit";
  const lapTimeSource = (metadata.lap_time_source as string | undefined) ?? "game";
  const routeName = (metadata.route_name as string | undefined) ?? null;

  if (!trim && recordingMode === "circuit") return null;

  const headTrim = trim?.head_trim_seconds ?? 0;
  const tailTrim = trim?.tail_trim_seconds ?? 0;
  const rawCount = trim?.raw_sample_count ?? 0;
  const trimmedCount = trim?.trimmed_sample_count ?? 0;

  return (
    <div className="card mb-3 border">
      <div className="card-header d-flex justify-content-between align-items-center py-2">
        <div className="d-flex align-items-center gap-2">
          <span className="fw-semibold" style={{ fontSize: "0.9rem" }}>
            {t("Session Analysis & Trimming")}
          </span>
          <span className="badge bg-secondary text-uppercase" style={{ fontSize: "0.7rem" }}>
            {recordingMode}
          </span>
          {routeName && (
            <span className="badge bg-info text-dark" style={{ fontSize: "0.7rem" }}>
              {routeName}
            </span>
          )}
        </div>

        <div className="d-flex align-items-center gap-3">
          <div className="form-check form-switch m-0 d-flex align-items-center gap-2">
            <input
              type="checkbox"
              className="form-check-input"
              id="rawViewToggle"
              checked={showRawData}
              onChange={(e) => onToggleRawData(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="rawViewToggle" style={{ fontSize: "0.8rem" }}>
              {showRawData ? t("Raw View (Untrimmed)") : t("Trimmed View")}
            </label>
          </div>

          <div className="form-check m-0 d-flex align-items-center gap-2">
            <input
              type="checkbox"
              className="form-check-input"
              id="exportRawCheckbox"
              checked={exportRawData}
              onChange={(e) => onToggleExportRawData(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="exportRawCheckbox" style={{ fontSize: "0.8rem" }}>
              {t("Export Raw Data Without Trimming")}
            </label>
          </div>
        </div>
      </div>

      <div className="card-body py-2">
        <div className="row g-2 text-center" style={{ fontSize: "0.8rem" }}>
          <div className="col-6 col-md-3">
            <div className="text-secondary">{t("Lead-in Trim")}</div>
            <div className="fw-bold">{headTrim.toFixed(1)}s</div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-secondary">{t("Post-Stop Trim")}</div>
            <div className="fw-bold">{tailTrim.toFixed(1)}s</div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-secondary">{t("Valid Samples")}</div>
            <div className="fw-bold">
              {trimmedCount > 0 ? `${trimmedCount} / ${rawCount}` : `${rawCount}`}
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="text-secondary">{t("Lap Timing Source")}</div>
            <div className="fw-bold text-capitalize">{lapTimeSource}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionTrimSummaryCard;
