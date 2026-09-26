import { lazy, type ReactNode } from 'react';
import { OverlayControlRuntimeProvider } from '../features/overlay_control/OverlayControlRuntimeProvider';
import { useOverlayWebSocket } from '../hooks/useOverlayWebSocket';
import { getRuntimeCapabilities } from '../services/runtimeCapabilities';

export const hudWorkspaces = { hud: lazy(() => import('../features/overlay_control/OverlayView')) };
export function HudProvider({ children }: { children: ReactNode }) {
  return getRuntimeCapabilities().hudOverlay
    ? <OverlayControlRuntimeProvider>{children}</OverlayControlRuntimeProvider> : <>{children}</>;
}
function OverlayRuntime() { useOverlayWebSocket(); return null; }
export function HudRuntime() { return getRuntimeCapabilities().hudOverlay ? <OverlayRuntime /> : null; }
