import { useEffect, useState } from 'react';
import type { TelemetryData } from '../../hooks/useTelemetry';
import { advanceCalibrationProgress, isCalibrationFresh, type CalibrationProgress } from './calibrationReadiness';

export function useCalibrationReadiness(data: TelemetryData | null, connected: boolean) {
  const [progress, setProgress] = useState<CalibrationProgress | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setProgress(null);
  }, [data?.CarOrdinal, data?.CarPerformanceIndex, connected]);
  useEffect(() => {
    if (data && connected) {
      setProgress(previous => advanceCalibrationProgress(previous, data.TimestampMS, Date.now()));
    }
  }, [data?.TimestampMS, data?.CarOrdinal, data?.CarPerformanceIndex, connected]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return connected && isCalibrationFresh(progress, Math.max(now, progress?.advancedAt ?? now));
}
