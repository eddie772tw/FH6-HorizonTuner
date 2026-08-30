import { useEffect, useState } from 'react';
import { backendFetch } from '../../services/backend';
import { deriveTelemetryHealth, type TelemetryHealth, type TelemetryPipelineSnapshot } from './telemetryHealth';

const POLL_INTERVAL_MS = 10_000;

export function useTelemetryHealth(): TelemetryHealth {
  const [health, setHealth] = useState<TelemetryHealth>(() => deriveTelemetryHealth(null));

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await backendFetch('/api/diagnostics/telemetry-pipeline');
        if (!response.ok) throw new Error(`Diagnostics request failed (${response.status}).`);
        const snapshot = await response.json() as TelemetryPipelineSnapshot;
        if (active) setHealth(deriveTelemetryHealth(snapshot));
      } catch (error) {
        if (active) setHealth(deriveTelemetryHealth(null, error instanceof Error ? error.message : 'Diagnostics request failed.'));
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return health;
}
