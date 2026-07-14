import React, { useState, useEffect } from 'react';
import '../App.css';
import { useSettings } from '../context/SettingsContext';

interface NavigationProps {
  activeTab: 'telemetry' | 'overlay' | 'tuning' | 'car_params' | 'settings';
  setActiveTab: (tab: 'telemetry' | 'overlay' | 'tuning' | 'car_params' | 'settings') => void;
  isConnected: boolean;
  onShowLogs: () => void;
}

const GitInfoBadge: React.FC = () => {
  const [gitText, setGitText] = useState<string>(() => {
    if (typeof __GIT_BRANCH__ !== 'undefined' && typeof __GIT_COMMIT__ !== 'undefined') {
      return `${__GIT_BRANCH__} (${__GIT_COMMIT__})`;
    }
    return '';
  });

  useEffect(() => {
    if (typeof __GIT_BRANCH__ === 'undefined' || typeof __GIT_COMMIT__ === 'undefined') return;
    if (__GIT_BRANCH__ !== 'main') return;

    const checkReleaseStatus = async () => {
      try {
        const repo = "eddie772tw/FH6-HorizonTuner";
        const releasesRes = await fetch(`https://api.github.com/repos/${repo}/releases`);
        if (!releasesRes.ok) return;
        const releases = await releasesRes.json();
        if (releases.length === 0) return;

        const latestTag = releases[0].tag_name;
        const pureCommit = __GIT_COMMIT__.replace(/^post-/, '');

        const compareRes = await fetch(`https://api.github.com/repos/${repo}/compare/${latestTag}...${pureCommit}`);
        if (!compareRes.ok) return;

        const compareData = await compareRes.json();
        let statusStr = "";
        if (compareData.status === "ahead") {
          statusStr = ` (ahead of ${latestTag} by ${compareData.ahead_by} commits)`;
        } else if (compareData.status === "behind") {
          statusStr = ` (behind ${latestTag})`;
        } else if (compareData.status === "identical") {
          if (!__GIT_COMMIT__.startsWith('post-')) {
            setGitText(`${__GIT_BRANCH__} (${latestTag})`);
            return;
          }
        }

        setGitText(`${__GIT_BRANCH__} (${__GIT_COMMIT__})${statusStr}`);
      } catch (e) {
        console.warn("Failed to check release status", e);
      }
    };

    checkReleaseStatus();
  }, []);

  if (typeof __GIT_BRANCH__ === 'undefined' || typeof __GIT_COMMIT__ === 'undefined') {
    return null;
  }

  return (
    <span 
      style={{
        fontSize: '0.7rem',
        color: '#a0a0a0',
        background: 'rgba(255, 255, 255, 0.05)',
        padding: '2px 8px',
        borderRadius: '4px',
        marginLeft: '10px',
        fontWeight: 'normal',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'inline-block',
        verticalAlign: 'middle',
        textShadow: 'none',
        letterSpacing: '0.5px'
      }}
    >
      {gitText}
    </span>
  );
};

const Navigation: React.FC<NavigationProps> = ({ activeTab, setActiveTab, isConnected, onShowLogs }) => {
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
        <h1 style={{ 
          margin: 0, 
          color: 'var(--primary)', 
          textShadow: '0 0 10px rgba(0, 240, 255, 0.5)', 
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center'
        }}>
          FH6-Horizon Tuner
          <GitInfoBadge />
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            onClick={() => setActiveTab('telemetry')}
            style={getTabStyle(activeTab === 'telemetry')}
          >
            {t("Telemetry")}
          </button>
          <button 
            onClick={() => setActiveTab('overlay')}
            style={getTabStyle(activeTab === 'overlay')}
          >
            {t("Dashboard Overlay")}
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
        <button
          onClick={onShowLogs}
          className="cyber-btn-glow"
          style={{
            background: 'rgba(0, 240, 255, 0.1)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            color: 'var(--primary)',
            borderRadius: '4px',
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginRight: '1rem',
            transition: 'all 0.2s',
          }}
        >
          {t("Show Logs") || "診斷日誌"}
        </button>
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
