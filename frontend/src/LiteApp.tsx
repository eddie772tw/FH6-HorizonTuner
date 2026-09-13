import { AppProviders } from './AppProviders';
import { AppShell } from './app/AppShell';
import { commonWorkspaces } from './app/commonWorkspaces';
import ToastContainer from './components/common/ToastContainer';
import { OverlayControlRuntimeProvider } from './features/overlay_control/OverlayControlRuntimeProvider';
import './App.css';

export default function LiteApp() {
  return <AppProviders>
    <OverlayControlRuntimeProvider>
      <AppShell variant="lite" workspaces={commonWorkspaces} />
    </OverlayControlRuntimeProvider>
    <ToastContainer />
  </AppProviders>;
}
