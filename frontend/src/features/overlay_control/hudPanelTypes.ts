import type { ReactNode } from 'react';
import type { HudConfigPatch } from './overlayControlRuntime';

export interface HudPanelActions {
  t: (key: string) => string;
  disabled?: boolean;
  onConfigPatch: (patch: HudConfigPatch) => void;
}

/** Ordered page composition; new HUD modules add an entry without changing the shell. */
export interface HudSettingsTabDefinition {
  readonly id: string;
  readonly labelKey: string;
  readonly content: ReactNode;
}

