import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { backendFetch } from '../../services/backend';
import { useSettings } from '../../context/SettingsContext';
import {
  createOverlayControlRuntime,
  type OverlayControlRuntime,
  type OverlayControlSnapshot,
} from './overlayControlRuntime';

const OverlayControlRuntimeContext = createContext<OverlayControlRuntime | null>(null);

interface BrowserRuntimeHost {
  runtime: OverlayControlRuntime;
  channel: BroadcastChannel;
  onMessage: (event: MessageEvent) => void;
  consumers: number;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

function createBrowserRuntimeHost(): BrowserRuntimeHost {
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
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === 'config') runtime.acceptBroadcast(event.data.data);
  };
  channel.addEventListener('message', onMessage);
  return { runtime, channel, onMessage, consumers: 0, releaseTimer: null };
}

let sharedRuntimeHost: BrowserRuntimeHost | null = null;

function getSharedRuntime(): OverlayControlRuntime {
  if (!sharedRuntimeHost) sharedRuntimeHost = createBrowserRuntimeHost();
  return sharedRuntimeHost.runtime;
}

function retainSharedRuntime(runtime: OverlayControlRuntime) {
  const host = sharedRuntimeHost;
  if (!host || host.runtime !== runtime) return;
  host.consumers += 1;
  if (host.releaseTimer !== null) {
    clearTimeout(host.releaseTimer);
    host.releaseTimer = null;
  }
}

function releaseSharedRuntime(runtime: OverlayControlRuntime) {
  const host = sharedRuntimeHost;
  if (!host || host.runtime !== runtime) return;
  host.consumers = Math.max(0, host.consumers - 1);
  if (host.consumers !== 0 || host.releaseTimer !== null) return;

  const releaseWhenIdle = () => {
    if (host !== sharedRuntimeHost || host.consumers !== 0) return;
    if (host.runtime.getSnapshot().pendingWrites > 0) {
      host.releaseTimer = setTimeout(releaseWhenIdle, 50);
      return;
    }
    host.channel.removeEventListener('message', host.onMessage);
    host.channel.close();
    sharedRuntimeHost = null;
  };

  // StrictMode immediately remounts effects in development. Deferring release
  // keeps one channel/listener per app session without cancelling any write.
  host.releaseTimer = setTimeout(releaseWhenIdle, 0);
}

export const OverlayControlRuntimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const runtime = useMemo(getSharedRuntime, []);

  useEffect(() => {
    retainSharedRuntime(runtime);
    return () => releaseSharedRuntime(runtime);
  }, [runtime]);

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
