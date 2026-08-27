import React, { useState } from 'react';
import Navigation from './components/Navigation';
import TelemetryView from './features/telemetry/TelemetryView';
import TuningView from './features/tuning/TuningView';
import TuningViewDev from './features/tuning/TuningView_dev';
import CarParamsView from './features/car_params/CarParamsView';
import SettingsView from './features/settings/SettingsView';
import DiagnosticConsole from './components/DiagnosticConsole';
import ThemeView from './features/theme/ThemeView';
import { useTelemetry } from './hooks/useTelemetry';
import { useOverlayWebSocket } from './hooks/useOverlayWebSocket';
import { useCarParams } from './context/CarParamsContext';
import { useSettings } from './context/SettingsContext';
import './App.css';

import OverlayView from './features/overlay_control/OverlayView';
import { getBackendPort } from './services/backend';

const AppContent: React.FC = () => {
  const { isConnected } = useTelemetry();
  const { settings } = useSettings();
  useOverlayWebSocket();
  const [activeTab, setActiveTab] = useState<'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings'>('telemetry');
  const { carId, setCarId, telemetryCarId } = useCarParams();
  const [showLogs, setShowLogs] = useState(false);
  const [showTheme, setShowTheme] = useState(false);

  // SubTab States for Quick Jumps
  const [telemetrySubTab, setTelemetrySubTab] = useState<'live' | 'analysis' | 'drag'>('live');
  const [tuningStep, setTuningStep] = useState<number>(1);
  const [carParamsSubTab, setCarParamsSubTab] = useState<'config' | 'dyno'>('config');
  const [overlayCategory, setOverlayCategory] = useState<'general' | 'displays' | 'gauges' | 'performance'>('general');

  // Quick jump handler triggered by Navbar Dropdown
  const handleSubTabJump = (tab: 'telemetry' | 'tuning' | 'car_params' | 'overlay' | 'settings', subTarget?: any) => {
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
        onShowTheme={() => setShowTheme(true)}
        backendPort={getBackendPort()}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '2rem', boxSizing: 'border-box' }}>
        <div style={{ display: activeTab === 'telemetry' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <TelemetryView subTab={telemetrySubTab} setSubTab={setTelemetrySubTab} />
        </div>
        <div style={{ display: activeTab === 'tuning' ? 'flex' : 'none', flex: 1, flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {settings.developer_tuning_enabled ? (
            <TuningViewDev currentStep={tuningStep} setCurrentStep={setTuningStep} setActiveTab={setActiveTab} />
          ) : (
            <TuningView currentStep={tuningStep} setCurrentStep={setTuningStep} setActiveTab={setActiveTab} />
          )}
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
      </main>
      <DiagnosticConsole show={showLogs} onClose={() => setShowLogs(false)} />
      <ThemeView show={showTheme} onClose={() => setShowTheme(false)} />
    </div>
  );
};


import { AppProviders } from './AppProviders';
import ToastContainer from './components/common/ToastContainer';

const App: React.FC = () => {
  return (
    <AppProviders>
      <AppContent />
      <ToastContainer />
    </AppProviders>
  );
};

export default App;
