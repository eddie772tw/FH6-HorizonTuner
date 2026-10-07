import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTelemetryRecorder, AnalysisDataPoint } from "../../context/TelemetryRecorderContext";
import { useSettings } from "../../context/SettingsContext";
import { useCustomRoutes } from "./useCustomRoutes";
import { useAnalysisSessionData } from "./useAnalysisSessionData";
import { useTelemetry } from "../../hooks/useTelemetry";
import AnalysisSessionToolbar from "./AnalysisSessionToolbar";
import AnalysisSessionVisuals from "./AnalysisSessionVisuals";
import ManualRecordingToolbar from "./ManualRecordingToolbar";
import AnalysisRouteSection from "./AnalysisRouteSection";
import SessionTrimSummaryCard from "./SessionTrimSummaryCard";
import MotecFieldMappingModal from "./MotecFieldMappingModal";
import { useSessionsState } from "../sessions/SessionsStateProvider";
import { createSessionsIo } from "../sessions/sessionsIo";

const AnalysisView: React.FC<{ onLatestAnalysis: () => void }> = ({ onLatestAnalysis }) => {
  const {
    isRecording, recordingCount, manualMode, recordingMode, armed, armedRouteId,
    currentSessionId, currentSession, loadedSession, savedSessions,
    fetchSavedSessionsList, loadSessionLaps, exportMoTecCsv, isExporting,
    openInMoTec, downloadMoTecTemplate, fetchSessionDebrief,
    startManualRecording, stopManualRecording, armRoute, disarmRoute,
    clearCurrentSession, saveCurrentSessionToBackend,
  } = useTelemetryRecorder();
  const {
    state: sessionsState, selectedFilename, selectedSessionId, isSavedSelection,
    selectCurrent, selectSaved, setPrimaryLap, setCompareLap, setMetric,
    beginSelectionOperation, setImportedSession, loadPrimaryLap, cancelPrimaryLoad, refreshCurrent,
  } = useSessionsState();
  const { data: liveTelemetry } = useTelemetry();
  const { t } = useSettings();
  const {
    routes, selectedRouteId, setSelectedRouteId,
    saveRoute, deleteRoute, importRoutes, exportRoute,
  } = useCustomRoutes();

  const [activeMode, setActiveMode] = useState<"circuit" | "time_trial" | "roaming">("circuit");
  const [showRawData, setShowRawData] = useState(false);
  const [exportRawData, setExportRawData] = useState(false);
  const [isChannelMappingOpen, setIsChannelMappingOpen] = useState(false);
  const [motecActionMsg, setMotecActionMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { selection, primaryLap, compareLap, metric: selectedMetric, isLoading } = sessionsState;

  useEffect(() => {
    if (recordingMode === "circuit" || recordingMode === "time_trial" || recordingMode === "roaming") {
      setActiveMode(recordingMode);
    }
  }, [recordingMode]);

  useEffect(() => {
    if (selection.kind !== "local") void loadPrimaryLap();
    return cancelPrimaryLoad;
  }, [cancelPrimaryLoad, loadPrimaryLap, primaryLap, selection]);

  const {
    activeSession, lapsList, compareSessionData, fullSessionTrackData,
    sessionMetadata, fallbackDebrief,
  } = useAnalysisSessionData({
    selection, selectedSessionId, loadedSession, currentSession,
    primaryLap, compareLap, showRawData, isRecording,
    loadSessionLaps, fetchSessionDebrief, refreshCurrent,
  });

  const handleDropdownChange = (f: string) => { if (f === "current") selectCurrent(); else selectSaved(f); };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const op = beginSelectionOperation();
      const res = await createSessionsIo().importMoTeCCsv(file);
      if (res && res.data && res.data.length > 0 && setImportedSession(res.data, op)) {
        // loadedSession is updated via setImportedSession
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStartManual = async () => {
    const car = liveTelemetry ? {
      ordinal: liveTelemetry.CarOrdinal,
      carClass: liveTelemetry.CarClass,
      pi: liveTelemetry.CarPerformanceIndex,
    } : undefined;
    await startManualRecording(car, activeMode, selectedRouteId ?? undefined);
  };

  const formatTrackCanvasData = useCallback((points: AnalysisDataPoint[]) => {
    const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
    const candidates = points.flatMap((p) => {
      if (!finite(p.time) || !finite(p.PositionX) || !finite(p.PositionZ) || !finite(p.SpeedMetersPerSecond)) return [];
      let val: number | null = p.SpeedMetersPerSecond;
      if (selectedMetric === "throttle") val = finite(p.AccelInput) ? p.AccelInput / 255 : null;
      else if (selectedMetric === "brake") val = finite(p.BrakeInput) ? p.BrakeInput / 255 : null;
      else if (selectedMetric === "grip") {
        const slip = (p.TireSlipRatio || []).filter(finite);
        val = slip.length > 0 ? Math.max(...slip.map(Math.abs)) : null;
      } else if (selectedMetric === "suspension") val = finite(p.SuspTravel?.[0]) ? p.SuspTravel[0] : null;
      return finite(val) ? [{ point: p, x: p.PositionX, z: p.PositionZ, value: val }] : [];
    });
    if (candidates.length === 0) return [];
    const metricMax = Math.max(0.1, ...candidates.map((c) => c.value));
    return candidates.map(({ point, x, z, value }) => ({ x, z, val: value / metricMax, raw: point }));
  }, [selectedMetric]);

  const activeCanvasData = useMemo(() => formatTrackCanvasData(activeSession), [activeSession, formatTrackCanvasData]);
  const baseCanvasData = useMemo(() => formatTrackCanvasData(fullSessionTrackData), [fullSessionTrackData, formatTrackCanvasData]);

  return (
    <div className="analysis-view">
      <ManualRecordingToolbar
        mode={activeMode}
        onModeChange={setActiveMode}
        isRecording={isRecording}
        recordingCount={recordingCount}
        manualMode={manualMode}
        armed={armed}
        onStartManual={handleStartManual}
        onStopManual={() => void stopManualRecording()}
        onClear={() => void clearCurrentSession()}
        onSave={() => void saveCurrentSessionToBackend()}
        t={t}
      />
      <AnalysisRouteSection
        activeMode={activeMode}
        routes={routes}
        selectedRouteId={selectedRouteId}
        isArmed={armed}
        armedRouteId={armedRouteId}
        liveTelemetry={liveTelemetry ?? null}
        onSelectRoute={setSelectedRouteId}
        onSaveRoute={saveRoute}
        onDeleteRoute={deleteRoute}
        onArmRoute={armRoute}
        onDisarmRoute={disarmRoute}
        onImportRoutes={importRoutes}
        onExportRoute={exportRoute}
        t={t}
      />
      <SessionTrimSummaryCard
        metadata={sessionMetadata}
        showRawData={showRawData}
        onToggleRawData={setShowRawData}
        exportRawData={exportRawData}
        onToggleExportRawData={setExportRawData}
        t={t}
      />
      <AnalysisSessionToolbar
        onLatestAnalysis={onLatestAnalysis}
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
        onOpenInMoTec={async (format = "ld") => {
          const sid = selectedSessionId === "current" ? (currentSessionId || (savedSessions[0]?.session_id ?? "current")) : (selectedSessionId || "current");
          const res = await openInMoTec(sid, format);
          setMotecActionMsg(res.message);
          setTimeout(() => setMotecActionMsg(null), 4000);
        }}
        onExportMoTec={(format = "ld") => exportMoTecCsv(selectedFilename, exportRawData, format)}
        onImportFile={handleFileUpload}
        onOpenImport={() => fileInputRef.current?.click()}
        onDownloadTemplate={downloadMoTecTemplate}
        onOpenChannelMapping={() => setIsChannelMappingOpen(true)}
        onDeleteSession={async () => {
          if (!isSavedSelection || !selectedSessionId) return;
          if (confirm(`${t("Are you sure you want to delete this session?")} (${selectedSessionId})`)) {
            const op = beginSelectionOperation();
            const ok = await createSessionsIo().deleteSavedSession(selectedSessionId);
            if (ok) { await fetchSavedSessionsList(); if (op.isCurrent()) selectCurrent(); }
          }
        }}
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
        isSavedSession={selection.kind === "saved" || selection.kind === "latest"}
        onSelectMetric={setMetric}
      />
      <MotecFieldMappingModal
        isOpen={isChannelMappingOpen}
        onClose={() => setIsChannelMappingOpen(false)}
        onDownloadTemplate={downloadMoTecTemplate}
        t={t}
      />
    </div>
  );
};

export default AnalysisView;
