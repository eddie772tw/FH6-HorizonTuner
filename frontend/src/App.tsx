import React, { useState } from 'react';
import Navigation from './components/Navigation';
import TelemetryView from './components/TelemetryView';
import TuningView from './components/TuningView';
import CarParamsView from './components/CarParamsView';
import SettingsView from './components/SettingsView';
import { useTelemetry } from './hooks/useTelemetry';
import { CarParamsProvider, useCarParams } from './context/CarParamsContext';
import { SettingsProvider } from './context/SettingsContext';
import './App.css';

const AppContent: React.FC = () => {
  const { isConnected } = useTelemetry();
  const [activeTab, setActiveTab] = useState<'telemetry' | 'tuning' | 'car_params' | 'settings'>('telemetry');
  const { carId, setCarId, telemetryCarId } = useCarParams();

  // Auto-synchronize back to telemetry car when returning to telemetry tab
  React.useEffect(() => {
    if (activeTab === 'telemetry' && telemetryCarId && telemetryCarId !== '0' && carId !== telemetryCarId) {
      setCarId(telemetryCarId);
    }
  }, [activeTab, telemetryCarId, carId, setCarId]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', color: 'var(--text)' }}>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} isConnected={isConnected} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '2rem', boxSizing: 'border-box' }}>
        <div style={{ display: activeTab === 'telemetry' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TelemetryView />
        </div>
        <div style={{ display: activeTab === 'tuning' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TuningView setActiveTab={setActiveTab} />
        </div>
        <div style={{ display: activeTab === 'car_params' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <CarParamsView />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <SettingsView />
        </div>
      </main>
    </div>
  );
};

import { TelemetryRecorderProvider } from './context/TelemetryRecorderContext';

const App: React.FC = () => {
  return (
    <SettingsProvider>
      <CarParamsProvider>
        <TelemetryRecorderProvider>
          <AppContent />
        </TelemetryRecorderProvider>
      </CarParamsProvider>
    </SettingsProvider>
  );
};

export default App;
