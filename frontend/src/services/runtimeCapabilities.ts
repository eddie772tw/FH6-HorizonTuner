import { backendFetch } from './backend';

export interface RuntimeCapabilities {
  hudOverlay: boolean;
  audioSpectrum: boolean;
  systemMedia: boolean;
  localMotecLaunch: boolean;
}
export interface RuntimeInfo {
  platform: string;
  capabilities: RuntimeCapabilities;
  telemetry: { port: number | null; listenAddresses: string[]; error: string | null };
}

export const BUILD_HUD_ENABLED = typeof __HUD_ENABLED__ === 'undefined' || __HUD_ENABLED__;
let runtimeInfo: RuntimeInfo | null = null;

export function projectCapabilities(capabilities: RuntimeCapabilities, includesHud: boolean): RuntimeCapabilities {
  return { ...capabilities, hudOverlay: includesHud && capabilities.hudOverlay,
    audioSpectrum: includesHud && capabilities.audioSpectrum,
    systemMedia: includesHud && capabilities.systemMedia };
}

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return projectCapabilities(runtimeInfo?.capabilities ?? {
    hudOverlay: BUILD_HUD_ENABLED, audioSpectrum: BUILD_HUD_ENABLED,
    systemMedia: BUILD_HUD_ENABLED, localMotecLaunch: BUILD_HUD_ENABLED,
  }, BUILD_HUD_ENABLED);
}

export async function fetchRuntimeInfo(signal?: AbortSignal): Promise<RuntimeInfo> {
  const response = await backendFetch('/api/runtime', { signal });
  if (!response.ok) throw new Error('Runtime capabilities are unavailable.');
  const info: RuntimeInfo = await response.json();
  if (!info.capabilities || typeof info.capabilities.hudOverlay !== 'boolean'
    || !info.telemetry || !Array.isArray(info.telemetry.listenAddresses)) {
    throw new Error('Invalid runtime capabilities response.');
  }
  return info;
}

/** Called before React mounts; capabilities never subscribe to 60 Hz telemetry. */
export async function initializeRuntimeCapabilities(): Promise<void> {
  runtimeInfo = await fetchRuntimeInfo();
}
