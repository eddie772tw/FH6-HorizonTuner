import { useCallback, useEffect, useRef, useState, Suspense, type ComponentType } from 'react';
import { useCarParams } from '../context/CarParamsContext';
import { useSettings } from '../context/SettingsContext';
import { useTelemetry } from '../hooks/useTelemetry';
import { useOverlayWebSocket } from '../hooks/useOverlayWebSocket';
import DiagnosticConsole from '../components/DiagnosticConsole';
import ThemeView from '../features/theme/ThemeView';
import SettingsView from '../features/settings/SettingsView';
import { UpdateSettingsCard } from '../features/settings/components/UpdateSettingsCard';
import { getAppBuildInfo, formatBuildInfoText } from '../services/buildInfoService';
import { AppHeader } from './AppHeader';
import { AppDialog } from './AppDialog';
import { getAppCapabilities, permitsIntent, resolveWorkspace, type AppSurface, type AppVariant, type SessionIntent, type WorkspaceId } from './workspaceManifest';

export interface WorkspaceProps {
  variant: AppVariant;
  onOpenSessions: (intent?: SessionIntent) => void;
  onOpenTune: () => void;
}
export type WorkspaceRegistry = Readonly<Partial<Record<WorkspaceId, ComponentType<WorkspaceProps>>>>;
export interface WorkspaceRuntimeProps {
  activeWorkspace: WorkspaceId;
  onOpenSessions: (intent?: SessionIntent, isRequestCurrent?: () => boolean) => void;
}

interface SessionOpenRequest {
  intent: SessionIntent;
  isRequestCurrent: () => boolean;
}

/** Transport and car synchronization outlive the active page and its canvases. */
function AppRuntime({ activeWorkspace }: { activeWorkspace: WorkspaceId }) {
  useTelemetry();
  useOverlayWebSocket();
  const { carId, setCarId, telemetryCarId } = useCarParams();
  useEffect(() => {
    if (activeWorkspace === 'live' && telemetryCarId && telemetryCarId !== '0' && carId !== telemetryCarId) setCarId(telemetryCarId);
  }, [activeWorkspace, telemetryCarId, carId, setCarId]);
  return null;
}

export function AppShell({ variant, workspaces, Runtime, prepareSession }: {
  variant: AppVariant; workspaces: WorkspaceRegistry; Runtime?: ComponentType<WorkspaceRuntimeProps>;
  prepareSession?: (intent: SessionIntent, isCurrent: () => boolean) => Promise<boolean>;
}) {
  const { t } = useSettings();
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('live');
  const [surface, setSurface] = useState<AppSurface | null>(null);
  const [failedSessionRequest, setFailedSessionRequest] = useState<SessionOpenRequest | null>(null);
  const navigationGeneration = useRef(0);
  useEffect(() => () => { navigationGeneration.current += 1; }, []);
  const selectWorkspace = useCallback((requested: WorkspaceId) => {
    navigationGeneration.current += 1;
    setFailedSessionRequest(null);
    setActiveWorkspace(resolveWorkspace(variant, requested));
  }, [variant]);
  const openSessions = useCallback((intent?: SessionIntent, isRequestCurrent: () => boolean = () => true) => {
    if (!permitsIntent(variant, { kind: 'workspace', workspace: 'sessions' })) return;
    const generation = ++navigationGeneration.current;
    setFailedSessionRequest(null);
    if (!isRequestCurrent()) return;
    if (!intent) { setActiveWorkspace('sessions'); return; }
    const isCurrent = () => generation === navigationGeneration.current && isRequestCurrent();
    void (async () => {
      let ready = false;
      try { ready = await prepareSession?.(intent, isCurrent) ?? false; } catch { /* The original workspace remains usable. */ }
      if (!isCurrent()) return;
      if (ready) setActiveWorkspace('sessions');
      else setFailedSessionRequest({ intent, isRequestCurrent });
    })();
  }, [variant, prepareSession]);
  const openSurface = useCallback((requested: AppSurface) => {
    navigationGeneration.current += 1;
    setFailedSessionRequest(null);
    setSurface(requested);
  }, []);
  const closeSurface = useCallback(() => setSurface(null), []);
  const Workspace = workspaces[resolveWorkspace(variant, activeWorkspace)];
  return <div className="d-flex flex-column vh-100" style={{ background: 'var(--bg-color)', color: 'var(--text)' }}>
    <AppRuntime activeWorkspace={activeWorkspace} />
    <AppHeader variant={variant} activeWorkspace={activeWorkspace} onSelect={selectWorkspace} onOpenSurface={openSurface} />
    {Runtime && <Runtime activeWorkspace={activeWorkspace} onOpenSessions={openSessions} />}
    <main className="d-flex flex-column flex-grow-1 overflow-hidden p-3" style={{ minHeight: 0 }} data-workspace={activeWorkspace}>
      <Suspense fallback={<div role="status" className="p-3">{t('Loading...')}</div>}>
        {Workspace && <Workspace variant={variant} onOpenSessions={openSessions} onOpenTune={() => selectWorkspace('tune')} />}
      </Suspense>
    </main>
    {failedSessionRequest && failedSessionRequest.isRequestCurrent() && <div role="alert" className="position-fixed bottom-0 end-0 m-3 p-3 glass-panel shadow"
      style={{ zIndex: 1050, maxWidth: '22rem' }}>
      <p>{t('Unable to open the requested session. Check the connection and try again.')}</p>
      <div className="d-flex gap-2">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => openSessions(failedSessionRequest.intent, failedSessionRequest.isRequestCurrent)}>{t('Retry')}</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setFailedSessionRequest(null)}>{t('Close')}</button>
      </div>
    </div>}
    {surface === 'settings' && <AppDialog title="Settings" onClose={closeSurface}><SettingsView allowDeveloperTuning={getAppCapabilities(variant).developerTuning} onOpenUpdates={() => openSurface('updates')} /></AppDialog>}
    {surface === 'updates' && <AppDialog title="Updates" onClose={closeSurface}><UpdateSettingsCard /></AppDialog>}
    {surface === 'about' && <AppDialog title="About" onClose={closeSurface}>
      <h3 className="h5">FH6 HorizonTuner{variant === 'lite' ? ' Lite' : ''}</h3>
      <p>{formatBuildInfoText(getAppBuildInfo())}</p>
      <a href="https://github.com/eddie772tw/FH6-HorizonTuner" target="_blank" rel="noreferrer">{t('Project website')}</a>
    </AppDialog>}
    <DiagnosticConsole show={surface === 'diagnostics'} onClose={closeSurface} />
    <ThemeView show={surface === 'appearance'} onClose={closeSurface} />
  </div>;
}
