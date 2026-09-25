import { useEffect, useRef, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { getBackendPort, PREFERRED_BACKEND_PORT } from '../services/backend';
import DataOutGuide from '../features/onboarding/DataOutGuide';
import { hasDismissedDataOutGuide } from '../features/onboarding/telemetryHealth';
import { useTelemetryHealth } from '../features/onboarding/useTelemetryHealth';

export function AppStatus({ onOpenMcp }: { onOpenMcp: () => void }) {
  const { t } = useSettings();
  const { isConnected } = useTelemetry();
  const health = useTelemetryHealth();
  const backendPort = getBackendPort();
  const dynamicPort = backendPort !== PREFERRED_BACKEND_PORT;
  const [showGuide, setShowGuide] = useState(false);
  const [showPort, setShowPort] = useState(dynamicPort);
  const portTrigger = useRef<HTMLButtonElement>(null);
  const ready = isConnected && health.state === 'active';
  const connectionLabel = t(isConnected ? 'Backend connected' : 'Backend disconnected');
  useEffect(() => {
    try { if (!hasDismissedDataOutGuide(window.localStorage)) setShowGuide(true); } catch { /* Guide remains available from the status button. */ }
  }, []);
  useEffect(() => { if (dynamicPort) setShowPort(true); }, [dynamicPort, backendPort]);
  return <div className="d-flex align-items-center flex-wrap gap-2">
    <button type="button" className={`btn btn-sm ${ready ? 'btn-outline-success' : 'btn-outline-secondary'}`}
      aria-label={`${t('Open Data Out guide and health details')}. ${connectionLabel}. ${health.label}`}
      title={`${connectionLabel}. ${health.label}`} onClick={() => setShowGuide(true)}>
      {t('Data Out: ')}{ready ? t('Ready') : t('Check')}
    </button>
    {dynamicPort && <div className="position-relative">
      <button ref={portTrigger} type="button" className="btn btn-sm btn-outline-warning" aria-expanded={showPort} onClick={() => setShowPort(value => !value)}>MCP :{backendPort}</button>
      {showPort && <div className="popover bs-popover-bottom show glass-panel shadow border position-absolute end-0" role="status"
        style={{ top: 'calc(100% + 8px)', width: 'min(360px, 85vw)', zIndex: 1055 }}>
        <div className="popover-header d-flex justify-content-between gap-2">
          <strong>{t('MCP Endpoint Notice')}</strong><button type="button" className="btn-close" aria-label={t('Close')} onClick={() => setShowPort(false)} />
        </div>
        <div className="popover-body"><p>{t('Release Build could not use backend port 8001 and selected a dynamic port.')}</p>
          <p>{t('Current backend port')}: <code>{backendPort}</code></p>
          <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => { portTrigger.current?.focus(); setShowPort(false); onOpenMcp(); }}>{t('Open MCP Settings')}</button>
        </div>
      </div>}
    </div>}
    <DataOutGuide health={health} open={showGuide} onClose={() => setShowGuide(false)} />
  </div>;
}
