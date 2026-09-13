import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { backendFetch } from '../../services/backend';
import { useSettings } from '../../context/SettingsContext';
import {
  createOverlayControlRuntime,
  type OverlayControlRuntime,
  type OverlayControlSnapshot,
} from './overlayControlRuntime';

const OverlayControlRuntimeContext = createContext<OverlayControlRuntime | null>(null);

function createBrowserRuntime(): OverlayControlRuntime {
  const channel = new BroadcastChannel('horizon_tuner_hud_channel');
  const runtime = createOverlayControlRuntime(
    {
      readConfig: signal => backendFetch('/api/overlay/config', { signal }),
      saveConfig: config => backendFetch('/api/overlay/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }, 2_500),
    },
    channel,
  );
  channel.addEventListener('message', event => {
    if (event.data?.type === 'config') runtime.acceptBroadcast(event.data.data);
  });
  return runtime;
}

let sharedRuntime: OverlayControlRuntime | null = null;

function getSharedRuntime(): OverlayControlRuntime {
  if (!sharedRuntime) sharedRuntime = createBrowserRuntime();
  return sharedRuntime;
}

export const OverlayControlRuntimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const runtime = useMemo(getSharedRuntime, []);

  useEffect(() => {
    void runtime.refresh();
  }, [runtime]);

  useEffect(() => {
    runtime.setEffectiveUnits({
      speed: settings.units.speed,
      boostPressure: settings.units.boostPressure,
      torque: settings.units.torque,
      power: settings.units.power,
    });
  }, [runtime, settings.units.boostPressure, settings.units.power, settings.units.speed, settings.units.torque]);

  return <OverlayControlRuntimeContext.Provider value={runtime}>{children}</OverlayControlRuntimeContext.Provider>;
};

export function useOptionalOverlayControlRuntime(): OverlayControlRuntime | null {
  return useContext(OverlayControlRuntimeContext);
}

export function useOverlayControlRuntime(): OverlayControlRuntime & OverlayControlSnapshot {
  const runtime = useOptionalOverlayControlRuntime();
  if (!runtime) throw new Error('useOverlayControlRuntime must be used within OverlayControlRuntimeProvider');
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  return { ...runtime, ...snapshot };
}
