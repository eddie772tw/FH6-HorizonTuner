import type { ReactNode } from 'react';
import type { HudWorkspaceProps } from './hudPanelTypes';
import './HudWorkspace.css';

export interface HudWorkspaceCompositionProps extends Omit<HudWorkspaceProps, 'children'> {
  t: (key: string) => string;
  setup: ReactNode;
  layout: ReactNode;
  advanced: ReactNode;
  status: ReactNode;
  children?: ReactNode;
}

export function HudWorkspace({ setup, layout, advanced, status, children, t, className = '', testId }: HudWorkspaceCompositionProps) {
  return (
    <div className={`hud-workspace container-fluid h-100 w-100 d-flex flex-column p-0 ${className}`.trim()} data-testid={testId}>
      <div className="workspace-toolbar hud-workspace-toolbar">
        <h2 className="text-primary fs-6 fw-bold m-0">{t('HUD Control Panel')}</h2>
        {status}
      </div>
      <div className="hud-workspace-content d-flex flex-column gap-4 p-2">
        {setup}
        {layout}
        <details className="hud-advanced-settings border-top pt-3">
          <summary className="text-primary fs-6 fw-bold">{t('Advanced settings')}</summary>
          <div className="pt-3">{advanced}</div>
        </details>
      </div>
      {children}
    </div>
  );
}

export default HudWorkspace;

