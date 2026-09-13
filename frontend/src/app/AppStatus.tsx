import { useEffect, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { getBackendPort, PREFERRED_BACKEND_PORT } from '../services/backend';
import DataOutGuide from '../features/onboarding/DataOutGuide';
import { hasDismissedDataOutGuide } from '../features/onboarding/telemetryHealth';
import { useTelemetryHealth } from '../features/onboarding/useTelemetryHealth';

export function AppStatus({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t } = useSettings();
  const { isConnected } = useTelemetry();
  const health = useTelemetryHealth();
  const backendPort = getBackendPort();
  const dynamicPort = backendPort !== PREFERRED_BACKEND_PORT;
  const [showGuide, setShowGuide] = useState(false);
  const [showPort, setShowPort] = useState(dynamicPort);
  useEffect(() => {
    try { if (!hasDismissedDataOutGuide(window.localStorage)) setShowGuide(true); } catch { /* Guide remains available from the status button. */ }
  }, []);
  useEffect(() => { if (dynamicPort) setShowPort(true); }, [dynamicPort, backendPort]);
  return <div className="d-flex align-items-center flex-wrap gap-2">
    <button type="button" className={`btn btn-sm ${health.state === 'active' ? 'btn-outline-success' : 'btn-outline-secondary'}`}
      aria-label={`${t('Open Data Out guide and health details')}. ${health.label}`} onClick={() => setShowGuide(true)}>
      Data Out: {health.state === 'active' ? t('Ready') : t('Check')}
    </button>
    <button type="button" className={`badge border-0 ${isConnected ? 'text-bg-success' : 'text-bg-danger'}`}
      onClick={() => setShowGuide(true)} title={t('Open Data Out guide and health details')}>
      {isConnected ? t('Backend connected') : t('Backend disconnected')}
    </button>
    {dynamicPort && <div className="position-relative">
      <button type="button" className="btn btn-sm btn-outline-warning" aria-expanded={showPort} onClick={() => setShowPort(value => !value)}>MCP :{backendPort}</button>
      {showPort && <div className="popover bs-popover-bottom show glass-panel shadow border position-absolute end-0" role="status"
        style={{ top: 'calc(100% + 8px)', width: 'min(360px, 85vw)', zIndex: 1055 }}>
        <div className="popover-header d-flex justify-content-between gap-2">
          <strong>{t('MCP Endpoint Notice')}</strong><button type="button" className="btn-close" aria-label={t('Close')} onClick={() => setShowPort(false)} />
        </div>
        <div className="popover-body"><p>{t('Release Build could not use backend port 8001 and selected a dynamic port.')}</p>
          <p>{t('Current backend port')}: <code>{backendPort}</code></p>
          <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => { setShowPort(false); onOpenSettings(); }}>{t('Open MCP Settings')}</button>
        </div>
      </div>}
    </div>}
    <DataOutGuide health={health} open={showGuide} onClose={() => setShowGuide(false)} />
  </div>;
}
