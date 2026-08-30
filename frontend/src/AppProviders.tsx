import React from 'react';
import { CarParamsProvider } from './context/CarParamsContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import { TelemetryRecorderProvider } from './context/TelemetryRecorderContext';
import { ToastProvider } from './context/ToastContext';

interface AppProvidersProps {
  children: React.ReactNode;
}

/** Shared application state boundary used by both Full and Lite shells. */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => (
  <ThemeProvider>
    <ToastProvider>
      <SettingsProvider>
        <CarParamsProvider>
          <TelemetryRecorderProvider>{children}</TelemetryRecorderProvider>
        </CarParamsProvider>
      </SettingsProvider>
    </ToastProvider>
  </ThemeProvider>
);
