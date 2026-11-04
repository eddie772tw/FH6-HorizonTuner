import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { HudSettingsTabDefinition } from './hudPanelTypes';
import './HudWorkspace.css';

export interface HudWorkspaceCompositionProps {
  t: (key: string) => string;
  tabs: readonly HudSettingsTabDefinition[];
  status: ReactNode;
  windowAction: ReactNode;
}

export function HudWorkspace({ tabs, status, windowAction, t }: HudWorkspaceCompositionProps) {
  const id = useId();
  const [selected, setSelected] = useState(tabs[0]?.id);
  const active = tabs.some(tab => tab.id === selected) ? selected : tabs[0]?.id;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(tabs[next].id);
    buttons.current.get(tabs[next].id)?.focus();
  };
  return (
    <div className="hud-workspace container-fluid h-100 w-100 d-flex flex-column p-0">
      <div className="workspace-toolbar hud-workspace-toolbar">
        <h2 className="text-primary fs-6 fw-bold m-0">{t('HUD Control Panel')}</h2>
        <div className="d-flex align-items-center flex-wrap gap-2">{windowAction}{status}</div>
      </div>
      <div className="workspace-tabs nav flex-shrink-0" role="tablist" aria-label={t('HUD Control Panel')}>
        {tabs.map((tab, index) => (
          <button key={tab.id} type="button" role="tab" id={`${id}-tab-${tab.id}`}
            aria-controls={`${id}-panel-${tab.id}`} aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            ref={button => { if (button) buttons.current.set(tab.id, button); else buttons.current.delete(tab.id); }}
            onKeyDown={event => onTabKey(event, index)} onClick={() => setSelected(tab.id)}
            className={`nav-link btn-sm ${active === tab.id ? 'active fw-bold' : ''}`}>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {/* Keep forms and their own scroll containers mounted; tabs have no HUD side effects. */}
      {tabs.map(tab => (
        <div key={tab.id} id={`${id}-panel-${tab.id}`} role="tabpanel"
          aria-labelledby={`${id}-tab-${tab.id}`} tabIndex={0} hidden={active !== tab.id}
          className="hud-workspace-content p-3">
          {tab.content}
        </div>
      ))}
    </div>
  );
}

export default HudWorkspace;

