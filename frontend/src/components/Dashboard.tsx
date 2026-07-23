import React, { useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import TuningCalculator from './TuningCalculator';
import '../App.css';

const Dashboard: React.FC = () => {
  const { data, isConnected } = useTelemetry();
  const [useMetric, setUseMetric] = useState(true); // Dashboard local unit override

  const rpm = data?.CurrentEngineRpm || 0;
  const maxRpm = data?.EngineMaxRpm || 8000;
  const rpmPercent = Math.min((rpm / maxRpm) * 100, 100);
  
  const gForceX = data?.AccelerationX || 0;
  const gForceY = data?.AccelerationY || 0;

  // --- New Telemetry Data (Fetched but not displayed yet, reserved for future use) ---
  // const pitch = data?.Pitch || 0;
  // const roll = data?.Roll || 0;
  // const surfaceRumble = data?.SurfaceRumble || [0, 0, 0, 0];
  // const tireCombinedSlip = data?.TireCombinedSlip || [0, 0, 0, 0];
  // const cylinders = data?.Cylinders || 0;
  // const distanceTraveled = data?.DistanceTraveled || 0;
  // const currentRaceTime = data?.CurrentRaceTime || 0;
  // const lapNumber = data?.LapNumber || 0;
  // const racePosition = data?.RacePosition || 0;
  // -----------------------------------------------------------------------------------

  return (
    <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--primary)', textShadow: '0 0 10px rgba(0, 240, 255, 0.5)' }}>
          FH6-Horizon Tuner
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginRight: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <span style={{ color: !useMetric ? 'var(--primary)' : 'var(--text-secondary)' }} aria-hidden="true">MPH</span>
            <input
              type="checkbox"
              className="sr-only"
              checked={useMetric}
              onChange={() => setUseMetric(!useMetric)}
              aria-label="Toggle Metric Units"
            />
            <div 
              style={{
                width: '40px', height: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px',
                position: 'relative', border: '1px solid var(--primary)'
              }}
              aria-hidden="true"
            >
              <div style={{
                position: 'absolute', top: '2px', left: useMetric ? '22px' : '2px',
                width: '14px', height: '14px', background: 'var(--primary)', borderRadius: '50%',
                transition: 'left 0.2s'
              }} />
            </div>
            <span style={{ color: useMetric ? 'var(--primary)' : 'var(--text-secondary)' }} aria-hidden="true">KM/H</span>
          </label>
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
