import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useTelemetry, TelemetryData } from '../hooks/useTelemetry';

interface TelemetryRecorderContextType {
  isRecording: boolean;
  currentSession: TelemetryData[];
  loadedSession: TelemetryData[] | null;
  setLoadedSession: (data: TelemetryData[] | null) => void;
  clearCurrentSession: () => void;
}

const TelemetryRecorderContext = createContext<TelemetryRecorderContextType | undefined>(undefined);

export const TelemetryRecorderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useTelemetry();
  
  const [currentSession, setCurrentSession] = useState<TelemetryData[]>([]);
  const [loadedSession, setLoadedSession] = useState<TelemetryData[] | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // We want to sample at ~10Hz (every 100ms)
  const lastSampleTimeRef = useRef<number>(0);
  const DOWNSAMPLE_MS = 100; 

  useEffect(() => {
    if (!data) return;

    // Check if racing
    if (data.IsRaceOn === 1) {
      if (!isRecording) {
        setIsRecording(true);
      }

      const now = performance.now();
      if (now - lastSampleTimeRef.current >= DOWNSAMPLE_MS) {
        // Deep copy the data object to prevent reference issues
        const dataPoint = JSON.parse(JSON.stringify(data));
        setCurrentSession(prev => [...prev, dataPoint]);
        lastSampleTimeRef.current = now;
      }
    } else {
      if (isRecording) {
        setIsRecording(false);
      }
    }
  }, [data, isRecording]);

  const clearCurrentSession = () => {
    setCurrentSession([]);
  };

  return (
    <TelemetryRecorderContext.Provider value={{
      isRecording,
      currentSession,
      loadedSession,
      setLoadedSession,
      clearCurrentSession
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
