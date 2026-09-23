/** App navigation contracts are data-only: importing them never loads a feature UI. */
export type WorkspaceId = 'live' | 'tune' | 'sessions' | 'hud';
export type AppVariant = 'full' | 'lite';
export type AppSurface = 'settings' | 'appearance' | 'diagnostics' | 'updates' | 'about' | 'companion';

export interface AppCapabilities {
  readonly tuning: boolean;
  readonly sessions: boolean;
  readonly developerTuning: boolean;
  readonly launchTest: boolean;
}

export interface WorkspaceDefinition {
  readonly id: WorkspaceId;
  readonly label: string;
  readonly capability?: keyof AppCapabilities;
}

export const WORKSPACES: readonly WorkspaceDefinition[] = [
  { id: 'live', label: 'Live' },
  { id: 'tune', label: 'Tune', capability: 'tuning' },
  { id: 'sessions', label: 'Sessions', capability: 'sessions' },
  { id: 'hud', label: 'HUD' },
];

const VARIANTS: Readonly<Record<AppVariant, AppCapabilities>> = {
  full: { tuning: true, sessions: true, developerTuning: true, launchTest: true },
  lite: { tuning: false, sessions: false, developerTuning: false, launchTest: false },
};

export function getAppCapabilities(variant: AppVariant): AppCapabilities {
  return VARIANTS[variant];
}

export function getWorkspaces(variant: AppVariant): readonly WorkspaceDefinition[] {
  const capabilities = getAppCapabilities(variant);
  return WORKSPACES.filter(item => !item.capability || capabilities[item.capability]);
}

/** Used at every entry point, including intents and stale stored selections. */
export function resolveWorkspace(variant: AppVariant, requested: unknown): WorkspaceId {
  return getWorkspaces(variant).find(item => item.id === requested)?.id ?? 'live';
}

/** Different domain identifiers remain different intent alternatives. */
export type SessionIntent =
  | { readonly kind: 'latest-analysis' }
  | { readonly kind: 'analysis'; readonly filename: string }
  | { readonly kind: 'road'; readonly workflowId: string };

export type AppIntent =
  | { readonly kind: 'workspace'; readonly workspace: WorkspaceId }
  | { readonly kind: 'surface'; readonly surface: AppSurface }
  | { readonly kind: 'session'; readonly session: SessionIntent };

export function permitsIntent(variant: AppVariant, intent: AppIntent): boolean {
  if (intent.kind === 'session') return getAppCapabilities(variant).sessions;
  if (intent.kind === 'workspace') return resolveWorkspace(variant, intent.workspace) === intent.workspace;
  return true;
}
