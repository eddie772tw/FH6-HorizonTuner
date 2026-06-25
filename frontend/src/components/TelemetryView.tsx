import React, { useState, useEffect } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import AnalysisView from './AnalysisView';

const TelemetryView: React.FC = () => {
  const [subTab, setSubTab] = useState<'live' | 'analysis'>('live');
  const [historyG, setHistoryG] = useState<{lat: number, lon: number, time: number}[]>([]);
  const { data } = useTelemetry();

  useEffect(() => {
    if (!data) return;
    // We only track when racing to avoid clutter when paused/in menus
    if (data.IsRaceOn !== 1) return;

    const now = performance.now();
    const lat = (data.AccelerationX || 0) / 9.81;
    const lon = (data.AccelerationZ || 0) / 9.81;
    
    setHistoryG(prev => {
      // Append current point and filter out anything older than 30 seconds
      return [...prev, { lat, lon, time: now }].filter(p => now - p.time <= 30000);
    });
  }, [data]);

  if (subTab === 'analysis') {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <button onClick={() => setSubTab('live')} style={subTab as string === 'live' ? activeTabStyle : inactiveTabStyle}>Live Dashboard</button>
          <button onClick={() => setSubTab('analysis')} style={subTab === 'analysis' ? activeTabStyle : inactiveTabStyle}>Post-Race Analysis</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AnalysisView />
        </div>
      </div>
    );
  }

  // Basic Info
  const rpm = data?.CurrentEngineRpm || 0;
  const maxRpm = data?.EngineMaxRpm || 8000;
  const rpmPercent = Math.min((rpm / maxRpm) * 100, 100);
  const speed = (data?.SpeedMetersPerSecond || 0) * 3.6; // m/s to km/h
  const gear = data?.Gear || 0;

  // Dynamics
  const latG = (data?.AccelerationX || 0) / 9.81;
  const lonG = (data?.AccelerationZ || 0) / 9.81; // Z is forward/backward
  const powerKw = (data?.PowerWatts || 0) / 1000;
  const torque = data?.TorqueNewtons || 0;
  const boost = data?.Boost || 0;

  let pMaxLatAccel = { lat: 0, lon: 0 };
  let pMinLatAccel = { lat: 0, lon: 0 };
  let pMaxLatBrake = { lat: 0, lon: 0 };
  let pMinLatBrake = { lat: 0, lon: 0 };
  
  let pMaxLonRight = { lat: 0, lon: 0 };
  let pMinLonRight = { lat: 0, lon: 0 };
  let pMaxLonLeft = { lat: 0, lon: 0 };
  let pMinLonLeft = { lat: 0, lon: 0 };

  historyG.forEach(p => {
    // Max Lat during Accel / Brake
    if (p.lon > 0) {
      if (p.lat > pMaxLatAccel.lat) pMaxLatAccel = p;
      if (p.lat < pMinLatAccel.lat) pMinLatAccel = p;
    } else if (p.lon < 0) {
      if (p.lat > pMaxLatBrake.lat) pMaxLatBrake = p;
      if (p.lat < pMinLatBrake.lat) pMinLatBrake = p;
    }
    
    // Max Lon during Right / Left Turn
    if (p.lat > 0) {
      if (p.lon > pMaxLonRight.lon) pMaxLonRight = p;
      if (p.lon < pMinLonRight.lon) pMinLonRight = p;
    } else if (p.lat < 0) {
      if (p.lon > pMaxLonLeft.lon) pMaxLonLeft = p;
      if (p.lon < pMinLonLeft.lon) pMinLonLeft = p;
    }
  });

  const markers = [
    pMaxLatAccel, pMinLatAccel, pMaxLatBrake, pMinLatBrake,
    pMaxLonRight, pMinLonRight, pMaxLonLeft, pMinLonLeft
  ].filter(p => p.lat !== 0 || p.lon !== 0);
  
  // Laps
  const currentLap = data?.CurrentLap || 0;
  const bestLap = data?.BestLap || 0;
  const lastLap = data?.LastLap || 0;

  // Inputs
  const accel = data?.AccelInput || 0; // 0-255
  const brake = data?.BrakeInput || 0; // 0-255
  const clutch = data?.ClutchInput || 0; // 0-255
  const handbrake = data?.HandBrakeInput || 0; // 0-255
  const steer = data?.SteerInput || 0; // -127 to 127

  // Suspension & Tires
  const susp = data?.NormalizedSuspensionTravel || [0,0,0,0];
  const tireTemp = data?.TireTemp || [0,0,0,0];
  const slipRatio = data?.TireSlipRatio || [0,0,0,0];
  const slipAngle = data?.TireSlipAngle || [0,0,0,0];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button onClick={() => setSubTab('live')} style={subTab === 'live' ? activeTabStyle : inactiveTabStyle}>Live Dashboard</button>
        <button onClick={() => setSubTab('analysis')} style={subTab as string === 'analysis' ? activeTabStyle : inactiveTabStyle}>Post-Race Analysis</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '4.5fr 5.5fr', gap: '2rem', flex: 1, minHeight: '600px' }}>
      
      {/* 1. TOP-LEFT: Speed & Driver Inputs */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Driver Inputs & Engine</h3>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '1rem' }}>
          {/* TOP ROW: Speed/RPM + Steer */}
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            {/* Left: Speed & RPM */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>
                    {Math.round(rpm)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>RPM</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>
                    {gear === 0 ? 'R' : gear} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>GEAR</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
                    {Math.round(speed)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>km/h</span>
                  </div>
                </div>
              </div>
              {/* RPM Bar */}
              <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${rpmPercent}%`, background: rpmPercent > 90 ? 'var(--secondary)' : 'var(--primary)', transition: 'width 0.1s linear, background 0.3s ease' }} />
              </div>
            </div>

            {/* Right: Steer */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <span>Steer L</span>
                <span>Steer R</span>
              </div>
              <div style={{ width: '100%', height: '16px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative', marginTop: '4px' }}>
                <div style={{ 
                  position: 'absolute', height: '100%', background: 'white',
                  width: `${Math.abs(steer) / 127 * 50}%`,
                  left: steer < 0 ? `${50 - (Math.abs(steer)/127*50)}%` : '50%',
                  transition: 'width 0.05s linear, left 0.05s linear'
                }} />
                <div style={{ position: 'absolute', left: '50%', top: '-2px', bottom: '-2px', width: '2px', background: 'gray' }} />
              </div>
            </div>
          </div>

          {/* BOTTOM ROW: Inputs 2x2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <InputBar label="Throttle" value={accel} max={255} color="#00ff00" />
              <InputBar label="Brake" value={brake} max={255} color="#ff0000" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <InputBar label="Clutch" value={clutch} max={255} color="#0088ff" />
              <InputBar label="Handbrake" value={handbrake} max={255} color="#ffaa00" />
            </div>
          </div>
        </div>
      </div>

      {/* 2. TOP-RIGHT: Dynamics & Overview */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>Vehicle Dynamics Overview</h3>
        
        <div style={{ display: 'flex', gap: '2rem', flex: 1, alignItems: 'center' }}>
          {/* Left: Engine Output & Laps */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Power</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(powerKw)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>kW</span></div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Torque</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(torque)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>Nm</span></div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Boost</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: boost > 0 ? 'var(--secondary)' : '#fff' }}>{boost.toFixed(1)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>PSI</span></div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Current Lap:</span>
                <span style={{ fontFamily: 'monospace' }}>{formatTime(currentLap)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Last Lap:</span>
                <span style={{ fontFamily: 'monospace' }}>{formatTime(lastLap)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--primary)' }}>Best Lap:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--primary)' }}>{formatTime(bestLap)}</span>
              </div>
            </div>
          </div>

          {/* Right: Central G-Force Radar */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'relative', width: '160px', height: '160px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {/* Concentric circles for 1G and 2G */}
              <div style={{ position: 'absolute', width: '80px', height: '80px', borderRadius: '50%', border: '1px dashed rgba(255,255,255,0.1)' }} />
              
              {/* Crosshairs */}
              <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.15)' }} />

              {/* Labels */}
              <span style={{ position: 'absolute', top: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>ACCEL</span>
              <span style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BRAKE</span>
              <span style={{ position: 'absolute', left: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>L</span>
              <span style={{ position: 'absolute', right: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>R</span>
              
              {/* 30s Max G Markers (8 points) */}
              {markers.length > 0 && markers.map((p, i) => (
                <div key={i} style={{ 
                  position: 'absolute', 
                  width: '6px', height: '6px', 
                  borderRadius: '50%', background: 'rgba(255,255,255,0.6)', 
                  top: `${80 - Math.max(-2, Math.min(2, p.lon)) * 40 - 3}px`, 
                  left: `${80 + Math.max(-2, Math.min(2, p.lat)) * 40 - 3}px`,
                  transition: 'top 0.1s linear, left 0.1s linear'
                }} />
              ))}

              {/* The Current G-force dot */}
              <div style={{
                position: 'absolute',
                width: '14px',
                height: '14px',
                backgroundColor: 'var(--primary)',
                borderRadius: '50%',
                boxShadow: '0 0 12px var(--primary)',
                // Max scale 2G (80px radius = 2G, so 40px per 1G)
                transform: `translate(${Math.max(-2, Math.min(2, latG)) * 40}px, ${-Math.max(-2, Math.min(2, lonG)) * 40}px)`,
                transition: 'transform 0.05s linear'
              }} />
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.8rem' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)' }}>{Math.abs(latG).toFixed(2)}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>Lat G</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--secondary)' }}>{Math.abs(lonG).toFixed(2)}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginLeft: '4px' }}>Lon G</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM-LEFT: Tire Details (Grip Radars) */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>Tire Grip & Status</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1rem', flex: 1 }}>
          <TireRadar title="Front Left" slipRatio={slipRatio[0]} slipAngle={slipAngle[0]} temp={tireTemp[0]} />
          <TireRadar title="Front Right" slipRatio={slipRatio[1]} slipAngle={slipAngle[1]} temp={tireTemp[1]} />
          <TireRadar title="Rear Left" slipRatio={slipRatio[2]} slipAngle={slipAngle[2]} temp={tireTemp[2]} />
          <TireRadar title="Rear Right" slipRatio={slipRatio[3]} slipAngle={slipAngle[3]} temp={tireTemp[3]} />
        </div>
      </div>

      {/* 4. BOTTOM-RIGHT: Suspension Details */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>Suspension Travel</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1rem', flex: 1 }}>
          <SuspensionBar title="Front Left" travel={susp[0]} />
          <SuspensionBar title="Front Right" travel={susp[1]} />
          <SuspensionBar title="Rear Left" travel={susp[2]} />
          <SuspensionBar title="Rear Right" travel={susp[3]} />
        </div>
      </div>

    </div>
    </div>
  );
};

const InputBar: React.FC<{label: string, value: number, max: number, color: string}> = ({label, value, max, color}) => {
  const percent = Math.min((value / max) * 100, 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
        <span>{label}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden' }}>
        <div style={{ 
          height: '100%', 
          width: `${percent}%`, 
          background: color,
          transition: 'width 0.05s linear'
        }} />
      </div>
    </div>
  );
};

const TireRadar: React.FC<{title: string, slipRatio: number, slipAngle: number, temp: number}> = ({title, slipRatio, slipAngle, temp}) => {
  // Slip limit is generally 1.0. We map it to a visual radar limit of 1.5 for headroom.
  // slipRatio % is typically * 100 but we will display the normalized value where 1.0 = 100% loss of grip
  const radius = 50; 
  const displayLimit = 1.5; 

  const x = Math.max(-displayLimit, Math.min(displayLimit, slipAngle));
  const y = Math.max(-displayLimit, Math.min(displayLimit, slipRatio));

  const isLosingGrip = Math.abs(slipRatio) > 1.0 || Math.abs(slipAngle) > 1.0;
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '0.5rem' }}>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{title}</strong>
        <span style={{ color: getTempColor(temp), fontWeight: 600 }}>{Math.round(temp)}°</span>
      </div>
      
      <div style={{ position: 'relative', width: `${radius*2}px`, height: `${radius*2}px`, borderRadius: '50%', border: isLosingGrip ? '2px solid #ff003c' : '2px solid rgba(255,255,255,0.1)' }}>
        {/* 1.0 Threshold Circle */}
        <div style={{ position: 'absolute', top: `${radius - (radius/displayLimit)}px`, left: `${radius - (radius/displayLimit)}px`, width: `${(radius/displayLimit)*2}px`, height: `${(radius/displayLimit)*2}px`, borderRadius: '50%', border: '1px dashed rgba(255,0,0,0.5)' }} />
        
        {/* Crosshairs */}
        <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', top: '50%' }} />
        <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.1)', left: '50%' }} />

        {/* The Grip Dot */}
        <div style={{
          position: 'absolute',
          width: '8px',
          height: '8px',
          backgroundColor: isLosingGrip ? '#ff003c' : '#00f0ff',
          borderRadius: '50%',
          boxShadow: isLosingGrip ? '0 0 8px #ff003c' : '0 0 8px #00f0ff',
          transform: `translate(${radius + (x / displayLimit) * radius - 4}px, ${radius - (y / displayLimit) * radius - 4}px)`,
          transition: 'transform 0.05s linear, background 0.1s'
        }} />
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
        <span>Ang: {slipAngle.toFixed(2)}</span>
        <span>Ratio: {Math.round(slipRatio * 100)}%</span>
      </div>

      {/* Temperature Bar */}
      <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '0.5rem', position: 'relative' }}>
        <div style={{ 
          position: 'absolute', 
          left: 0, top: 0, bottom: 0, 
          // Assume max normal temp is around 250 for display scaling
          width: `${Math.min(100, Math.max(0, (temp / 250) * 100))}%`, 
          background: getTempColor(temp),
          transition: 'width 0.1s linear, background 0.2s'
        }} />
      </div>
    </div>
  );
};

const SuspensionBar: React.FC<{title: string, travel: number}> = ({title, travel}) => {
  // Travel: 0.0 = max stretch, 1.0 = max compression
  const percent = Math.max(0, Math.min(100, travel * 100));
  const isBottomingOut = percent > 95;
  const isMaxStretch = percent < 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '1rem', textAlign: 'center' }}>
        {title}
      </div>
      
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '20px', height: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', position: 'relative', overflow: 'hidden' }}>
          {/* Middle marker */}
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)', zIndex: 1 }} />
          
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${percent}%`,
            background: isBottomingOut ? 'var(--secondary)' : isMaxStretch ? '#ffaa00' : 'var(--primary)',
            transition: 'height 0.05s linear, background 0.1s',
            borderRadius: percent > 98 ? '10px' : '0 0 10px 10px'
          }} />
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {travel.toFixed(2)}
      </div>
    </div>
  );
};

const getTempColor = (temp: number) => {
  if (temp < 150) return '#0088ff'; // Cold
  if (temp > 210) return '#ff0000'; // Hot
  return '#00ff00'; // Optimal
};

const formatTime = (seconds: number) => {
  if (seconds <= 0) return "--:--.---";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

const activeTabStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

const inactiveTabStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  color: 'var(--text-secondary)',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

export default TelemetryView;
