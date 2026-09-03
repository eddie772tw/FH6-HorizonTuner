import React, { createContext, useContext, useEffect, useState } from "react";
import { useSettings } from "./SettingsContext";
import { backendFetch, backendHttpUrl } from "../services/backend";
import { SessionDebriefData } from "../features/analysis/sessionDebriefMath";

export interface AnalysisDataPoint {
  time: number; // Seconds since recording started
  LapNumber?: number;
  lap_distance?: number;
  SpeedMetersPerSecond: number;
  CurrentEngineRpm: number;
  Gear: number;
  AccelInput: number;
  BrakeInput: number;
  AccelerationX: number; // Lat G (m/s^2)
  AccelerationZ: number; // Lon G (m/s^2)
  SuspTravel: number[]; // [FL, FR, RL, RR] (0.0 - 1.0)
  TireSlipAngle: number[]; // [FL, FR, RL, RR] (radians)
  TireSlipRatio: number[]; // [FL, FR, RL, RR]
  TireTemp: number[]; // [FL, FR, RL, RR] (°F)
  PositionX: number;
  PositionZ: number;
}

export interface SavedSessionHeader {
  filename: string;
  session_id: string;
  car_name?: string;
  total_laps?: number;
  best_lap_time?: number;
  total_distance?: number;
  size: number;
  mtime: number;
}

export interface LapSummary {
  lap_number: number;
  lap_time: number;
  start_distance: number;
  end_distance: number;
  max_speed_kmh: number;
  avg_speed_kmh: number;
}

interface TelemetryRecorderContextType {
  isRecording: boolean;
  recordingCount: number;
  currentSessionId: string | null;
  currentSession: AnalysisDataPoint[];
  loadedSession: AnalysisDataPoint[] | null;
  savedSessions: SavedSessionHeader[];
  setLoadedSession: (data: AnalysisDataPoint[] | null) => void;
  clearCurrentSession: () => Promise<void>;
  saveCurrentSessionToBackend: () => Promise<string | null>;
  fetchCurrentSessionData: (lap?: number) => Promise<AnalysisDataPoint[]>;
  fetchSavedSessionsList: () => Promise<void>;
  loadSavedSession: (
    filename: string,
    lap?: number,
  ) => Promise<AnalysisDataPoint[] | null>;
  loadSessionLaps: (filename: string) => Promise<LapSummary[]>;
  deleteSavedSession: (filename: string) => Promise<boolean>;
  exportMoTecCsv: (filename: string) => void;
  uploadMoTecCsv: (file: File) => Promise<AnalysisDataPoint[] | null>;
  openInMoTec: (sessionId: string) => Promise<{ success: boolean; launched: boolean; message: string }>;
  downloadMoTecTemplate: () => void;
  fetchSessionDebrief: (sessionId: string) => Promise<SessionDebriefData | null>;
}

const TelemetryRecorderContext = createContext<
  TelemetryRecorderContextType | undefined
>(undefined);

export const TelemetryRecorderProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { settings } = useSettings();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCount, setRecordingCount] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadedSession, setLoadedSession] = useState<
    AnalysisDataPoint[] | null
  >(null);
  const [savedSessions, setSavedSessions] = useState<SavedSessionHeader[]>([]);

  const currentSession: AnalysisDataPoint[] = [];

  // Poll recording status from backend every 2 seconds
  useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      if (!settings.race_recording) {
        if (isRecording) setIsRecording(false);
        if (recordingCount !== 0) setRecordingCount(0);
        return;
      }
      try {
        const res = await backendFetch("/api/analysis/status");
        const data = await res.json();
        if (active && data) {
          setIsRecording(data.isRecording);
          setRecordingCount(data.recordingCount);
          setCurrentSessionId(data.currentSessionId || null);
        }
      } catch (e) {
        console.error(
          "Failed to fetch telemetry recording status from backend:",
          e,
        );
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [settings.race_recording, isRecording, recordingCount]);

  useEffect(() => {
    fetchSavedSessionsList();
  }, []);

  const fetchSavedSessionsList = async () => {
    try {
      const res = await backendFetch("/api/analysis/sessions");
      const data = await res.json();
      if (Array.isArray(data)) {
        setSavedSessions(data);
      }
    } catch (e) {
      console.error("Failed to fetch saved sessions list:", e);
    }
  };

  const fetchCurrentSessionData = async (
    lap: number = 0,
  ): Promise<AnalysisDataPoint[]> => {
    try {
      const res = await backendFetch(
        `/api/analysis/data?lap=${lap}`,
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoadedSession(data);
        return data;
      }
    } catch (e) {
      console.error("Failed to fetch current session data:", e);
    }
    return [];
  };

  const clearCurrentSession = async () => {
    try {
      await backendFetch("/api/analysis/clear", {
        method: "POST",
      });
      setLoadedSession(null);
      setRecordingCount(0);
    } catch (e) {
      console.error("Failed to clear current session on backend:", e);
    }
  };

  const saveCurrentSessionToBackend = async (): Promise<string | null> => {
    try {
      const res = await backendFetch(
        "/api/analysis/sessions/save_latest",
        { method: "POST" },
      );
      const data = await res.json();
      if (data && data.filename) {
        await fetchSavedSessionsList();
        return data.filename;
      }
    } catch (e) {
      console.error("Failed to save session to backend:", e);
    }
    return null;
  };

  const loadSavedSession = async (
    filename: string,
    lap: number = 0,
  ): Promise<AnalysisDataPoint[] | null> => {
    try {
      const res = await backendFetch(
        `/api/analysis/sessions/${encodeURIComponent(filename)}?lap=${lap}`,
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoadedSession(data);
        return data;
      }
    } catch (e) {
      console.error(`Failed to load saved session ${filename}:`, e);
    }
    return null;
  };

  const loadSessionLaps = async (filename: string): Promise<LapSummary[]> => {
    try {
      const res = await backendFetch(
        `/api/analysis/sessions/${encodeURIComponent(filename)}/laps`,
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    } catch (e) {
      console.error(`Failed to load session laps ${filename}:`, e);
    }
    return [];
  };

  const deleteSavedSession = async (filename: string): Promise<boolean> => {
    try {
      const res = await backendFetch(
        `/api/analysis/sessions/${encodeURIComponent(filename)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data && !data.error) {
        await fetchSavedSessionsList();
        setLoadedSession(null);
        return true;
      }
    } catch (e) {
      console.error(`Failed to delete saved session ${filename}:`, e);
    }
    return false;
  };

  const exportMoTecCsv = (filename: string) => {
    const url = backendHttpUrl(`/api/analysis/export/motec/${encodeURIComponent(filename)}`);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}_motec.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const uploadMoTecCsv = async (
    file: File,
  ): Promise<AnalysisDataPoint[] | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await backendFetch(
        "/api/analysis/import/motec",
        {
          method: "POST",
          body: formData,
        },
      );
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      return result.data as AnalysisDataPoint[];
    } catch (e) {
      console.error(`Failed to upload MoTeC CSV:`, e);
      return null;
    }
  };

  const openInMoTec = async (
    sessionId: string,
  ): Promise<{ success: boolean; launched: boolean; message: string }> => {
    try {
      const res = await backendFetch(
        `/api/analysis/motec/open/${encodeURIComponent(sessionId)}`,
        { method: "POST" },
      );
      const data = await res.json();
      return data;
    } catch (e: any) {
      console.error(`Failed to open session ${sessionId} in MoTeC:`, e);
      return { success: false, launched: false, message: e?.message || "Failed to open in MoTeC" };
    }
  };

  const downloadMoTecTemplate = () => {
    const url = backendHttpUrl("/api/analysis/motec/template");
    const a = document.createElement("a");
    a.href = url;
    a.download = "FH6_HorizonTuner_MoTeC_Workspace.xml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const fetchSessionDebrief = async (
    sessionId: string,
  ): Promise<SessionDebriefData | null> => {
    try {
      const res = await backendFetch(
        `/api/analysis/sessions/${encodeURIComponent(sessionId)}/debrief`,
      );
      const data = await res.json();
      if (data && !data.error) {
        return data as SessionDebriefData;
      }
    } catch (e) {
      console.error(`Failed to fetch debrief for session ${sessionId}:`, e);
    }
    return null;
  };

  return (
    <TelemetryRecorderContext.Provider
      value={{
        isRecording,
        recordingCount,
        currentSessionId,
        currentSession,
        loadedSession,
        savedSessions,
        setLoadedSession,
        clearCurrentSession,
        saveCurrentSessionToBackend,
        fetchCurrentSessionData,
        fetchSavedSessionsList,
        loadSavedSession,
        loadSessionLaps,
        deleteSavedSession,
        exportMoTecCsv,
        uploadMoTecCsv,
        openInMoTec,
        downloadMoTecTemplate,
        fetchSessionDebrief,
      }}
    >
      {children}
    </TelemetryRecorderContext.Provider>
  );
};

export const useTelemetryRecorder = () => {
  const context = useContext(TelemetryRecorderContext);
  if (context === undefined) {
    throw new Error(
      "useTelemetryRecorder must be used within a TelemetryRecorderProvider",
    );
  }
  return context;
};
