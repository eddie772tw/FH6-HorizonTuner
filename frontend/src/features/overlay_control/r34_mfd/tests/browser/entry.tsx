import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import 'halfmoon/css/halfmoon.min.css';
import 'halfmoon/css/cores/halfmoon.cores.css';
import { applyThemeEarly } from '../../../../../app/applyThemeEarly';
import { coreThemeEntries } from '../../../../../context/themeCatalog';
import { ThemeProvider, useTheme } from '../../../../../context/ThemeContext';
import { SettingsProvider } from '../../../../../context/SettingsContext';
import { ToastProvider } from '../../../../../context/ToastContext';
import { configureBackendTransport } from '../../../../../services/backend';
import { OverlayView } from '../../../OverlayView';

type ThemeControls = ReturnType<typeof useTheme>;
declare global {
  interface Window {
    r34FixtureTheme?: {
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
    window.r34FixtureTheme = bridge;
    return () => { if (window.r34FixtureTheme === bridge) delete window.r34FixtureTheme; };
  }, [themeSettings, updateThemeSettings]);
  return null;
}
// Production theme/settings/runtime; only external HTTP/native surroundings are fixtures.
configureBackendTransport(Number(window.location.port));
applyThemeEarly();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider><ToastProvider><SettingsProvider>
    <FixtureThemeBridge /><OverlayView />
  </SettingsProvider></ToastProvider></ThemeProvider></React.StrictMode>,
);
