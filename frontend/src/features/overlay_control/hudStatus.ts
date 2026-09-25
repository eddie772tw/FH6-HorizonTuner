import type { OverlayControlStatus } from './overlayControlRuntime';

export const HUD_STATUS_LABELS = {
  loading: 'Loading...',
  saving: 'Saving...',
  applying: 'Updating HUD...',
  synced: 'HUD settings synchronized',
  attention: 'Needs attention',
} as const;

export type HudDisplayState = keyof typeof HUD_STATUS_LABELS;

/** Display only: persistence and native operations remain owned by their runtimes. */
export function deriveHudDisplayState(input: {
  status: OverlayControlStatus;
  pendingWrites: number;
  nativeBusy: boolean;
  metadataLoading: boolean;
  errors: readonly (string | null | undefined)[];
}): HudDisplayState {
  if (input.status === 'error' || input.errors.some(Boolean)) return 'attention';
  if (input.nativeBusy) return 'applying';
  if (input.pendingWrites > 0 || input.status === 'saving') return 'saving';
  if (input.status === 'loading' || input.metadataLoading) return 'loading';
  return 'synced';
}
