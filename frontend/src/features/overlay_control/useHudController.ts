import { useMemo } from 'react';
import {
  deriveHudCapabilities,
  type HudCapabilitySet,
} from './hudCapabilities';
import {
  createHudNativeAdapter,
  getBrowserNativeInvoke,
  type HudNativeAdapter,
} from './hudNativeAdapter';
import {
  useOverlayControlRuntime,
} from './OverlayControlRuntimeProvider';
import type {
  OverlayControlRuntime,
  OverlayControlSnapshot,
} from './overlayControlRuntime';

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
