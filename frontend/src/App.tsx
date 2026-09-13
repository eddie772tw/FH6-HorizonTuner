import { lazy } from 'react';
import { AppProviders } from './AppProviders';
import { AppShell, type WorkspaceRegistry } from './app/AppShell';
import { commonWorkspaces } from './app/commonWorkspaces';
import ToastContainer from './components/common/ToastContainer';
import { TuneSessionProvider } from './features/tuning/TuneSessionProvider';
import { RoadValidationProvider } from './features/road/RoadValidationController';
import { SessionsStateProvider, useSessionsState } from './features/sessions/SessionsStateProvider';
import { SessionsRuntime } from './features/sessions/SessionsRuntime';
import { OverlayControlRuntimeProvider } from './features/overlay_control/OverlayControlRuntimeProvider';
import './App.css';

const workspaces: WorkspaceRegistry = {
  ...commonWorkspaces,
  tune: lazy(() => import('./features/tuning/TuningWorkspace')),
  sessions: lazy(() => import('./features/sessions/SessionsWorkspace').then(module => ({ default: module.SessionsWorkspace }))),
};

function FullWorkspaceShell() {
  const { applySessionIntent } = useSessionsState();
  return <AppShell variant="full" workspaces={workspaces} Runtime={SessionsRuntime} prepareSession={applySessionIntent} />;
}

export default function App() {
  return <AppProviders>
    <OverlayControlRuntimeProvider>
      <TuneSessionProvider>
        <RoadValidationProvider>
          <SessionsStateProvider>
            <FullWorkspaceShell />
          </SessionsStateProvider>
        </RoadValidationProvider>
      </TuneSessionProvider>
    </OverlayControlRuntimeProvider>
    <ToastContainer />
  </AppProviders>;
}
