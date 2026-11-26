import { lazy, type ReactNode } from 'react';
import { useSettings } from './context/SettingsContext';
import { getRuntimeCapabilities } from './services/runtimeCapabilities';
import { AppProviders } from './AppProviders';
import { AppShell, type WorkspaceRegistry } from './app/AppShell';
import { commonWorkspaces } from './app/commonWorkspaces';
import SessionsWorkspaceBridge from './app/SessionsWorkspaceBridge';
import ToastContainer from './components/common/ToastContainer';
import { TuneSessionProvider } from './features/tuning/TuneSessionProvider';
import { CompanionHostBridge } from './features/companion/CompanionHostBridge';
import { RoadValidationProvider } from './features/road/RoadValidationController';
import { SessionsStateProvider, useSessionsState } from './features/sessions/SessionsStateProvider';
import { SessionsRuntime } from './features/sessions/SessionsRuntime';
import { HudProvider } from '@platform/hud';
import './App.css';

const workspaces: WorkspaceRegistry = {
  ...commonWorkspaces,
  tune: lazy(() => import('./features/tuning/TuningWorkspace')),
  'auto-tune': lazy(() => import('./features/auto-tune/AutoTuneWorkspace')),
  sessions: SessionsWorkspaceBridge,
};

function FullWorkspaceShell() {
  const { applySessionIntent } = useSessionsState();
  return <AppShell variant="full" workspaces={workspaces} Runtime={SessionsRuntime} prepareSession={applySessionIntent} />;
}

function EnabledCompanionBridge() {
  const { confirmedCompanionEnabled } = useSettings();
  return getRuntimeCapabilities().companion && confirmedCompanionEnabled ? <CompanionHostBridge /> : null;
}

function DesktopTuneSession({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return <TuneSessionProvider evGearingEnabled={settings.ev_experimental_enabled === true}
    cvtEvidenceEnabled={settings.cvt_evidence_enabled === true}>{children}</TuneSessionProvider>;
}

export default function App() {
  return <AppProviders>
    <HudProvider>
      <DesktopTuneSession>
        <EnabledCompanionBridge />
        <RoadValidationProvider>
          <SessionsStateProvider>
            <FullWorkspaceShell />
          </SessionsStateProvider>
        </RoadValidationProvider>
      </DesktopTuneSession>
    </HudProvider>
    <ToastContainer />
  </AppProviders>;
}
