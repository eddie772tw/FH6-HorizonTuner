import { lazy } from 'react';
import type { WorkspaceRegistry } from './AppShell';

/** Only the active page is mounted; both variants share these two entry points. */
export const commonWorkspaces: WorkspaceRegistry = {
  live: lazy(() => import('../features/live/LiveWorkspace').then(module => ({ default: module.LiveWorkspace }))),
  hud: lazy(() => import('../features/overlay_control/OverlayView')),
};
