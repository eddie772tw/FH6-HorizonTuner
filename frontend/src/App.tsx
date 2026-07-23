import React, { useState } from 'react';
import Navigation from './components/Navigation';
import TelemetryView from './components/TelemetryView';
import TuningView from './components/TuningView';
import CarParamsView from './components/CarParamsView';
import SettingsView from './components/SettingsView';
import DiagnosticConsole from './components/DiagnosticConsole';
import ThemeView from './components/ThemeView';
import { useTelemetry } from './hooks/useTelemetry';
import { CarParamsProvider, useCarParams } from './context/CarParamsContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import './App.css';

import OverlayView from './components/OverlayView';

const AppContent: React.FC = () => {
  const { isConnected } = useTelemetry();
  const [activeTab, setActiveTab] = useState<'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings' | 'theme'>('telemetry');
  const { carId, setCarId, telemetryCarId } = useCarParams();
  const [showLogs, setShowLogs] = useState(false);

  // Auto-synchronize back to telemetry car when returning to telemetry tab
  React.useEffect(() => {
    if (activeTab === 'telemetry' && telemetryCarId && telemetryCarId !== '0' && carId !== telemetryCarId) {
      setCarId(telemetryCarId);
    }
  }, [activeTab, telemetryCarId, carId, setCarId]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', color: 'var(--text)' }}>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} isConnected={isConnected} onShowLogs={() => setShowLogs(true)} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '2rem', boxSizing: 'border-box' }}>
        <div style={{ display: activeTab === 'telemetry' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TelemetryView />
        </div>
        <div style={{ display: activeTab === 'tuning' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TuningView setActiveTab={setActiveTab} />
        </div>
        <div style={{ display: activeTab === 'car_params' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <CarParamsView setActiveTab={setActiveTab} />
        </div>
        <div style={{ display: activeTab === 'overlay' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <OverlayView />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <SettingsView />
        </div>
        <div style={{ display: activeTab === 'theme' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <ThemeView />
        </div>
      </main>
      {showLogs && <DiagnosticConsole onClose={() => setShowLogs(false)} />}
    </div>
  );
};

import { TelemetryRecorderProvider } from './context/TelemetryRecorderContext';

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <SettingsProvider>
      <CarParamsProvider>
        <TelemetryRecorderProvider>
          <AppContent />
        </TelemetryRecorderProvider>
      </CarParamsProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
};

export default App;
