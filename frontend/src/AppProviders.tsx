import React from 'react';
import { CarParamsProvider } from './context/CarParamsContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { TelemetryRecorderProvider } from './context/TelemetryRecorderContext';
import { ToastProvider } from './context/ToastContext';
import type { ThemeSettings } from './context/themeSettings';

interface AppProvidersProps {
  children: React.ReactNode;
  companionTheme?: ThemeSettings;
}

/** Shared application state boundary used by both Full and Lite shells. */
export const AppProviders: React.FC<AppProvidersProps> = ({ children, companionTheme }) => (
  <ThemeProvider receiveOnly={companionTheme !== undefined} initialTheme={companionTheme}>
    <ToastProvider>
      <SettingsProvider>
        <CarParamsProvider>
          <TelemetryRecorderProvider>{children}</TelemetryRecorderProvider>
        </CarParamsProvider>
      </SettingsProvider>
    </ToastProvider>
  </ThemeProvider>
);
