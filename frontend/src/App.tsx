import React, { useState } from 'react';
import Navigation from './components/Navigation';
import TelemetryView from './components/TelemetryView';
import TuningView from './components/TuningView';
import CarParamsView from './components/CarParamsView';
import { useTelemetry } from './hooks/useTelemetry';
import { CarParamsProvider } from './context/CarParamsContext';
import './App.css';

const AppContent: React.FC = () => {
  const { isConnected } = useTelemetry();
  const [activeTab, setActiveTab] = useState<'telemetry' | 'tuning' | 'car_params'>('car_params');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', color: 'var(--text)' }}>
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} isConnected={isConnected} />
      
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '2rem', boxSizing: 'border-box' }}>
        {activeTab === 'telemetry' && <TelemetryView />}
        {activeTab === 'tuning' && <TuningView />}
        {activeTab === 'car_params' && <CarParamsView />}
      </main>
    </div>
  );
};

import { TelemetryRecorderProvider } from './context/TelemetryRecorderContext';

const App: React.FC = () => {
  return (
    <CarParamsProvider>
      <TelemetryRecorderProvider>
        <AppContent />
      </TelemetryRecorderProvider>
    </CarParamsProvider>
  );
};

export default App;
