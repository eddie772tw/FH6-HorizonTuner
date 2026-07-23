import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';

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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCount, setRecordingCount] = useState(0);
  const [loadedSession, setLoadedSession] = useState<AnalysisDataPoint[] | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSessionHeader[]>([]);

  const currentSession: AnalysisDataPoint[] = [];

  useEffect(() => {
    fetchSavedSessionsList();
  }, []);

  const fetchSavedSessionsList = async () => {
    try {
      const files = await apiClient.getAnalysisSessions();
      if (Array.isArray(files)) {
        setSavedSessions(files.map(filename => ({ filename, size: 0, mtime: Date.now() })));
      }
    } catch (e) {
      console.error('Failed to fetch saved sessions list:', e);
    }
  };

  const fetchCurrentSessionData = async (): Promise<AnalysisDataPoint[]> => {
    try {
      const data = (await apiClient.getAnalysisSession("latest.json")) as AnalysisDataPoint[];
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
      await apiClient.deleteAnalysisSession("latest.json");
      setLoadedSession(null);
      setRecordingCount(0);
      setIsRecording(false);
    } catch (e) {
      console.error('Failed to clear current session:', e);
    }
  };

  const saveCurrentSessionToBackend = async (): Promise<string | null> => {
    try {
      const filename = `session_${Date.now()}.json`;
      if (loadedSession) {
        await apiClient.saveAnalysisSession(filename, loadedSession);
        await fetchSavedSessionsList();
        return filename;
      }
    } catch (e) {
      console.error('Failed to save session:', e);
    }
    return null;
  };

  const loadSavedSession = async (filename: string): Promise<AnalysisDataPoint[] | null> => {
    try {
      const data = (await apiClient.getAnalysisSession(filename)) as AnalysisDataPoint[];
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
      await apiClient.deleteAnalysisSession(filename);
      await fetchSavedSessionsList();
      setLoadedSession(null);
      return true;
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
