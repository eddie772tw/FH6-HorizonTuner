import React, { useState } from 'react';
import Navigation from './components/Navigation';
import TelemetryView from './features/telemetry/TelemetryView';
import TuningView from './features/tuning/TuningView';
import CarParamsView from './features/car_params/CarParamsView';
import SettingsView from './features/settings/SettingsView';
import DiagnosticConsole from './components/DiagnosticConsole';
import ThemeView from './features/theme/ThemeView';
import { useTelemetry } from './hooks/useTelemetry';
import { useOverlayWebSocket } from './hooks/useOverlayWebSocket';
import { CarParamsProvider, useCarParams } from './context/CarParamsContext';
import { SettingsProvider } from './context/SettingsContext';
import { ThemeProvider } from './context/ThemeContext';
import './App.css';

import OverlayView from './features/overlay_control/OverlayView';

const AppContent: React.FC = () => {
  const { isConnected } = useTelemetry();
  useOverlayWebSocket();
  const [activeTab, setActiveTab] = useState<'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings' | 'theme'>('telemetry');
  const { carId, setCarId, telemetryCarId } = useCarParams();
  const [showLogs, setShowLogs] = useState(false);

  // SubTab States for Quick Jumps
  const [telemetrySubTab, setTelemetrySubTab] = useState<'live' | 'analysis' | 'drag'>('live');
  const [tuningStep, setTuningStep] = useState<number>(1);
  const [carParamsSubTab, setCarParamsSubTab] = useState<'config' | 'dyno'>('config');
  const [overlayCategory, setOverlayCategory] = useState<'general' | 'displays' | 'gauges' | 'performance'>('general');

  // Quick jump handler triggered by Navbar Dropdown
  const handleSubTabJump = (tab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings' | 'theme', subTarget?: any) => {
    setActiveTab(tab);
    if (subTarget) {
      if (tab === 'telemetry') setTelemetrySubTab(subTarget);
      else if (tab === 'tuning') setTuningStep(typeof subTarget === 'number' ? subTarget : 1);
      else if (tab === 'car_params') setCarParamsSubTab(subTarget);
      else if (tab === 'overlay') setOverlayCategory(subTarget);
    }
  };

  // Auto-synchronize back to telemetry car when returning to telemetry tab
  React.useEffect(() => {
    if (activeTab === 'telemetry' && telemetryCarId && telemetryCarId !== '0' && carId !== telemetryCarId) {
      setCarId(telemetryCarId);
    }
  }, [activeTab, telemetryCarId, carId, setCarId]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', color: 'var(--text)' }}>
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onSubTabJump={handleSubTabJump}
        isConnected={isConnected} 
        onShowLogs={() => setShowLogs(true)} 
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '2rem', boxSizing: 'border-box' }}>
        <div style={{ display: activeTab === 'telemetry' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TelemetryView subTab={telemetrySubTab} setSubTab={setTelemetrySubTab} />
        </div>
        <div style={{ display: activeTab === 'tuning' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TuningView currentStep={tuningStep} setCurrentStep={setTuningStep} setActiveTab={setActiveTab} />
        </div>
        <div style={{ display: activeTab === 'car_params' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <CarParamsView subTab={carParamsSubTab} setSubTab={setCarParamsSubTab} setActiveTab={setActiveTab} />
        </div>
        <div style={{ display: activeTab === 'overlay' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <OverlayView category={overlayCategory} setCategory={setOverlayCategory} />
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
