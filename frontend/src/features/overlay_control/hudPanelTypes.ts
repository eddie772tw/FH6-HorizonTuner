import type { ReactNode } from 'react';
import type { HudConfig } from './hudConfig';
import type { HudStyleEntry } from './hudStyleScanner';

export interface HudPanelSharedProps {
  config: HudConfig;
  styles: HudStyleEntry[];
  disabled?: boolean;
  onConfigPatch: (patch: Partial<HudConfig>) => void;
}

export interface HudWorkspaceProps {
  children: ReactNode;
  className?: string;
  testId?: string;
}

