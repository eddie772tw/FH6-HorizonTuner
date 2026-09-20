import { useMemo } from 'react';
import {
  deriveHudCapabilities,
  type HudCapabilitySet,
} from './hudCapabilities';
import {
  createHudNativeAdapter,
  type HudNativeAdapter,
  type HudNativeInvoke,
} from './hudNativeAdapter';
import {
  useOverlayControlRuntime,
} from './OverlayControlRuntimeProvider';
import type {
  OverlayControlRuntime,
  OverlayControlSnapshot,
} from './overlayControlRuntime';

interface TauriWindow {
  __TAURI__?: {
    core?: {
      invoke?: HudNativeInvoke;
    };
  };
}

function getBrowserNativeInvoke(): HudNativeInvoke | undefined {
  if (typeof window === 'undefined') return undefined;
  const candidate = (window as unknown as TauriWindow).__TAURI__?.core?.invoke;
  return typeof candidate === 'function' ? candidate : undefined;
}

export interface HudController extends OverlayControlRuntime, OverlayControlSnapshot {
  native: HudNativeAdapter;
  capabilities: HudCapabilitySet;
}

export function useHudController(): HudController {
  const runtime = useOverlayControlRuntime();
  const native = useMemo(() => createHudNativeAdapter(getBrowserNativeInvoke()), []);
  const capabilities = useMemo(
    () => deriveHudCapabilities({
      nativeAvailable: native.available,
      hudStyle: runtime.config.hudStyle,
    }),
    [native.available, runtime.config.hudStyle],
  );

  return { ...runtime, native, capabilities };
}
