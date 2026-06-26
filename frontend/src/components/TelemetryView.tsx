import React, { useState, useEffect, useRef } from 'react';
import { useTelemetry, useLiveTelemetry, telemetryEmitter } from '../hooks/useTelemetry';
import { useSettings } from '../context/SettingsContext';
import { useCarParams } from '../context/CarParamsContext';
import AnalysisView from './AnalysisView';

const getCarClassString = (cls?: number) => {
  if (cls === undefined) return '';
  const classes = ['E', 'D', 'C', 'B', 'A', 'S1', 'S2', 'X'];
  if (cls >= 0 && cls < classes.length) return classes[cls];
  return `Class ${cls}`;
};

const TelemetryView: React.FC = () => {
  const [subTab, setSubTab] = useState<'live' | 'analysis'>('live');
  const historyG = useRef<{lat: number, lon: number, time: number}[]>([]);
  const historySusp = useRef<{FL: number, FR: number, RL: number, RR: number, time: number}[]>([]);
  const historyTire = useRef<{
    FL: { temp: number, ratio: number, angle: number },
    FR: { temp: number, ratio: number, angle: number },
    RL: { temp: number, ratio: number, angle: number },
    RR: { temp: number, ratio: number, angle: number },
    time: number,
    speed: number
  }[]>([]);
  const { data } = useTelemetry();
  const { convertSpeed, convertPower, convertTorque, convertBoost } = useSettings();
  const { carName } = useCarParams();
  const lastTimeRef = useRef<number>(performance.now());
  const lastIsRaceOnRef = useRef<number>(0);

  useEffect(() => {
    if (!data) return;
    
    // Proactive memory cleanup on race state changes (soft cleanup)
    if (data.IsRaceOn !== lastIsRaceOnRef.current) {
      historyG.current = [];
      historySusp.current = [];
      historyTire.current = [];
      lastIsRaceOnRef.current = data.IsRaceOn;
    }

    // We only track when racing to avoid clutter when paused/in menus
    if (data.IsRaceOn !== 1) return;

    const now = performance.now();
    const dt = now - lastTimeRef.current;
    lastTimeRef.current = now;

    const lat = (data.AccelerationX || 0) / 9.81;
    const lon = (data.AccelerationZ || 0) / 9.81;
    const speed = data.SpeedMetersPerSecond || 0;
    const isMoving = Math.abs(speed) >= 0.5;
    
    // --- Zero-Allocation Object Pool (Ring Buffer alternative) ---
    // Instead of creating new objects every frame, we reuse the oldest objects
    const MAX_HISTORY = 900; // 30 seconds at 30 FPS

    if (historyG.current.length < MAX_HISTORY) {
      historyG.current.push({ lat, lon, time: now });
    } else {
      const old = historyG.current.shift();
      if (old) {
        old.lat = lat; old.lon = lon; old.time = now;
        historyG.current.push(old);
      }
    }

    const suspTravel = data.NormalizedSuspensionTravel || [0, 0, 0, 0];
    if (!isMoving) {
      for (let i = 0; i < historySusp.current.length; i++) historySusp.current[i].time += dt;
    } else {
      if (historySusp.current.length < MAX_HISTORY) {
        historySusp.current.push({ FL: suspTravel[0], FR: suspTravel[1], RL: suspTravel[2], RR: suspTravel[3], time: now });
      } else {
        const old = historySusp.current.shift();
        if (old) {
          old.FL = suspTravel[0]; old.FR = suspTravel[1]; old.RL = suspTravel[2]; old.RR = suspTravel[3]; old.time = now;
          historySusp.current.push(old);
        }
      }
    }

    const tireTemp = data.TireTemp || [0,0,0,0];
    const slipRatio = data.TireSlipRatio || [0,0,0,0];
    const slipAngle = data.TireSlipAngle || [0,0,0,0];

    if (!isMoving) {
      for (let i = 0; i < historyTire.current.length; i++) historyTire.current[i].time += dt;
    } else {
      if (historyTire.current.length < MAX_HISTORY) {
        historyTire.current.push({
          FL: { temp: tireTemp[0], ratio: slipRatio[0], angle: slipAngle[0] },
          FR: { temp: tireTemp[1], ratio: slipRatio[1], angle: slipAngle[1] },
          RL: { temp: tireTemp[2], ratio: slipRatio[2], angle: slipAngle[2] },
          RR: { temp: tireTemp[3], ratio: slipRatio[3], angle: slipAngle[3] },
          time: now,
          speed: speed
        });
      } else {
        const old = historyTire.current.shift();
        if (old) {
          old.FL.temp = tireTemp[0]; old.FL.ratio = slipRatio[0]; old.FL.angle = slipAngle[0];
          old.FR.temp = tireTemp[1]; old.FR.ratio = slipRatio[1]; old.FR.angle = slipAngle[1];
          old.RL.temp = tireTemp[2]; old.RL.ratio = slipRatio[2]; old.RL.angle = slipAngle[2];
          old.RR.temp = tireTemp[3]; old.RR.ratio = slipRatio[3]; old.RR.angle = slipAngle[3];
          old.time = now;
          old.speed = speed;
          historyTire.current.push(old);
        }
      }
    }
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
  
  const speedVal = convertSpeed(data?.SpeedMetersPerSecond || 0);
  const speed = speedVal.value;
  const speedUnit = speedVal.label;
  const gear = data?.Gear || 0;

  // Dynamics
  const latG = (data?.AccelerationX || 0) / 9.81;
  const lonG = (data?.AccelerationZ || 0) / 9.81; // Z is forward/backward
  
  const powerVal = convertPower(data?.PowerWatts || 0);
  const power = powerVal.value;
  const powerUnit = powerVal.label;
  
  const torqueVal = convertTorque(data?.TorqueNewtons || 0);
  const torqueDisplay = torqueVal.value;
  const torqueUnit = torqueVal.label;

  const boostVal = convertBoost(data?.Boost || 0);
  const boostDisplay = boostVal.value;
  const boostUnit = boostVal.label;

  let pMaxLatAccel = { lat: 0, lon: 0 };
  let pMinLatAccel = { lat: 0, lon: 0 };
  let pMaxLatBrake = { lat: 0, lon: 0 };
  let pMinLatBrake = { lat: 0, lon: 0 };
  
  let pMaxLonRight = { lat: 0, lon: 0 };
  let pMinLonRight = { lat: 0, lon: 0 };
  let pMaxLonLeft = { lat: 0, lon: 0 };
  let pMinLonLeft = { lat: 0, lon: 0 };

  historyG.current.forEach(p => {
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

  // Suspension & Tires
  const susp = data?.NormalizedSuspensionTravel || [0,0,0,0];

  // Calculate Min / Max suspension travel over the last 30 seconds
  let maxFL = susp[0], minFL = susp[0];
  let maxFR = susp[1], minFR = susp[1];
  let maxRL = susp[2], minRL = susp[2];
  let maxRR = susp[3], minRR = susp[3];

  if (historySusp.current.length > 0) {
    maxFL = Math.max(...historySusp.current.map(p => p.FL));
    minFL = Math.min(...historySusp.current.map(p => p.FL));
    maxFR = Math.max(...historySusp.current.map(p => p.FR));
    minFR = Math.min(...historySusp.current.map(p => p.FR));
    maxRL = Math.max(...historySusp.current.map(p => p.RL));
    minRL = Math.min(...historySusp.current.map(p => p.RL));
    maxRR = Math.max(...historySusp.current.map(p => p.RR));
    minRR = Math.min(...historySusp.current.map(p => p.RR));
  }
  
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

  // Tires
  const tireTemp = data?.TireTemp || [0,0,0,0];
  const slipRatio = data?.TireSlipRatio || [0,0,0,0];
  const slipAngle = data?.TireSlipAngle || [0,0,0,0];

  const carClassStr = getCarClassString(data?.CarClass);
  const piStr = data?.CarPerformanceIndex ? data.CarPerformanceIndex.toString() : '';
  const classDisplay = carClassStr && piStr ? `${carClassStr} ${piStr}` : '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => setSubTab('live')} style={subTab === 'live' ? activeTabStyle : inactiveTabStyle}>Live Dashboard</button>
          <button onClick={() => setSubTab('analysis')} style={subTab as string === 'analysis' ? activeTabStyle : inactiveTabStyle}>Post-Race Analysis</button>
        </div>
        <div style={{ padding: '0.4rem 1rem', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', color: '#fff', fontWeight: 'bold', border: '1px solid rgba(255,255,255,0.1)', fontSize: '1.05rem', backdropFilter: 'blur(10px)' }}>
          {classDisplay && <span style={{ color: '#00f0ff', marginRight: '0.6rem' }}>{classDisplay}</span>}
          {carName}
        </div>
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
                    {Math.round(speed)} <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{speedUnit}</span>
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
              <InputBar label="Throttle" selector={d => d.AccelInput || 0} max={255} color="#00ff00" />
              <InputBar label="Brake" selector={d => d.BrakeInput || 0} max={255} color="#ff0000" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <InputBar label="Clutch" selector={d => d.ClutchInput || 0} max={255} color="#0088ff" />
              <InputBar label="Handbrake" selector={d => d.HandBrakeInput || 0} max={255} color="#ffaa00" />
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
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(power)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{powerUnit}</span></div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Torque</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>{Math.round(torqueDisplay)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{torqueUnit}</span></div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Boost</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: boostDisplay > 0 ? 'var(--secondary)' : '#fff' }}>{boostDisplay.toFixed(1)}<span style={{fontSize:'0.8rem', marginLeft: '2px'}}>{boostUnit}</span></div>
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
              <span style={{ position: 'absolute', top: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>BRAKE</span>
              <span style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>ACCEL</span>
              <span style={{ position: 'absolute', left: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>L</span>
              <span style={{ position: 'absolute', right: '5px', fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>R</span>
              
              {/* 30s Max G Markers (8 points) */}
              {markers.length > 0 && markers.map((p, i) => (
                <div key={i} style={{ 
                  position: 'absolute', 
                  width: '6px', height: '6px', 
                  borderRadius: '50%', background: 'rgba(255,255,255,0.6)', 
                  top: `${80 + Math.max(-2, Math.min(2, p.lon)) * 40 - 3}px`, 
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
                transform: `translate(${Math.max(-2, Math.min(2, latG)) * 40}px, ${Math.max(-2, Math.min(2, lonG)) * 40}px)`,
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
          <TireRadar title="Front Left" 
            currentData={{temp: tireTemp[0], ratio: slipRatio[0], angle: slipAngle[0]}}
            history={historyTire.current.map(p => ({temp: p.FL.temp, ratio: p.FL.ratio, angle: p.FL.angle, time: p.time, speed: p.speed}))}
            isLeft={true} />
          <TireRadar title="Front Right" 
            currentData={{temp: tireTemp[1], ratio: slipRatio[1], angle: slipAngle[1]}}
            history={historyTire.current.map(p => ({temp: p.FR.temp, ratio: p.FR.ratio, angle: p.FR.angle, time: p.time, speed: p.speed}))}
            isLeft={false} />
          <TireRadar title="Rear Left" 
            currentData={{temp: tireTemp[2], ratio: slipRatio[2], angle: slipAngle[2]}}
            history={historyTire.current.map(p => ({temp: p.RL.temp, ratio: p.RL.ratio, angle: p.RL.angle, time: p.time, speed: p.speed}))}
            isLeft={true} />
          <TireRadar title="Rear Right" 
            currentData={{temp: tireTemp[3], ratio: slipRatio[3], angle: slipAngle[3]}}
            history={historyTire.current.map(p => ({temp: p.RR.temp, ratio: p.RR.ratio, angle: p.RR.angle, time: p.time, speed: p.speed}))}
            isLeft={false} />
        </div>
      </div>

      {/* 4. BOTTOM-RIGHT: Suspension Details */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ marginBottom: '1rem' }}>Suspension Travel</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '1.2rem', flex: 1 }}>
          <SuspensionBar title="Front Left" travel={susp[0]} history={historySusp.current.map(p => p.FL).slice(-150)} minVal={minFL} maxVal={maxFL} isLeft={true} />
          <SuspensionBar title="Front Right" travel={susp[1]} history={historySusp.current.map(p => p.FR).slice(-150)} minVal={minFR} maxVal={maxFR} isLeft={false} />
          <SuspensionBar title="Rear Left" travel={susp[2]} history={historySusp.current.map(p => p.RL).slice(-150)} minVal={minRL} maxVal={maxRL} isLeft={true} />
          <SuspensionBar title="Rear Right" travel={susp[3]} history={historySusp.current.map(p => p.RR).slice(-150)} minVal={minRR} maxVal={maxRR} isLeft={false} />
        </div>
      </div>

    </div>
    </div>
  );
};

const InputBar: React.FC<{label: string, selector: (d: any) => number, max: number, color: string}> = ({label, selector, max, color}) => {
  const { data } = useLiveTelemetry();
  const value = data ? selector(data) : 0;
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

const getSlipColor = (ratio: number) => {
  const absRatio = Math.abs(ratio);
  if (absRatio < 0.08) return '#00f0ff';
  if (absRatio <= 0.14) return '#00ff00';
  if (absRatio <= 0.5) return '#00f0ff';
  if (absRatio <= 1.0) return '#ffaa00';
  return '#ff003c';
};

const TireRadar: React.FC<{
  title: string, 
  history: { temp: number, ratio: number, angle: number, time: number, speed: number }[],
  isLeft: boolean
}> = ({title, history, isLeft}) => {
  const { data } = useLiveTelemetry();
  
  let cTemp = 0, cRatio = 0, cAngle = 0;
  if (data && data.TireTemp && data.TireSlipRatio && data.TireSlipAngle) {
    let idx = 0;
    if (title.includes('Right')) idx += 1;
    if (title.includes('Rear')) idx += 2;
    cTemp = data.TireTemp[idx];
    cRatio = data.TireSlipRatio[idx];
    cAngle = data.TireSlipAngle[idx];
  }
  const currentData = { temp: cTemp, ratio: cRatio, angle: cAngle };

  const radius = 50; 
  const displayLimit = 1.5; 
  const { convertTemp } = useSettings();
  const tempVal = convertTemp(currentData.temp);


  const isLosingGrip = Math.abs(currentData.ratio) > 1.0 || Math.abs(currentData.angle) > 1.0;

  const histWidth = 100;
  const histHeight = 100;

  const minTemp = history.length > 0 ? Math.min(...history.map(p => p.temp)) : currentData.temp;
  const maxTemp = history.length > 0 ? Math.max(...history.map(p => p.temp)) : currentData.temp;

  const tempMinScale = 50;
  const tempMaxScale = 250;
  
  const getTempY = (t: number) => {
    const clamped = Math.max(tempMinScale, Math.min(tempMaxScale, t));
    return histHeight - ((clamped - tempMinScale) / (tempMaxScale - tempMinScale)) * histHeight;
  };

  const numBins = 40;
  const binHeight = histHeight / numBins;
  const tempRange = tempMaxScale - tempMinScale;
  const tempPerBin = tempRange / numBins;

  const bins = new Array(numBins).fill(0);
  history.forEach(p => {
    if (Math.abs(p.speed) < 0.5) return; 
    let t = Math.max(tempMinScale, Math.min(tempMaxScale, p.temp));
    let binIdx = Math.floor((t - tempMinScale) / tempPerBin);
    if (binIdx >= numBins) binIdx = numBins - 1;
    bins[binIdx]++;
  });


  const layoutLeft = !isLeft;
  const flexDirection = layoutLeft ? 'row' : 'row-reverse';
  
  const rOuter = (0.14 / displayLimit) * radius;
  const rInner = (0.08 / displayLimit) * radius;

  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const histCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
    const handleDraw = (e: any) => {
      const liveData = e.detail;
      if (!liveData || liveData.IsRaceOn !== 1) return;

      // Extract current data from live event to bypass React props delay
      let cRatio = currentData.ratio;
      let cAngle = currentData.angle;
      
      if (liveData.TireTemp && liveData.TireSlipRatio && liveData.TireSlipAngle) {
        let idx = 0;
        if (title.includes('Right')) idx += 1;
        if (title.includes('Rear')) idx += 2;
        cRatio = liveData.TireSlipRatio[idx];
        cAngle = liveData.TireSlipAngle[idx];
      }

      const x = Math.max(-displayLimit, Math.min(displayLimit, cAngle));
      const y = Math.max(-displayLimit, Math.min(displayLimit, cRatio));
      const dotColor = getSlipColor(cRatio);

      // We still use the shared history array passed via props. 
      // It is updated by TelemetryView at 60Hz concurrently.
      const now = performance.now();
      const history3s = history.filter(p => now - p.time <= 3000);
      
      const bins = new Array(numBins).fill(0);
      history.forEach(p => {
        if (Math.abs(p.speed) < 0.5) return; 
        let t = Math.max(tempMinScale, Math.min(tempMaxScale, p.temp));
        let binIdx = Math.floor((t - tempMinScale) / tempPerBin);
        if (binIdx >= numBins) binIdx = numBins - 1;
        bins[binIdx]++;
      });
      const maxBinCount = Math.max(1, ...bins);
    
      const rCanvas = radarCanvasRef.current;
      if (rCanvas) {
        const ctx = rCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, radius*2, radius*2);
          
          ctx.save();
          ctx.beginPath();
          ctx.arc(radius, radius, rOuter, 0, Math.PI * 2);
          ctx.arc(radius, radius, rInner, 0, Math.PI * 2, true);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 255, 0, 0.15)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

          if (history3s.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            for (let i = 0; i < history3s.length; i++) {
              const p = history3s[i];
              const px = Math.max(-displayLimit, Math.min(displayLimit, p.angle));
              const py = Math.max(-displayLimit, Math.min(displayLimit, p.ratio));
              const cx = radius + (px / displayLimit) * radius;
              const cy = radius + (py / displayLimit) * radius;
              if (i === 0) ctx.moveTo(cx, cy);
              else ctx.lineTo(cx, cy);
            }
            ctx.stroke();
          }

          // Draw the Live Dot directly on the canvas instead of using a React DOM element!
          ctx.beginPath();
          ctx.arc(radius + (x / displayLimit) * radius, radius + (y / displayLimit) * radius, 4, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.shadowBlur = 8;
          ctx.shadowColor = dotColor;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      const hCanvas = histCanvasRef.current;
      if (hCanvas) {
        const ctx = hCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, histWidth, histHeight);

          const y210 = getTempY(210);
          const y150 = getTempY(150);

          ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
          ctx.fillRect(0, 0, histWidth, y210);
          ctx.beginPath();
          ctx.moveTo(0, y210); ctx.lineTo(histWidth, y210);
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
          ctx.setLineDash([3, 3]);
          ctx.stroke();

          ctx.fillStyle = 'rgba(0, 136, 255, 0.1)';
          ctx.fillRect(0, y150, histWidth, histHeight - y150);
          ctx.beginPath();
          ctx.moveTo(0, y150); ctx.lineTo(histWidth, y150);
          ctx.strokeStyle = 'rgba(0, 136, 255, 0.3)';
          ctx.stroke();
          ctx.setLineDash([]);

          const grad = ctx.createLinearGradient(0, 0, 0, histHeight);
          grad.addColorStop(0, '#ff0000');
          grad.addColorStop(y210 / histHeight, '#ff0000');
          grad.addColorStop(y210 / histHeight, '#00ff00');
          grad.addColorStop(y150 / histHeight, '#00ff00');
          grad.addColorStop(y150 / histHeight, '#0088ff');
          grad.addColorStop(1, '#0088ff');

          ctx.fillStyle = grad;
          ctx.globalAlpha = 0.8;
          for (let idx = 0; idx < bins.length; idx++) {
            const count = bins[idx];
            if (count > 0) {
              const w = (count / maxBinCount) * histWidth;
              const y = histHeight - (idx + 1) * binHeight;
              const xOffset = layoutLeft ? 0 : histWidth - w;
              ctx.fillRect(xOffset, y, w, Math.max(1, binHeight - 0.5));
            }
          }
          ctx.globalAlpha = 1.0;
        }
      }
    };
    
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, [history, layoutLeft, title]);
return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', minWidth: '220px' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.8rem', textAlign: 'center' }}>
        {title}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* Inner Group: Radar + Text */}
        <div style={{ display: 'flex', flexDirection: layoutLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: '0.8rem' }}>
          
          <div style={{ position: 'relative', width: `${radius*2}px`, height: `${radius*2}px`, borderRadius: '50%', border: isLosingGrip ? '2px solid #ff003c' : '2px solid rgba(255,255,255,0.1)', overflow: 'hidden', flexShrink: 0 }}>
            <canvas ref={radarCanvasRef} width={radius*2} height={radius*2} style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%'}} />
            
            <div style={{ position: 'absolute', top: `${radius - (radius/displayLimit)}px`, left: `${radius - (radius/displayLimit)}px`, width: `${(radius/displayLimit)*2}px`, height: `${(radius/displayLimit)*2}px`, borderRadius: '50%', border: '1px dashed rgba(255,0,0,0.5)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '100%', height: '1px', background: 'rgba(255,255,255,0.1)', top: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', width: '1px', height: '100%', background: 'rgba(255,255,255,0.1)', left: '50%', pointerEvents: 'none' }} />

            
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', alignItems: layoutLeft ? 'flex-start' : 'flex-end', fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', width: '70px' }}>
             <span style={{ color: getTempColor(currentData.temp), fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.2rem' }}>{Math.round(tempVal.value)}{tempVal.label}</span>
             <span>Min: <span style={{ color: getTempColor(minTemp), fontWeight: 600 }}>{Math.round(minTemp)}</span></span>
             <span>Max: <span style={{ color: getTempColor(maxTemp), fontWeight: 600 }}>{Math.round(maxTemp)}</span></span>
             <span>Ang: {currentData.angle.toFixed(2)}</span>
             <span>Ratio: {Math.round(currentData.ratio * 100)}%</span>
          </div>
        </div>

        {/* Outer Group: Vertical Bar + Hist */}
        <div style={{ display: 'flex', flexDirection: layoutLeft ? 'row' : 'row-reverse', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: `${histHeight}px`, width: '24px', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: '16px', height: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative' }}>
              <div style={{ position: 'absolute', top: `${getTempY(210)}%`, left: -2, right: -2, height: '1px', background: '#ff0000', zIndex: 1 }} />
              <div style={{ position: 'absolute', top: `${getTempY(150)}%`, left: -2, right: -2, height: '1px', background: '#0088ff', zIndex: 1 }} />
              
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: `${100 - getTempY(currentData.temp)}%`,
                background: getTempColor(currentData.temp),
                transition: 'height 0.05s linear, background 0.1s',
                borderRadius: currentData.temp > 210 ? '8px' : '0 0 8px 8px'
              }} />
            </div>
          </div>

          <div style={{ flex: 1, height: `${histHeight}px`, position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
            <canvas ref={histCanvasRef} width={histWidth} height={histHeight} style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

interface SuspensionBarProps {
  title: string;
  travel: number;
  history: number[];
  minVal: number;
  maxVal: number;
  isLeft: boolean;
}

const SuspensionBar: React.FC<SuspensionBarProps> = ({title, travel, history, minVal, maxVal, isLeft}) => {
  const percent = Math.max(0, Math.min(100, travel * 100));
  const isBottomingOut = percent > 95;
  const isMaxStretch = percent < 5;

  const isMaxWarning = maxVal >= 0.95;
  const isMinWarning = minVal <= 0.05;
  const maxColor = isMaxWarning ? '#ff003c' : '#ffaa00';
  const minColor = isMinWarning ? '#ff003c' : '#00f0ff';

  const svgWidth = 140;
  const svgHeight = 100;
  const flexDirection = isLeft ? 'row' : 'row-reverse';

  const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
    const handleDraw = (e: any) => {
      const liveData = e.detail;
      if (!liveData || liveData.IsRaceOn !== 1) return;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, svgWidth, svgHeight);

          ctx.fillStyle = 'rgba(255, 0, 60, 0.15)';
          ctx.fillRect(0, 0, svgWidth, 5);
          ctx.fillRect(0, 95, svgWidth, 5);
          
          ctx.strokeStyle = 'rgba(255, 0, 60, 0.2)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, 5); ctx.lineTo(svgWidth, 5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, 95); ctx.lineTo(svgWidth, 95);
          ctx.stroke();
          ctx.setLineDash([]);

          if (history.length > 0) {
            const lineGrad = ctx.createLinearGradient(0, 0, 0, svgHeight);
            lineGrad.addColorStop(0, '#ff003c');
            lineGrad.addColorStop(0.05, '#ff003c');
            lineGrad.addColorStop(0.05, '#00f0ff');
            lineGrad.addColorStop(0.95, '#00f0ff');
            lineGrad.addColorStop(0.95, '#ff003c');
            lineGrad.addColorStop(1, '#ff003c');

            const fillGrad = ctx.createLinearGradient(0, 0, 0, svgHeight);
            fillGrad.addColorStop(0, 'rgba(255, 0, 60, 0.25)');
            fillGrad.addColorStop(0.05, 'rgba(255, 0, 60, 0.25)');
            fillGrad.addColorStop(0.05, 'rgba(0, 240, 255, 0.15)');
            fillGrad.addColorStop(0.95, 'rgba(0, 240, 255, 0.15)');
            fillGrad.addColorStop(0.95, 'rgba(255, 0, 60, 0.25)');
            fillGrad.addColorStop(1, 'rgba(255, 0, 60, 0.25)');

            ctx.beginPath();
            ctx.moveTo(0, svgHeight);
            for (let idx = 0; idx < history.length; idx++) {
              const val = history[idx];
              const x = history.length > 1 ? (idx / (history.length - 1)) * svgWidth : 0;
              const y = svgHeight - (val * svgHeight);
              ctx.lineTo(x, y);
            }
            ctx.lineTo(svgWidth, svgHeight);
            ctx.closePath();
            ctx.fillStyle = fillGrad;
            ctx.fill();

            ctx.beginPath();
            for (let idx = 0; idx < history.length; idx++) {
              const val = history[idx];
              const x = history.length > 1 ? (idx / (history.length - 1)) * svgWidth : 0;
              const y = svgHeight - (val * svgHeight);
              if (idx === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = lineGrad;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    };
    
    telemetryEmitter.addEventListener('update', handleDraw);
    return () => telemetryEmitter.removeEventListener('update', handleDraw);
  }, [history]);
return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', minWidth: '220px' }}>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.8rem', textAlign: 'center' }}>
        {title}
      </div>
      
      <div style={{ flex: 1, display: 'flex', flexDirection, gap: '1rem', alignItems: 'center' }}>
        <div style={{ flex: 1, height: `${svgHeight}px`, position: 'relative', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
          <canvas ref={canvasRef} width={svgWidth} height={svgHeight} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: `${svgHeight}px`, width: '24px', justifyContent: 'center' }}>
          <div style={{ width: '16px', height: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)', zIndex: 1 }} />
            
            <div style={{
              position: 'absolute', bottom: `${minVal * 100}%`, left: -4, right: -4, height: '2px',
              background: minColor, boxShadow: `0 0 4px ${minColor}`, zIndex: 2
            }} />
            <div style={{
              position: 'absolute', bottom: `${maxVal * 100}%`, left: -4, right: -4, height: '2px',
              background: maxColor, boxShadow: `0 0 4px ${maxColor}`, zIndex: 2
            }} />

            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: `${percent}%`,
              background: isBottomingOut ? 'var(--secondary)' : isMaxStretch ? '#ffaa00' : 'var(--primary)',
              transition: 'height 0.05s linear, background 0.1s',
              borderRadius: percent > 95 ? '8px' : '0 0 8px 8px'
            }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 0.2rem' }}>
        <span>Min: <span style={{ color: minColor, fontWeight: 600 }}>{minVal.toFixed(2)}</span></span>
        <span style={{ color: 'white', fontWeight: 'bold' }}>{travel.toFixed(2)}</span>
        <span>Max: <span style={{ color: maxColor, fontWeight: 600 }}>{maxVal.toFixed(2)}</span></span>
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
