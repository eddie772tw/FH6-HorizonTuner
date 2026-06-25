import React from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import TuningCalculator from './TuningCalculator';
import '../App.css';

const Dashboard: React.FC = () => {
  const { data, isConnected } = useTelemetry();

  const rpm = data?.CurrentEngineRpm || 0;
  const maxRpm = data?.EngineMaxRpm || 8000;
  const rpmPercent = Math.min((rpm / maxRpm) * 100, 100);
  
  const gForceX = data?.AccelerationX || 0;
  const gForceY = data?.AccelerationY || 0;

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--primary)', textShadow: '0 0 10px rgba(0, 240, 255, 0.5)' }}>
          FH6 Telemetry Tuning
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '12px', height: '12px', borderRadius: '50%',
            backgroundColor: isConnected ? '#00ff00' : '#ff0000',
            boxShadow: `0 0 8px ${isConnected ? '#00ff00' : '#ff0000'}`
          }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            {isConnected ? 'LIVE' : 'DISCONNECTED'}
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        
        {/* RPM Widget */}
        <div className="glass-panel">
          <h3>Engine RPM</h3>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, margin: '1rem 0', color: 'var(--primary)' }}>
            {Math.round(rpm)} <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>RPM</span>
          </div>
          <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
            <div style={{ 
              height: '100%', 
              width: `${rpmPercent}%`, 
              background: rpmPercent > 90 ? 'var(--secondary)' : 'var(--primary)',
              transition: 'width 0.1s linear, background 0.3s ease'
            }} />
          </div>
        </div>

        {/* G-Force Widget */}
        <div className="glass-panel">
          <h3>G-Force</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', margin: '1rem 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{(gForceX / 9.81).toFixed(2)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lat G</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 700 }}>{(gForceY / 9.81).toFixed(2)}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lon G</div>
            </div>
          </div>
        </div>

        {/* Phase 2: Tuning Calculator Widget */}
        <TuningCalculator />

      </div>
    </div>
  );
};

export default Dashboard;
