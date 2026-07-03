import React from 'react';
import '../App.css';
import { useSettings } from '../context/SettingsContext';

interface NavigationProps {
  activeTab: 'telemetry' | 'tuning' | 'car_params' | 'settings';
  setActiveTab: (tab: 'telemetry' | 'tuning' | 'car_params' | 'settings') => void;
  isConnected: boolean;
}

const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, isConnected }) => {
  const { t } = useSettings();

  return (
    <nav style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '1rem 2rem',
      background: 'rgba(0, 0, 0, 0.5)',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(10px)',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <h1 style={{ margin: 0, color: 'var(--primary)', textShadow: '0 0 10px rgba(0, 240, 255, 0.5)', fontSize: '1.5rem' }}>
          FH6-Horizon Tuner
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => setActiveTab('telemetry')}
            style={getTabStyle(activeTab === 'telemetry')}
          >
            {t("Telemetry")}
          </button>
          <button 
            onClick={() => setActiveTab('tuning')}
            style={getTabStyle(activeTab === 'tuning')}
          >
            {t("Tuning Setup")}
          </button>
          <button 
            onClick={() => setActiveTab('car_params')}
            style={getTabStyle(activeTab === 'car_params')}
          >
            {t("Car Parameters")}
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            style={getTabStyle(activeTab === 'settings')}
          >
            {t("Settings")}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          backgroundColor: isConnected ? '#00ff00' : '#ff0000',
          boxShadow: `0 0 8px ${isConnected ? '#00ff00' : '#ff0000'}`
        }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {isConnected ? t("TELEMETRY LIVE") : t("DISCONNECTED")}
        </span>
      </div>
    </nav>
  );
};

const getTabStyle = (isActive: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
  fontSize: '1.1rem',
  fontWeight: isActive ? 'bold' : 'normal',
  cursor: 'pointer',
  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
  padding: '0.5rem 1rem',
  transition: 'all 0.2s'
});

export default Navigation;
