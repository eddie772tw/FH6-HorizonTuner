import React, { useEffect, useState } from 'react';
import LiteNavigation, { type LiteTab } from './components/LiteNavigation';
import ToastContainer from './components/common/ToastContainer';
import TelemetryView from './features/telemetry/TelemetryView';
import OverlayView from './features/overlay_control/OverlayView';
import SettingsView from './features/settings/SettingsView';
import { useTelemetry } from './hooks/useTelemetry';
import { useOverlayWebSocket } from './hooks/useOverlayWebSocket';
import { useCarParams } from './context/CarParamsContext';
import { AppProviders } from './AppProviders';
import './App.css';

const LiteAppContent: React.FC = () => {
  const { isConnected } = useTelemetry();
  useOverlayWebSocket();
  const { carId, setCarId, telemetryCarId } = useCarParams();
  const [activeTab, setActiveTab] = useState<LiteTab>('telemetry');
  const [overlayCategory, setOverlayCategory] = useState<'general' | 'displays' | 'gauges' | 'performance'>('general');

  useEffect(() => {
    if (activeTab === 'telemetry' && telemetryCarId && telemetryCarId !== '0' && carId !== telemetryCarId) {
      setCarId(telemetryCarId);
    }
  }, [activeTab, telemetryCarId, carId, setCarId]);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-color)', color: 'var(--text)' }}>
      <LiteNavigation activeTab={activeTab} onSelect={setActiveTab} isConnected={isConnected} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '2rem', boxSizing: 'border-box' }}>
        {activeTab === 'telemetry' && <TelemetryView dashboardOnly />}
        {activeTab === 'overlay' && <OverlayView category={overlayCategory} setCategory={setOverlayCategory} />}
        {activeTab === 'settings' && <SettingsView />}
      </main>
      <ToastContainer />
    </div>
  );
};

const LiteApp: React.FC = () => (
  <AppProviders>
    <LiteAppContent />
  </AppProviders>
);

export default LiteApp;
