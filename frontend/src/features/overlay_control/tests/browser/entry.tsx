import React, { lazy, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import 'halfmoon/css/halfmoon.min.css';
import 'halfmoon/css/cores/halfmoon.cores.css';
import { applyThemeEarly } from '../../../../app/applyThemeEarly';
import { coreThemeEntries } from '../../../../context/themeCatalog';
import { ThemeProvider, useTheme } from '../../../../context/ThemeContext';
import { SettingsProvider } from '../../../../context/SettingsContext';
import { ToastProvider } from '../../../../context/ToastContext';
import { configureBackendTransport } from '../../../../services/backend';
import { OverlayView } from '../../OverlayView';
import { AppProviders } from '../../../../AppProviders';
import { AppShell } from '../../../../app/AppShell';
import { commonWorkspaces } from '../../../../app/commonWorkspaces';
import { TuneSessionProvider } from '../../../tuning/TuneSessionProvider';
import { HudProvider } from '@platform/hud';

type ThemeControls = ReturnType<typeof useTheme>;
declare global {
  interface Window {
    hudSettingsFixtureTheme?: {
      entries: { core: string; designSystem: string }[];
      current: ThemeControls['themeSettings'];
      update: ThemeControls['updateThemeSettings'];
    };
  }
}
// Browser-only access to the actual provider API; never assign theme DOM attributes here.
function FixtureThemeBridge() {
  const { themeSettings, updateThemeSettings } = useTheme();
  useEffect(() => {
    const bridge = {
      entries: coreThemeEntries.map(([core, definition]) => ({ core, designSystem: definition.designSystem })),
      current: themeSettings,
      update: updateThemeSettings,
    };
    window.hudSettingsFixtureTheme = bridge;
    return () => { if (window.hudSettingsFixtureTheme === bridge) delete window.hudSettingsFixtureTheme; };
  }, [themeSettings, updateThemeSettings]);
  return null;
}
// Production theme/settings/runtime; only external HTTP/native surroundings are fixtures.
configureBackendTransport(Number(window.location.port));
applyThemeEarly();
const workspaces = { ...commonWorkspaces, tune: lazy(() => import('../../../tuning/TuningWorkspace')) };
// Visual review includes the production header, navigation, spacing and scoped theme rules.
// Sessions and companion transport are outside this HUD/Live/Tune fixture's scope.
const withShell = new URLSearchParams(window.location.search).has('shell');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{withShell ? <AppProviders><HudProvider><TuneSessionProvider>
    <FixtureThemeBridge /><AppShell variant="full" workspaces={workspaces} />
  </TuneSessionProvider></HudProvider></AppProviders> : <ThemeProvider><ToastProvider><SettingsProvider>
    <FixtureThemeBridge /><OverlayView />
  </SettingsProvider></ToastProvider></ThemeProvider>}</React.StrictMode>,
);
