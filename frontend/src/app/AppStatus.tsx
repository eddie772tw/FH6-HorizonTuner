import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { getBackendPort, PREFERRED_BACKEND_PORT } from '../services/backend';
import DataOutGuide, { localizeTelemetryHealth } from '../features/onboarding/DataOutGuide';
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
  const [popoverLeft, setPopoverLeft] = useState<number | null>(null);
  const popoverBaseId = useId();
  const popoverId = `${popoverBaseId}-mcp-notice`;
  const popoverTitleId = `${popoverBaseId}-mcp-title`;
  const popoverDescId = `${popoverBaseId}-mcp-desc`;
  const portWrap = useRef<HTMLDivElement>(null);
  const portTrigger = useRef<HTMLButtonElement>(null);
  const portPopover = useRef<HTMLDivElement>(null);
  const ready = isConnected && health.state === 'active';
  const connectionLabel = t(isConnected ? 'Backend connected' : 'Backend disconnected');
  const healthLabel = localizeTelemetryHealth(health, t).label;
  const closePortNotice = useCallback((restoreFocus = false) => {
    setShowPort(false);
    if (restoreFocus) portTrigger.current?.focus();
  }, []);
  const updatePopoverPosition = useCallback(() => {
    const wrapRect = portWrap.current?.getBoundingClientRect();
    if (!wrapRect || (wrapRect.width === 0 && wrapRect.left === 0 && wrapRect.right === 0)) {
      setPopoverLeft(null);
      return;
    }
    const margin = 8;
    const viewportWidth = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
    const popoverWidth = portPopover.current?.getBoundingClientRect().width
      || Math.min(360, Math.max(0, viewportWidth - margin * 2));
    const desiredLeft = wrapRect.right - popoverWidth;
    const clampedLeft = Math.max(margin, Math.min(desiredLeft, viewportWidth - popoverWidth - margin));
    setPopoverLeft(Math.round(clampedLeft - wrapRect.left));
  }, []);
  useEffect(() => {
    try { if (!hasDismissedDataOutGuide(window.localStorage)) setShowGuide(true); } catch { /* Guide remains available from the status button. */ }
  }, []);
  useEffect(() => { if (dynamicPort) setShowPort(true); }, [dynamicPort, backendPort]);
  useLayoutEffect(() => {
    if (!dynamicPort || !showPort) return;
    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    return () => window.removeEventListener('resize', updatePopoverPosition);
  }, [dynamicPort, showPort, backendPort, t, updatePopoverPosition]);
  useEffect(() => {
    if (!dynamicPort || !showPort) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !portWrap.current?.contains(event.target)) setShowPort(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]:not([aria-hidden="true"])')) return;
      const restoreFocus = Boolean(portWrap.current?.contains(document.activeElement));
      event.preventDefault();
      closePortNotice(restoreFocus);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dynamicPort, showPort, closePortNotice]);
  return <div className="d-flex align-items-center flex-wrap gap-2">
    <button type="button" className={`btn btn-sm ${ready ? 'btn-outline-success' : 'btn-outline-secondary'}`}
      aria-haspopup="dialog" aria-expanded={showGuide}
      aria-label={`${t('Open Data Out guide and health details')}. ${connectionLabel}. ${healthLabel}`}
      title={`${connectionLabel}. ${healthLabel}`} onClick={() => setShowGuide(true)}>
      {t('Data Out: ')}{ready ? t('Ready') : t('Check')}
    </button>
    {dynamicPort && <div ref={portWrap} className="position-relative">
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {`${t('MCP Endpoint Notice')}: ${t('Current backend port')}: ${backendPort}`}
      </span>
      <button
        ref={portTrigger}
        type="button"
        className="btn btn-sm btn-outline-warning"
        aria-haspopup="dialog"
        aria-expanded={showPort}
        aria-controls={showPort ? popoverId : undefined}
        aria-label={`${t('MCP')} :${backendPort} — ${t('MCP Endpoint Notice')}`}
        title={t('MCP Endpoint Notice')}
        onClick={() => setShowPort(value => !value)}
      >
        {t('MCP')} :{backendPort}
      </button>
      {showPort && <div ref={portPopover} id={popoverId} role="dialog"
        aria-labelledby={popoverTitleId} aria-describedby={popoverDescId}
        className="popover bs-popover-bottom show glass-panel p-0 shadow border position-absolute"
        style={{
          top: 'calc(100% + 8px)',
          ...(popoverLeft === null ? { right: 0, left: 'auto' } : { left: `${popoverLeft}px`, right: 'auto' }),
          width: 'min(360px, calc(100vw - 16px))',
          maxWidth: 'calc(100vw - 16px)',
          zIndex: 1055,
        }}>
        <div className="popover-header bg-transparent border-bottom px-3 py-2 d-flex align-items-center justify-content-between gap-2">
          <strong id={popoverTitleId} className="text-warning-emphasis m-0">{t('MCP Endpoint Notice')}</strong>
          <button type="button" className="btn-close flex-shrink-0" aria-label={t('Close')} onClick={() => closePortNotice(true)} />
        </div>
        <div className="popover-body px-3 py-2 text-body">
          <p id={popoverDescId} className="mb-2">{t('Release Build could not use backend port 8001 and selected a dynamic port.')}</p>
          <p className="mb-2">{t('Current backend port')}: <code>{backendPort}</code></p>
          <button type="button" className="btn btn-sm btn-outline-warning" onClick={() => { portTrigger.current?.focus(); setShowPort(false); onOpenMcp(); }}>{t('Open MCP Settings')}</button>
        </div>
      </div>}
    </div>}
    <DataOutGuide health={health} open={showGuide} onClose={() => setShowGuide(false)} />
  </div>;
}
