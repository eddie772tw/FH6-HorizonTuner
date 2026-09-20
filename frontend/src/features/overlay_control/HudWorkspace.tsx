import type { FC } from 'react';
import type { HudWorkspaceProps } from './hudPanelTypes';
import './HudWorkspace.css';

export const HudWorkspace: FC<HudWorkspaceProps> = ({ children, className = '', testId }) => (
  <div
    className={`hud-workspace container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto ${className}`.trim()}
    data-testid={testId}
  >
    {children}
  </div>
);

export default HudWorkspace;

