import { lazy } from 'react';
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
  sessions: SessionsWorkspaceBridge,
};

function FullWorkspaceShell() {
  const { applySessionIntent } = useSessionsState();
  return <AppShell variant="full" workspaces={workspaces} Runtime={SessionsRuntime} prepareSession={applySessionIntent} />;
}

export default function App() {
  return <AppProviders>
    <HudProvider>
      <TuneSessionProvider>
        <CompanionHostBridge />
        <RoadValidationProvider>
          <SessionsStateProvider>
            <FullWorkspaceShell />
          </SessionsStateProvider>
        </RoadValidationProvider>
      </TuneSessionProvider>
    </HudProvider>
    <ToastContainer />
  </AppProviders>;
}
