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

type MetricType = "speed" | "throttle" | "brake" | "grip" | "suspension";

const AnalysisView: React.FC = () => {
  const {
    isRecording,
    recordingCount,
    currentSessionId,
    currentSession,
    loadedSession,
    savedSessions,
    setLoadedSession,
    fetchCurrentSessionData,
    loadSavedSession,
    loadSessionLaps,
    deleteSavedSession,
    exportMoTecCsv,
    uploadMoTecCsv,
    openInMoTec,
    downloadMoTecTemplate,
    fetchSessionDebrief,
  } = useTelemetryRecorder();

  const { t } = useSettings();
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("speed");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFilename, setSelectedFilename] = useState<string>("current");
  const [motecActionMsg, setMotecActionMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Laps & Lap Comparison state
  const [lapsList, setLapsList] = useState<LapSummary[]>([]);
  const [primaryLap, setPrimaryLap] = useState<number>(0);
  const [compareLap, setCompareLap] = useState<number>(-1);
  const [compareSessionData, setCompareSessionData] = useState<AnalysisDataPoint[]>([]);
  const [fullSessionTrackData, setFullSessionTrackData] = useState<AnalysisDataPoint[]>([]);

  // Debrief Data State
  const [debriefData, setDebriefData] = useState<SessionDebriefData | null>(null);

  // Initial Fetch on mount
  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      const data = await fetchCurrentSessionData(primaryLap);
      setFullSessionTrackData(data);

      const debrief = await fetchSessionDebrief("current");
      if (debrief) {
        setDebriefData(debrief);
      } else if (data && data.length > 0) {
        setDebriefData(calculateFrontendDebrief(data));
      }
      setIsLoading(false);
    };
    initData();
  }, []);

  // During Live Recording, periodically refresh full session data and debrief
  useEffect(() => {
    let intervalId: any = null;
    if (isRecording) {
      intervalId = setInterval(async () => {
        const fullPoints = await fetchCurrentSessionData(0);
        if (fullPoints && fullPoints.length > 0) {
          setFullSessionTrackData(fullPoints);
          setDebriefData(calculateFrontendDebrief(fullPoints));
        }
      }, 4000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isRecording]);

  const activeSession = loadedSession || currentSession;

  // Recalculate local debrief when activeSession changes if backend debrief not present
  useEffect(() => {
    if (activeSession.length > 0) {
      setDebriefData(calculateFrontendDebrief(activeSession));
    }
  }, [activeSession]);

  // Load Lap Summaries & Full Track Base Data when selected Session changes
  useEffect(() => {
    const fetchLapsAndFullTrack = async () => {
      if (selectedFilename !== "current" && selectedFilename !== "local") {
        const laps = await loadSessionLaps(selectedFilename);
        setLapsList(laps);

        const res = await backendFetch(
          `/api/analysis/sessions/${encodeURIComponent(selectedFilename)}?lap=0`,
        );
        const data = await res.json();
        if (Array.isArray(data)) setFullSessionTrackData(data);

        const debrief = await fetchSessionDebrief(selectedFilename);
        if (debrief) setDebriefData(debrief);
      } else {
        setLapsList([]);
      }
    };
    fetchLapsAndFullTrack();
  }, [selectedFilename]);

  // Load Primary Lap Data when primaryLap dropdown changes
  useEffect(() => {
    const reloadPrimaryLap = async () => {
      setIsLoading(true);
      if (selectedFilename === "current") {
        await fetchCurrentSessionData(primaryLap);
      } else if (selectedFilename !== "local") {
        await loadSavedSession(selectedFilename, primaryLap);
      }
      setIsLoading(false);
    };
    reloadPrimaryLap();
  }, [primaryLap]);

  // Load Compare Lap Data when compareLap dropdown changes
  useEffect(() => {
    const fetchCompareData = async () => {
      if (compareLap > 0 && selectedFilename !== "local") {
        if (selectedFilename === "current") {
          const res = await backendFetch(
            `/api/analysis/data?lap=${compareLap}`,
          );
          const data = await res.json();
          if (Array.isArray(data)) setCompareSessionData(data);
        } else {
          const res = await backendFetch(
            `/api/analysis/sessions/${encodeURIComponent(selectedFilename)}?lap=${compareLap}`,
          );
          const data = await res.json();
          if (Array.isArray(data)) setCompareSessionData(data);
        }
      } else {
        setCompareSessionData([]);
      }
    };
    fetchCompareData();
  }, [compareLap, selectedFilename]);

  const handleDropdownChange = async (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const val = e.target.value;
    setSelectedFilename(val);
    setPrimaryLap(0);
    setCompareLap(-1);

    setIsLoading(true);
    if (val === "current") {
      setLoadedSession(null);
      await fetchCurrentSessionData(0);
    } else if (val !== "local") {
      await loadSavedSession(val, 0);
    }
    setIsLoading(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsLoading(true);
      const data = await uploadMoTecCsv(file);
      if (data && data.length > 0) {
        setLoadedSession(data);
        setSelectedFilename("local");
        setFullSessionTrackData(data);
        setDebriefData(calculateFrontendDebrief(data));
      }
      setIsLoading(false);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenInMoTec = async () => {
    const sid =
      selectedFilename === "current"
        ? (currentSessionId || (savedSessions.length > 0 ? savedSessions[0].session_id : "current"))
        : selectedFilename;
    const result = await openInMoTec(sid);
    setMotecActionMsg(result.message);
    setTimeout(() => setMotecActionMsg(null), 4000);
  };

  const handleDeleteSession = async () => {
    if (selectedFilename === "current" || selectedFilename === "local") return;
    if (
      confirm(
        `${t("Are you sure you want to delete this session?")} (${selectedFilename})`,
      )
    ) {
      setIsLoading(true);
      const success = await deleteSavedSession(selectedFilename);
      if (success) {
        setLoadedSession(null);
        setSelectedFilename("current");
        await fetchCurrentSessionData();
      } else {
        alert(t("Failed to delete session."));
      }
      setIsLoading(false);
    }
  };

  const formatTrackCanvasData = useCallback((points: AnalysisDataPoint[]) => {
    const len = points.length;
    if (len === 0) return [];

    const cachedValues = new Float64Array(len);
    let metricMax = 0.1;

    for (let i = 0; i < len; i++) {
      const p = points[i];
      let v = p.SpeedMetersPerSecond;
      if (selectedMetric === "throttle") v = (p.AccelInput || 0) / 255;
      else if (selectedMetric === "brake") v = (p.BrakeInput || 0) / 255;
      else if (selectedMetric === "grip") {
        const slip = p.TireSlipRatio || [0, 0, 0, 0];
        v = Math.max(Math.abs(slip[0]), Math.abs(slip[1]), Math.abs(slip[2]), Math.abs(slip[3]));
      } else if (selectedMetric === "suspension") {
        const susp = p.SuspTravel || [0, 0, 0, 0];
        v = susp[0];
      }

      cachedValues[i] = v;
      if (v > metricMax) metricMax = v;
    }

    const result = new Array(len);
    for (let i = 0; i < len; i++) {
      result[i] = {
        x: points[i].PositionX || 0,
        z: points[i].PositionZ || 0,
        val: metricMax > 0 ? cachedValues[i] / metricMax : 0,
        raw: points[i],
      };
    }
    return result;
  }, [selectedMetric]);

  const activeCanvasData = useMemo(() => formatTrackCanvasData(activeSession), [activeSession, formatTrackCanvasData]);
  const baseCanvasData = useMemo(() => formatTrackCanvasData(fullSessionTrackData), [fullSessionTrackData, formatTrackCanvasData]);
  const isSavedSession = selectedFilename !== "current" && selectedFilename !== "local";

  const fallbackDebrief: SessionDebriefData = debriefData || {
    total_samples: activeSession.length,
    valid_laps: lapsList.length,
    tire_thermals: { fl_avg: 0, fr_avg: 0, rl_avg: 0, rr_avg: 0, status: "no_data" },
    suspension: { peak_travel_pct: 0, bottom_out_count: 0, status: "no_data" },
    handling_balance: { understeer_pct: 50, oversteer_pct: 50, tendency: "Neutral / Balanced" },
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
                  {s.best_lap_time?.toFixed(2) ?? 0}s)
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
                    Lap {l.lap_number} ({l.lap_time.toFixed(2)}s | Max: {l.max_speed_kmh.toFixed(0)}km/h)
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
                    vs Lap {l.lap_number} ({l.lap_time.toFixed(2)}s)
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
            {selectedFilename !== "current" && selectedFilename !== "local" && (
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
            aria-label="Close"
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
                    onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
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
  background: "#111",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.2)",
  padding: "0.4rem 0.6rem",
  borderRadius: "4px",
  fontSize: "0.85rem",
  cursor: "pointer",
  minWidth: "130px",
};

export default AnalysisView;