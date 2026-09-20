import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTelemetryRecorder, AnalysisDataPoint, LapSummary } from "../../context/TelemetryRecorderContext";
import { useSettings } from "../../context/SettingsContext";
import { calculateFrontendDebrief, type SessionDebriefData } from "./sessionDebriefMath";
import AnalysisSessionToolbar from "./AnalysisSessionToolbar";
import AnalysisSessionVisuals from "./AnalysisSessionVisuals";
import { backendFetch } from "../../services/backend";
import { useSessionsState } from "../sessions/SessionsStateProvider";
import { analysisDataPath, analysisSelectionKey } from "../sessions/sessionSelection";
import { createSessionsIo } from "../sessions/sessionsIo";

const AnalysisView: React.FC = () => {
  const { isRecording, recordingCount, currentSessionId, currentSession, loadedSession, savedSessions, fetchSavedSessionsList, loadSessionLaps, exportMoTecCsv, isExporting, openInMoTec, downloadMoTecTemplate, fetchSessionDebrief } = useTelemetryRecorder();
  const { state: sessionsState, selectedFilename, selectedSessionId, isSavedSelection, selectCurrent, selectSaved, setPrimaryLap, setCompareLap, setMetric, beginSelectionOperation, setImportedSession, loadPrimaryLap, cancelPrimaryLoad, refreshCurrent } = useSessionsState();
  const { t } = useSettings();
  const [motecActionMsg, setMotecActionMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lapsList, setLapsList] = useState<LapSummary[]>([]);
  const [compareSessionData, setCompareSessionData] = useState<AnalysisDataPoint[]>([]);
  const [fullSessionTrackData, setFullSessionTrackData] = useState<AnalysisDataPoint[]>([]);
  const [debriefData, setDebriefData] = useState<SessionDebriefData | null>(null);
  const { selection, primaryLap, compareLap, metric: selectedMetric, isLoading } = sessionsState;

  useEffect(() => {
    if (selection.kind !== "local") void loadPrimaryLap();
    return cancelPrimaryLoad;
  }, [cancelPrimaryLoad, loadPrimaryLap, primaryLap, selection]);

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
        backendFetch(fullTrackPath, { signal: controller.signal }).then(response => response.json()).catch(() => null),
        selection.kind === "current" ? Promise.resolve([]) : loadSessionLaps(sessionId),
        fetchSessionDebrief(sessionId),
      ]);
      if (!active || analysisSelectionKey(selection) !== selectedKey) return;
      setLapsList(laps);
      if (Array.isArray(fullTrack)) setFullSessionTrackData(fullTrack);
      if (debrief) setDebriefData(debrief);
    };
    void loadSupportingData();
    return () => { active = false; controller.abort(); };
  }, [fetchSessionDebrief, loadSessionLaps, loadedSession, selectedSessionId, selection]);

  useEffect(() => {
    if (!isRecording || selection.kind !== "current") return;
    const intervalId = window.setInterval(() => {
      void refreshCurrent().then(data => { if (data && data.length > 0) setDebriefData(calculateFrontendDebrief(data)); });
    }, 4000);
    return () => window.clearInterval(intervalId);
  }, [isRecording, refreshCurrent, selection.kind]);

  const activeSession = loadedSession || currentSession;
  useEffect(() => { if (activeSession.length > 0) setDebriefData(calculateFrontendDebrief(activeSession)); }, [activeSession]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const fetchCompareData = async () => {
      const path = compareLap > 0 ? analysisDataPath(selection, compareLap) : null;
      if (path) {
        try {
          const data = await backendFetch(path, { signal: controller.signal }).then(response => response.json());
          if (active && Array.isArray(data)) setCompareSessionData(data);
        } catch { if (active) setCompareSessionData([]); }
      } else setCompareSessionData([]);
    };
    void fetchCompareData();
    return () => { active = false; controller.abort(); };
  }, [compareLap, selection]);

  const handleDropdownChange = (filename: string) => { if (filename === "current") selectCurrent(); else selectSaved(filename); };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const operation = beginSelectionOperation();
      const data = await createSessionsIo().importMoTeCCsv(file);
      if (data && data.length > 0 && setImportedSession(data, operation)) {
        setFullSessionTrackData(data);
        setDebriefData(calculateFrontendDebrief(data));
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenInMoTec = async () => {
    const sid = selectedSessionId === "current" ? (currentSessionId || (savedSessions.length > 0 ? savedSessions[0].session_id : "current")) : (selectedSessionId || "current");
    const result = await openInMoTec(sid);
    setMotecActionMsg(result.message);
    setTimeout(() => setMotecActionMsg(null), 4000);
  };

  const handleDeleteSession = async () => {
    if (!isSavedSelection || !selectedSessionId) return;
    if (confirm(`${t("Are you sure you want to delete this session?")} (${selectedSessionId})`)) {
      const operation = beginSelectionOperation();
      const success = await createSessionsIo().deleteSavedSession(selectedSessionId);
      if (success) {
        await fetchSavedSessionsList();
        if (operation.isCurrent()) selectCurrent();
      } else if (operation.isCurrent()) alert(t("Failed to delete session."));
    }
  };

  const formatTrackCanvasData = useCallback((points: AnalysisDataPoint[]) => {
    const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
    const candidates = points.flatMap(point => {
      if (!finite(point.time) || !finite(point.PositionX) || !finite(point.PositionZ) || !finite(point.SpeedMetersPerSecond)) return [];
      const x = point.PositionX;
      const z = point.PositionZ;
      let value: number | null = point.SpeedMetersPerSecond;
      if (selectedMetric === "throttle") value = finite(point.AccelInput) ? point.AccelInput / 255 : null;
      else if (selectedMetric === "brake") value = finite(point.BrakeInput) ? point.BrakeInput / 255 : null;
      else if (selectedMetric === "grip") {
        const slip = (point.TireSlipRatio || []).filter(finite);
        if (slip.length > 0) { let maxVal = 0; for (let i = 0; i < slip.length; i++) maxVal = Math.max(maxVal, Math.abs(slip[i])); value = maxVal; } else value = null;
      } else if (selectedMetric === "suspension") value = finite(point.SuspTravel?.[0]) ? point.SuspTravel[0] : null;
      return finite(value) ? [{ point, x, z, value }] : [];
    });
    if (candidates.length === 0) return [];
    let metricMax = 0.1;
    for (const candidate of candidates) if (candidate.value > metricMax) metricMax = candidate.value;
    return candidates.map(({ point, x, z, value }) => ({ x, z, val: value / metricMax, raw: point }));
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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1rem", overflowY: "auto", paddingRight: "0.5rem" }}>
      <AnalysisSessionToolbar
        t={t}
        isRecording={isRecording}
        recordingCount={recordingCount}
        activeSessionLength={activeSession.length}
        selectedFilename={selectedFilename}
        savedSessions={savedSessions}
        lapsList={lapsList}
        primaryLap={primaryLap}
        compareLap={compareLap}
        isSavedSelection={isSavedSelection}
        motecActionMsg={motecActionMsg}
        isExporting={isExporting}
        fileInputRef={fileInputRef}
        onSelectSession={handleDropdownChange}
        onSelectPrimaryLap={setPrimaryLap}
        onSelectCompareLap={setCompareLap}
        onOpenInMoTec={handleOpenInMoTec}
        onExportMoTec={() => exportMoTecCsv(selectedFilename)}
        onImportFile={handleFileUpload}
        onOpenImport={() => fileInputRef.current?.click()}
        onDownloadTemplate={downloadMoTecTemplate}
        onDeleteSession={handleDeleteSession}
        onCloseMessage={() => setMotecActionMsg(null)}
      />
      <AnalysisSessionVisuals
        t={t}
        isLoading={isLoading}
        activeSession={activeSession}
        activeCanvasData={activeCanvasData}
        baseCanvasData={baseCanvasData}
        compareSessionData={compareSessionData}
        fallbackDebrief={fallbackDebrief}
        selectedMetric={selectedMetric}
        primaryLap={primaryLap}
        compareLap={compareLap}
        isRecording={isRecording}
        isSavedSession={isSavedSession}
        onSelectMetric={setMetric}
      />
    </div>
  );
};

export default AnalysisView;
