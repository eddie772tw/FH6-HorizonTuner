import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
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

const PANELS = ['Setup', 'Layout', 'Advanced'] as const;

export function HudWorkspace({ setup, layout, advanced, status, children, t, className = '', testId }: HudWorkspaceCompositionProps) {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % PANELS.length
      : event.key === 'ArrowLeft' ? (index + PANELS.length - 1) % PANELS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? PANELS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  };
  return (
    <div className={`hud-workspace container-fluid h-100 w-100 d-flex flex-column gap-3 p-0 overflow-x-hidden overflow-y-auto ${className}`.trim()} data-testid={testId}>
      <div className="nav nav-pills gap-2 flex-shrink-0" role="tablist" aria-label={t('HUD Control Panel')}>
        {PANELS.map((label, index) => (
          <button key={label} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
            aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
            className={`nav-link${selected === index ? ' active' : ''}`} ref={element => { tabs.current[index] = element; }}
            onKeyDown={event => handleKeyDown(event, index)} onClick={() => setSelected(index)}>{t(label)}</button>
        ))}
      </div>
      {selected !== 0 && status}
      {[setup, layout, advanced].map((panel, index) => (
        <div key={PANELS[index]} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0} hidden={selected !== index} className="hud-workspace-panel">
          {selected === index ? panel : null}
        </div>
      ))}
      {children}
    </div>
  );
}

export default HudWorkspace;

