import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSettings } from './SettingsContext';

export interface AnalysisDataPoint {
  time: number;                  // Seconds since recording started
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
  size: number;
  mtime: number;
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
  fetchCurrentSessionData: () => Promise<AnalysisDataPoint[]>;
  fetchSavedSessionsList: () => Promise<void>;
  loadSavedSession: (filename: string) => Promise<AnalysisDataPoint[] | null>;
  deleteSavedSession: (filename: string) => Promise<boolean>;
}

const TelemetryRecorderContext = createContext<TelemetryRecorderContextType | undefined>(undefined);

export const TelemetryRecorderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCount, setRecordingCount] = useState(0);
  const [currentSession, setCurrentSession] = useState<AnalysisDataPoint[]>([]);
  const [loadedSession, setLoadedSession] = useState<AnalysisDataPoint[] | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSessionHeader[]>([]);

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

  // Fetch the list of saved sessions on mount
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

  const fetchCurrentSessionData = async (): Promise<AnalysisDataPoint[]> => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/analysis/data');
      const data = await res.json();
      if (Array.isArray(data)) {
        setCurrentSession(data);
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
      setCurrentSession([]);
      setRecordingCount(0);
    } catch (e) {
      console.error('Failed to clear current session on backend:', e);
    }
  };

  const saveCurrentSessionToBackend = async (): Promise<string | null> => {
    try {
      const res = await fetch('http://127.0.0.1:8001/api/analysis/sessions/save', { method: 'POST' });
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

  const loadSavedSession = async (filename: string): Promise<AnalysisDataPoint[] | null> => {
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${encodeURIComponent(filename)}`);
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

  const deleteSavedSession = async (filename: string): Promise<boolean> => {
    try {
      const res = await fetch(`http://127.0.0.1:8001/api/analysis/sessions/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data && !data.error) {
        await fetchSavedSessionsList();
        if (loadedSession && loadedSession === data) { // simple check or clear if matching
          setLoadedSession(null);
        }
        return true;
      }
    } catch (e) {
      console.error(`Failed to delete saved session ${filename}:`, e);
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
      deleteSavedSession
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

