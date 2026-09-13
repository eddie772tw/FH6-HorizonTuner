import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  useTelemetryRecorder,
  AnalysisDataPoint,
  LapSummary,
} from "../../context/TelemetryRecorderContext";
import { useSettings } from "../../context/SettingsContext";
import TrackMapCanvas from "./TrackMapCanvas";
import SessionHealthDebrief from "./SessionHealthDebrief";
import LapDeltaCanvas from "./LapDeltaCanvas";
import { calculateFrontendDebrief, SessionDebriefData } from "./sessionDebriefMath";
import { backendFetch } from "../../services/backend";
import { type AnalysisMetric, useSessionsState } from "../sessions/SessionsStateProvider";
import { analysisDataPath, analysisSelectionKey } from "../sessions/sessionSelection";

const AnalysisView: React.FC = () => {
  const {
    isRecording,
    recordingCount,
    currentSessionId,
    currentSession,
    loadedSession,
    savedSessions,
    setLoadedSession,
    loadSessionLaps,
    deleteSavedSession,
    exportMoTecCsv,
    uploadMoTecCsv,
    openInMoTec,
    downloadMoTecTemplate,
    fetchSessionDebrief,
  } = useTelemetryRecorder();
  const {
    state: sessionsState,
    selectedFilename,
    selectedSessionId,
    isSavedSelection,
    selectCurrent,
    selectSaved,
    setPrimaryLap,
    setCompareLap,
    setMetric,
    setImportedSession,
    loadPrimaryLap,
    cancelPrimaryLoad,
    refreshCurrent,
  } = useSessionsState();

  const { t } = useSettings();
  const [motecActionMsg, setMotecActionMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Laps & Lap Comparison state
  const [lapsList, setLapsList] = useState<LapSummary[]>([]);
  const [compareSessionData, setCompareSessionData] = useState<AnalysisDataPoint[]>([]);
  const [fullSessionTrackData, setFullSessionTrackData] = useState<AnalysisDataPoint[]>([]);

  // Debrief Data State
  const [debriefData, setDebriefData] = useState<SessionDebriefData | null>(null);

  const { selection, primaryLap, compareLap, metric: selectedMetric, isLoading } = sessionsState;

  // The feature adapter owns writes to loadedSession. Its generation guard
  // prevents an earlier selection from winning after this view is unmounted.
  useEffect(() => {
    if (selection.kind !== "local") void loadPrimaryLap();
    return cancelPrimaryLoad;
  }, [cancelPrimaryLoad, loadPrimaryLap, primaryLap, selection]);

  // Secondary view data never writes the shared recorder selection.  It is
  // still cancelled locally when the selected identity changes or unmounts.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const selectedKey = analysisSelectionKey(selection);
    const loadSupportingData = async () => {
      if (selection.kind === "local") {
        setLapsList([]);
        setFullSessionTrackData(loadedSession ?? []);
        setDebriefData(loadedSession && loadedSession.length > 0 ? calculateFrontendDebrief(loadedSession) : null);
        return;
      }
      const sessionId = selectedSessionId;
      const fullTrackPath = analysisDataPath(selection, 0);
      if (!sessionId || !fullTrackPath) return;
      const [fullTrack, laps, debrief] = await Promise.all([
        backendFetch(fullTrackPath, { signal: controller.signal })
          .then(response => response.json())
          .catch(() => null),
        selection.kind === "current" ? Promise.resolve([]) : loadSessionLaps(sessionId),
        fetchSessionDebrief(sessionId),
      ]);
      if (!active || analysisSelectionKey(selection) !== selectedKey) return;
      setLapsList(laps);
      if (Array.isArray(fullTrack)) setFullSessionTrackData(fullTrack);
      if (debrief) setDebriefData(debrief);
    };
    void loadSupportingData();
    return () => {
      active = false;
      controller.abort();
    };
  }, [fetchSessionDebrief, loadSessionLaps, loadedSession, selectedSessionId, selection]);

  // During Live Recording, periodically refresh full session data and debrief
  useEffect(() => {
    if (!isRecording || selection.kind !== "current") return;
    const intervalId = window.setInterval(() => {
      void refreshCurrent().then(data => {
        if (data && data.length > 0) setDebriefData(calculateFrontendDebrief(data));
      });
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [isRecording, refreshCurrent, selection.kind]);

  const activeSession = loadedSession || currentSession;

  // Recalculate local debrief when activeSession changes if backend debrief not present
  useEffect(() => {
    if (activeSession.length > 0) {
      setDebriefData(calculateFrontendDebrief(activeSession));
    }
  }, [activeSession]);

  // Load Compare Lap Data when compareLap dropdown changes
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const fetchCompareData = async () => {
      const path = compareLap > 0 ? analysisDataPath(selection, compareLap) : null;
      if (path) {
        try {
          const data = await backendFetch(path, { signal: controller.signal }).then(response => response.json());
          if (active && Array.isArray(data)) setCompareSessionData(data);
        } catch {
          if (active) setCompareSessionData([]);
        }
      } else {
        setCompareSessionData([]);
      }
    };
    void fetchCompareData();
    return () => {
      active = false;
      controller.abort();
    };
  }, [compareLap, selection]);

  const handleDropdownChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const val = e.target.value;
    if (val === "current") {
      selectCurrent();
    } else {
      selectSaved(val);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const data = await uploadMoTecCsv(file);
      if (data && data.length > 0) {
        setImportedSession(data);
        setFullSessionTrackData(data);
        setDebriefData(calculateFrontendDebrief(data));
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenInMoTec = async () => {
    const sid =
      selectedSessionId === "current"
        ? (currentSessionId || (savedSessions.length > 0 ? savedSessions[0].session_id : "current"))
        : (selectedSessionId || "current");
    const result = await openInMoTec(sid);
    setMotecActionMsg(result.message);
    setTimeout(() => setMotecActionMsg(null), 4000);
  };

  const handleDeleteSession = async () => {
    if (!isSavedSelection || !selectedSessionId) return;
    if (
      confirm(
        `${t("Are you sure you want to delete this session?")} (${selectedSessionId})`,
      )
    ) {
      const success = await deleteSavedSession(selectedSessionId);
      if (success) {
        setLoadedSession(null);
        selectCurrent();
      } else {
        alert(t("Failed to delete session."));
      }
    }
  };

  const formatTrackCanvasData = useCallback((points: AnalysisDataPoint[]) => {
    const finite = (value: number | null | undefined): value is number =>
      typeof value === "number" && Number.isFinite(value);
    const candidates = points.flatMap((p) => {
      // A track point needs a real timestamp, position, and speed. Missing
      // values are excluded instead of being rendered at the origin or zero.
      if (
        !finite(p.time) ||
        !finite(p.PositionX) ||
        !finite(p.PositionZ) ||
        !finite(p.SpeedMetersPerSecond)
      ) {
        return [];
      }

      const speed = p.SpeedMetersPerSecond;
      const x = p.PositionX;
      const z = p.PositionZ;
      let value: number | null = speed;
      if (selectedMetric === "throttle") value = finite(p.AccelInput) ? p.AccelInput / 255 : null;
      else if (selectedMetric === "brake") value = finite(p.BrakeInput) ? p.BrakeInput / 255 : null;
      else if (selectedMetric === "grip") {
        const slip = (p.TireSlipRatio || []).filter(finite);
        value = slip.length > 0 ? Math.max(...slip.map(Math.abs)) : null;
      } else if (selectedMetric === "suspension") {
        value = finite(p.SuspTravel?.[0]) ? p.SuspTravel[0] : null;
      }

      return finite(value) ? [{ point: p, x, z, value }] : [];
    });
    if (candidates.length === 0) return [];

    let metricMax = 0.1;
    for (const candidate of candidates) {
      if (candidate.value > metricMax) metricMax = candidate.value;
    }
    return candidates.map(({ point, x, z, value }) => ({
      x,
      z,
      val: value / metricMax,
      raw: point,
    }));
  }, [selectedMetric]);

  const activeCanvasData = useMemo(() => formatTrackCanvasData(activeSession), [activeSession, formatTrackCanvasData]);
  const baseCanvasData = useMemo(() => formatTrackCanvasData(fullSessionTrackData), [fullSessionTrackData, formatTrackCanvasData]);
  const isSavedSession = selection.kind === "saved" || selection.kind === "latest";

  const fallbackDebrief: SessionDebriefData = debriefData || {
    total_samples: activeSession.length,
    valid_laps: null,
    tire_thermals: { fl_avg: null, fr_avg: null, rl_avg: null, rr_avg: null, status: "no_data" },
    suspension: { peak_travel_pct: null, bottom_out_count: null, status: "no_data" },
    handling_balance: { understeer_pct: null, oversteer_pct: null, tendency: "no_data" },
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        gap: "1rem",
        overflowY: "auto",
        paddingRight: "0.5rem",
      }}
    >
      {/* Top Toolbar */}
      <div
        className="glass-panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1rem",
          flexShrink: 0,
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h2 style={{ color: "var(--primary)", marginBottom: "0.2rem" }}>
            {t("Post-Race Debrief & MoTeC Bridge")}
          </h2>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {t("Status")}:{" "}
            {isRecording ? (
              <span style={{ color: "#ff003c", fontWeight: "bold" }}>
                {t("Recording...")} ({recordingCount} {t("samples")})
              </span>
            ) : (
              `${t("Idle")} (${activeSession.length} ${t("samples")})`
            )}
            {selectedFilename !== "current" &&
              selectedFilename !== "local" &&
              ` | ${t("Loaded Session")}: ${selectedFilename}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Saved Sessions Dropdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              {t("Select Session")}:
            </span>
            <select
              value={selectedFilename}
              onChange={handleDropdownChange}
              style={selectStyle}
            >
              <option value="current">{t("Current / Latest Session")}</option>
              {savedSessions.map((s) => (
                <option key={s.filename} value={s.filename}>
                  {s.car_name || s.filename} ({s.total_laps ?? 0} Laps | Best:{" "}
                  {s.best_lap_time && s.best_lap_time > 0 ? s.best_lap_time.toFixed(2) : t("Unknown")}s)
                </option>
              ))}
            </select>
          </div>

          {/* Lap Selector */}
          {lapsList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {t("Primary Lap")}:
              </span>
              <select
                value={primaryLap}
                onChange={(e) => setPrimaryLap(parseInt(e.target.value))}
                style={selectStyle}
              >
                <option value={0}>{t("All Laps")}</option>
                {lapsList.map((l) => (
                  <option key={l.lap_number} value={l.lap_number}>
                    Lap {l.lap_number} ({l.lap_time?.toFixed(2) ?? t("Unknown")}s | Max: {l.max_speed_kmh?.toFixed(0) ?? t("Unknown")}km/h)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Compare Lap Selector */}
          {lapsList.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {t("Compare Lap")}:
              </span>
              <select
                value={compareLap}
                onChange={(e) => setCompareLap(parseInt(e.target.value))}
                style={selectStyle}
              >
                <option value={-1}>{t("None")}</option>
                {lapsList.map((l) => (
                  <option key={l.lap_number} value={l.lap_number}>
                    vs Lap {l.lap_number} ({l.lap_time?.toFixed(2) ?? t("Unknown")}s)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
            {/* Open In MoTeC */}
            <button
              onClick={handleOpenInMoTec}
              className="btn btn-sm btn-success"
              title={t("Launch session in local MoTeC i2 viewer")}
            >
              {t("Open in MoTeC")}
            </button>

            {/* Export MoTeC CSV */}
            <button
              onClick={() => exportMoTecCsv(selectedFilename)}
              className="btn btn-sm btn-secondary"
            >
              MoTeC CSV {t("Export")}
            </button>

            {/* Import MoTeC CSV */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              onChange={handleFileUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-sm btn-primary"
              title={t("Import MoTeC CSV for analysis")}
            >
              MoTeC CSV {t("Import")}
            </button>

            {/* Download MoTeC Template */}
            <button
              onClick={downloadMoTecTemplate}
              className="btn btn-sm btn-info"
              title={t("Download pre-configured HorizonTuner MoTeC i2 workspace template")}
            >
              {t("Workspace Template")}
            </button>

            {/* Delete Session */}
            {isSavedSelection && (
              <button
                onClick={handleDeleteSession}
                className="btn btn-sm btn-danger"
              >
                {t("Delete")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Action Notification Message */}
      {motecActionMsg && (
        <div
          className="glass-panel text-success border-success"
          style={{
            padding: "0.6rem 1rem",
            fontSize: "0.85rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✓ {motecActionMsg}</span>
          <button
            onClick={() => setMotecActionMsg(null)}
            className="btn-close"
            aria-label={t("Close")}
          />
        </div>
      )}

      {isLoading ? (
        <div
          className="glass-panel"
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "var(--text-secondary)",
            minHeight: "300px",
          }}
        >
          {t("Loading Telemetry Data...")}
        </div>
      ) : activeSession.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            color: "var(--text-secondary)",
            minHeight: "300px",
          }}
        >
          {t("No data recorded. Start racing to record telemetry.")}
        </div>
      ) : (
        <>
          {/* Section 1: Session Health & Vehicle Dynamics Debrief */}
          <SessionHealthDebrief debrief={fallbackDebrief} />

          {/* Section 2: Dual Visualization (Track Map & Lap Delta) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(48%, 1fr))", gap: "1rem" }}>
            {/* Left Box: GPS Track Map */}
            <div
              className="glass-panel"
              style={{
                height: "360px",
                display: "flex",
                flexDirection: "column",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.4rem",
                }}
              >
                <span style={{ fontWeight: "bold", color: "var(--text-primary)", fontSize: "0.95rem" }}>
                  {t("GPS Track Heatmap")}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {t("Metric")}:
                  </span>
                  <select
                    value={selectedMetric}
                    onChange={(e) => setMetric(e.target.value as AnalysisMetric)}
                    style={{ ...selectStyle, minWidth: "100px", padding: "0.2rem 0.4rem", fontSize: "0.75rem" }}
                  >
                    <option value="speed">{t("Speed")}</option>
                    <option value="throttle">{t("Throttle")}</option>
                    <option value="brake">{t("Brake")}</option>
                    <option value="grip">{t("Grip Slip")}</option>
                    <option value="suspension">{t("Suspension")}</option>
                  </select>
                </div>
              </div>

              <div style={{ flex: 1, position: "relative", width: "100%", height: "100%" }}>
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

            {/* Right Box: Lap Speed & Input Delta Canvas */}
            <LapDeltaCanvas
              primaryLapData={activeSession}
              compareLapData={compareSessionData}
              primaryLapNumber={primaryLap}
              compareLapNumber={compareLap}
            />

          </div>
        </>
      )}
    </div>
  );
};

const selectStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  color: "var(--text-primary)",
  border: "1px solid var(--glass-border)",
  padding: "0.4rem 0.6rem",
  borderRadius: "4px",
  fontSize: "0.85rem",
  cursor: "pointer",
  minWidth: "130px",
};

export default AnalysisView;
