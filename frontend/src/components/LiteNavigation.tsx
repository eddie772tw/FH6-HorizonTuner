import React from 'react';
import { useSettings } from '../context/SettingsContext';
import { PREFERRED_BACKEND_PORT, getBackendPort } from '../services/backend';

export type LiteTab = 'telemetry' | 'overlay' | 'settings';

export const LITE_TABS: ReadonlyArray<{ id: LiteTab; label: string }> = [
  { id: 'telemetry', label: 'Dashboard' },
  { id: 'overlay', label: 'HUD Overlay' },
  { id: 'settings', label: 'Settings' },
];

interface LiteNavigationProps {
  activeTab: LiteTab;
  onSelect: (tab: LiteTab) => void;
  isConnected: boolean;
}

const LiteNavigation: React.FC<LiteNavigationProps> = ({ activeTab, onSelect, isConnected }) => {
  const { t } = useSettings();
  const backendPort = getBackendPort();
  const portLabel = backendPort === PREFERRED_BACKEND_PORT ? '' : ` :${backendPort}`;

  return (
    <nav className="navbar navbar-expand border-bottom sticky-top px-4 py-2" style={{ zIndex: 1050, background: 'var(--glass-bg)', backdropFilter: 'blur(var(--glass-blur))' }}>
      <div className="container-fluid p-0 d-flex justify-content-between align-items-center">
        <span className="navbar-brand text-primary fw-bold fs-5 m-0">FH6 HorizonTuner Lite</span>
        <div className="d-flex align-items-center gap-1" role="tablist" aria-label="Lite application sections">
          {LITE_TABS.map(({ id, label }) => (
            <button key={id} type="button" className={`nav-link px-3 py-2 ${activeTab === id ? 'active text-primary fw-bold border-bottom border-2 border-primary' : 'text-body-secondary'}`} onClick={() => onSelect(id)}>
              {t(label)}
            </button>
          ))}
        </div>
        <span className={`badge ${isConnected ? 'bg-success' : 'bg-warning text-dark'}`} title={backendPort ? `Backend port ${backendPort}` : undefined}>
          {isConnected ? 'UDP ACTIVE' : 'UDP DISCONNECTED'}{portLabel}
        </span>
      </div>
    </nav>
  );
};

export default LiteNavigation;
