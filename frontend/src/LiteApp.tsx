import { AppProviders } from './AppProviders';
import { AppShell } from './app/AppShell';
import { commonWorkspaces } from './app/commonWorkspaces';
import ToastContainer from './components/common/ToastContainer';
import { HudProvider } from '@platform/hud';
import './App.css';

export default function LiteApp() {
  return <AppProviders>
    <HudProvider>
      <AppShell variant="lite" workspaces={commonWorkspaces} />
    </HudProvider>
    <ToastContainer />
  </AppProviders>;
}
