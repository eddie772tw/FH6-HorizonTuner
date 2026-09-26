import { lazy } from 'react';
import { hudWorkspaces } from '@platform/hud';
import type { WorkspaceRegistry } from './AppShell';

/** Only the active page is mounted; both variants share these two entry points. */
export const commonWorkspaces: WorkspaceRegistry = {
  live: lazy(() => import('../features/live/LiveWorkspace').then(module => ({ default: module.LiveWorkspace }))),
  ...hudWorkspaces,
};
