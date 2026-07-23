import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSettings } from './SettingsContext';

export interface AnalysisDataPoint {
  time: number;                  // Seconds since recording started
  LapNumber?: number;
  lap_distance?: number;
  SpeedMetersPerSecond: number;
  CurrentEngineRpm: number;
  Gear: number;
  AccelInput: number;
  BrakeInput: number;
  AccelerationX: number;         // Lat G (m/s^2)
  AccelerationZ: number;         // Lon G (m/s^2)
  SuspTravel: number[];          // [FL, FR, RL, RR] (0.0 - 1.0)
  TireSlipAngle: number[];       // [FL, FR, RL, RR] (radians)
  TireSlipRatio: number[];       // [FL, FR, RL, RR]
  TireTemp: number[];            // [FL, FR, RL, RR] (°F)
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

export interface AnalysisLayoutConfig {
  activeMetric: string;
  customMathChannels: Array<{ name: string; formula: string }>;
  slots?: Array<{
    id: string;
    title: string;
    domain: 'time' | 'distance' | 'lap';
    channels: Array<{
      id: string;
      name: string;
      formula: string;
      color: string;
      strokeWidth: number;
      isDashed: boolean;
    }>;
  }>;
  enabledCharts: string[];
}

interface TelemetryRecorderContextType {
  isRecording: boolean;
  recordingCount: number;
  currentSession: AnalysisDataPoint[];
  loadedSession: AnalysisDataPoint[] | null;
  savedSessions: SavedSessionHeader[];
  setLoadedSession: (data: AnalysisDataPoint[] | null) => void;
  clearCurrentSession: () => Promise<void>;
  saveCurrentSessionToBackend: () => Promise<string | null>;
  fetchCurrentSessionData: (lap?: number) => Promise<AnalysisDataPoint[]>;
  fetchSavedSessionsList: () => Promise<void>;
  loadSavedSession: (filename: string, lap?: number) => Promise<AnalysisDataPoint[] | null>;
  loadSessionLaps: (filename: string) => Promise<LapSummary[]>;
  deleteSavedSession: (filename: string) => Promise<boolean>;
  exportMoTecCsv: (filename: string) => void;
  loadAnalysisConfig: () => Promise<AnalysisLayoutConfig | null>;
  saveAnalysisConfig: (config: AnalysisLayoutConfig) => Promise<boolean>;
}

const TelemetryRecorderContext = createContext<TelemetryRecorderContextType | undefined>(undefined);

export const TelemetryRecorderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCount, setRecordingCount] = useState(0);
  const [loadedSession, setLoadedSession] = useState<AnalysisDataPoint[] | null>(null);
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
        const res = await fetch('http://127.0.0.1:8001/api/analysis/status');
        const data = await res.json();
        if (active && data) {
          setIsRecording(data.isRecording);
          setRecordingCount(data.recordingCount);
        }
      } catch (e) {
        console.error('Failed to fetch telemetry recording status from backend:', e);
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
      const res = await fetch('http://127.0.0.1:8001/api/analysis/sessions');
      const data = await res.json();
      if (Array.isArray(data)) {
        setSavedSessions(data);
      }
    } catch (e) {
      console.error('Failed to fetch saved sessions list:', e);
    }
  };

  const fetchCurrentSessionData = async (lap: number = 0): Promise<AnalysisDataPoint[]> => {
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/analysis/data?lap=${lap}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoadedSession(data);
        return data;
      }
    } catch (e) {
      console.error('Failed to fetch current session data:', e);
    }
    return [];
  };

  const clearCurrentSession = async () => {
    try {
      await fetch('http://127.0.0.1:8001/api/analysis/clear', { method: 'POST' });
      setLoadedSession(null);
      setRecordingCount(0);
    } catch (e) {
      console.error('Failed to clear current session on backend:', e);
    }
  };

  const saveCurrentSessionToBackend = async (): Promise<string | null> => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/analysis/sessions/save_latest', { method: 'POST' });
      const data = await res.json();
      if (data && data.filename) {
        await fetchSavedSessionsList();
        return data.filename;
      }
    } catch (e) {
      console.error('Failed to save session to backend:', e);
    }
    return null;
  };

  const loadSavedSession = async (filename: string, lap: number = 0): Promise<AnalysisDataPoint[] | null> => {
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${encodeURIComponent(filename)}?lap=${lap}`);
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
      const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${encodeURIComponent(filename)}/laps`);
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
      const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${encodeURIComponent(filename)}`, { method: 'DELETE' });
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
    const url = `http://127.0.0.1:8001/api/analysis/export/motec/${encodeURIComponent(filename)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_motec.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const loadAnalysisConfig = async (): Promise<AnalysisLayoutConfig | null> => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/analysis/config');
      const data = await res.json();
      if (data && !data.error) {
        return data;
      }
    } catch (e) {
      console.error('Failed to load analysis layout config:', e);
    }
    return null;
  };

  const saveAnalysisConfig = async (config: AnalysisLayoutConfig): Promise<boolean> => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/analysis/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      return !!(data && !data.error);
    } catch (e) {
      console.error('Failed to save analysis layout config:', e);
    }
    return false;
  };

  return (
    <TelemetryRecorderContext.Provider value={{
      isRecording,
      recordingCount,
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
      loadAnalysisConfig,
      saveAnalysisConfig
    }}>
      {children}
    </TelemetryRecorderContext.Provider>
  );
};

export const useTelemetryRecorder = () => {
  const context = useContext(TelemetryRecorderContext);
  if (context === undefined) {
    throw new Error('useTelemetryRecorder must be used within a TelemetryRecorderProvider');
  }
  return context;
};
