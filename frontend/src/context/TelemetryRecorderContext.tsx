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
  const currentSessionRef = useRef<TelemetryData[]>([]);
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
        // Just store the data directly. It's a parsed object from WS, 
        // no need for expensive JSON.parse(JSON.stringify) anymore,
        // and we push to the ref instead of spreading into state
        // [MEMORY OPTIMIZATION] - Disabled Post-Race Recording to prevent memory leaks
        // currentSessionRef.current.push(data);
        
        // Sync to React state occasionally to update UI, or just when recording stops
        // If we need the UI to update the 'recording length', we can throttle the state update
        // if (currentSessionRef.current.length % 10 === 0) { // update state every 1 second
        //   setCurrentSession([...currentSessionRef.current]);
        // }
        
        lastSampleTimeRef.current = now;
      }
    } else {
      if (isRecording) {
        setIsRecording(false);
        // Final sync to state when recording stops
        setCurrentSession([...currentSessionRef.current]);
      }
    }
  }, [data, isRecording]);

  const clearCurrentSession = () => {
    currentSessionRef.current = [];
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
