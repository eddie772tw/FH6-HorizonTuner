import { useState, useEffect, useMemo } from "react";
import type { AnalysisDataPoint, LapSummary } from "../../context/TelemetryRecorderContext";
import { calculateFrontendDebrief, type SessionDebriefData } from "./sessionDebriefMath";
import { filterTrimmedPoints, calculateLapsFromPoints, type ValidLapWindow } from "./routeTriggerMath";
import { backendFetch } from "../../services/backend";
import { analysisDataPath, analysisSelectionKey } from "../sessions/sessionSelection";
import type { AnalysisSelection } from "../sessions/sessionSelection";

export interface UseAnalysisSessionDataParams {
  selection: AnalysisSelection;
  selectedSessionId: string | null;
  loadedSession: AnalysisDataPoint[] | null;
  currentSession: AnalysisDataPoint[];
  primaryLap: number;
  compareLap: number;
  showRawData: boolean;
  isRecording: boolean;
  currentSessionId: string | null;
  loadSessionLaps: (id: string) => Promise<LapSummary[]>;
  fetchSessionDebrief: (id: string) => Promise<SessionDebriefData | null>;
  refreshCurrent: (finalized?: boolean) => Promise<AnalysisDataPoint[] | null>;
}

export function useAnalysisSessionData({
  selection,
  selectedSessionId,
  loadedSession,
  currentSession,
  primaryLap,
  compareLap,
  showRawData,
  isRecording,
  currentSessionId,
  loadSessionLaps,
  fetchSessionDebrief,
  refreshCurrent,
}: UseAnalysisSessionDataParams) {
  const [lapsList, setLapsList] = useState<LapSummary[]>([]);
  const [compareSessionData, setCompareSessionData] = useState<AnalysisDataPoint[]>([]);
  const [fullSessionTrackData, setFullSessionTrackData] = useState<AnalysisDataPoint[]>([]);
  const [debriefData, setDebriefData] = useState<SessionDebriefData | null>(null);
  const [sessionMetadata, setSessionMetadata] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!selectedSessionId || selection.kind === "local") {
      setSessionMetadata(null);
      return;
    }
    let active = true;
    setSessionMetadata(null);
    void backendFetch(`/api/analysis/sessions/${encodeURIComponent(selectedSessionId)}/metadata`)
      .then((r) => r.json())
      .then((meta) => { if (active) setSessionMetadata(meta ?? null); })
      .catch(() => { if (active) setSessionMetadata(null); });
    return () => { active = false; };
  }, [selectedSessionId, selection.kind, isRecording, currentSessionId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const selectedKey = analysisSelectionKey(selection);
    const loadSupportingData = async () => {
      if (selection.kind === "local") {
        setLapsList(calculateLapsFromPoints(loadedSession ?? []));
        setFullSessionTrackData(loadedSession ?? []);
        setDebriefData(loadedSession && loadedSession.length > 0 ? calculateFrontendDebrief(loadedSession) : null);
        return;
      }
      const sid = selectedSessionId;
      const fullPath = analysisDataPath(selection, 0);
      if (!sid || !fullPath) return;
      const [fullTrack, laps, debrief] = await Promise.all([
        backendFetch(fullPath, { signal: controller.signal }).then((r) => r.json()).catch(() => null),
        loadSessionLaps(sid),
        fetchSessionDebrief(sid),
      ]);
      if (!active || analysisSelectionKey(selection) !== selectedKey) return;
      setLapsList(laps);
      if (Array.isArray(fullTrack)) setFullSessionTrackData(fullTrack);
      if (debrief) setDebriefData(debrief);
    };
    void loadSupportingData();
    return () => { active = false; controller.abort(); };
  }, [fetchSessionDebrief, loadSessionLaps, loadedSession, selectedSessionId, selection, isRecording, currentSessionId]);

  useEffect(() => {
    if (!isRecording && selection.kind === "current") void refreshCurrent(true);
  }, [isRecording, currentSessionId, refreshCurrent, selection.kind]);

  useEffect(() => {
    if (!isRecording || selection.kind !== "current") return;
    const interval = window.setInterval(() => {
      void refreshCurrent().then((d) => { if (d && d.length > 0) setDebriefData(calculateFrontendDebrief(d)); });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [isRecording, refreshCurrent, selection.kind]);

  const rawActiveSession = loadedSession || currentSession;
  const activeSession = useMemo(() => {
    let pts = rawActiveSession;
    if (selection.kind === "local" && primaryLap > 0) {
      pts = pts.filter((p) => (p.LapNumber ?? 1) === primaryLap);
    }
    if (!showRawData && sessionMetadata?.trim_analysis) {
      const trim = sessionMetadata.trim_analysis as { valid_start_time: number; valid_end_time: number; trimmed_sample_count?: number; valid_lap_windows?: ValidLapWindow[] };
      if (typeof trim.valid_start_time === "number" && typeof trim.valid_end_time === "number") {
        pts = filterTrimmedPoints(pts, trim.valid_start_time, trim.valid_end_time, trim.trimmed_sample_count, trim.valid_lap_windows);
      }
    }
    return pts;
  }, [rawActiveSession, selection.kind, primaryLap, showRawData, sessionMetadata]);

  useEffect(() => {
    const summary = calculateFrontendDebrief(activeSession);
    if (selection.kind === "local" || sessionMetadata?.recording_mode === "time_trial" || sessionMetadata?.recording_mode === "roaming") {
      summary.valid_laps = lapsList.filter((lap) => lap.complete === true || Number(lap.complete) === 1).length;
    }
    setDebriefData(summary);
  }, [activeSession, lapsList, sessionMetadata, selection.kind]);

  useEffect(() => {
    if (selection.kind === "local") {
      if (compareLap > 0 && loadedSession) {
        setCompareSessionData(loadedSession.filter((p) => (p.LapNumber ?? 1) === compareLap));
      } else {
        setCompareSessionData([]);
      }
      return;
    }
    let active = true;
    const controller = new AbortController();
    const fetchCompare = async () => {
      const p = compareLap > 0 ? analysisDataPath(selection, compareLap) : null;
      if (p) {
        try {
          const data = await backendFetch(p, { signal: controller.signal }).then((r) => r.json());
          if (active && Array.isArray(data)) setCompareSessionData(data);
        } catch { if (active) setCompareSessionData([]); }
      } else setCompareSessionData([]);
    };
    void fetchCompare();
    return () => { active = false; controller.abort(); };
  }, [compareLap, loadedSession, selection]);

  const fallbackDebrief: SessionDebriefData = debriefData || {
    total_samples: activeSession.length, valid_laps: null,
    tire_thermals: { fl_avg: null, fr_avg: null, rl_avg: null, rr_avg: null, status: "no_data" },
    suspension: { peak_travel_pct: null, bottom_out_count: null, status: "no_data" },
    handling_balance: { understeer_pct: null, oversteer_pct: null, tendency: "no_data" },
  };

  return {
    activeSession,
    lapsList,
    compareSessionData,
    fullSessionTrackData,
    debriefData,
    sessionMetadata,
    fallbackDebrief,
  };
}
