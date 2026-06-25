import React, { useRef } from 'react';
import { useTelemetryRecorder } from '../context/TelemetryRecorderContext';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

const AnalysisView: React.FC = () => {
  const { currentSession, loadedSession, setLoadedSession, clearCurrentSession, isRecording } = useTelemetryRecorder();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    if (currentSession.length === 0) {
      alert("No data to save.");
      return;
    }
    const dataStr = JSON.stringify(currentSession);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fh6_telemetry_session_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (Array.isArray(json)) {
          setLoadedSession(json);
        } else {
          alert("Invalid file format.");
        }
      } catch (err) {
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Combine data by index (assuming 10Hz sampling for both)
  const chartData: any[] = [];
  const maxLength = Math.max(currentSession.length, loadedSession?.length || 0);

  for (let i = 0; i < maxLength; i++) {
    const cur = currentSession[i];
    const load = loadedSession?.[i];

    chartData.push({
      time: (i * 0.1).toFixed(1), // Seconds

      // Speed
      cur_Speed: cur ? cur.SpeedMetersPerSecond! * 3.6 : null,
      load_Speed: load ? load.SpeedMetersPerSecond! * 3.6 : null,
      
      // RPM
      cur_RPM: cur ? cur.CurrentEngineRpm : null,
      load_RPM: load ? load.CurrentEngineRpm : null,

      // Dynamics
      cur_LatG: cur ? cur.AccelerationX / 9.81 : null,
      cur_LonG: cur ? cur.AccelerationZ / 9.81 : null,
      load_LatG: load ? load.AccelerationX / 9.81 : null,
      load_LonG: load ? load.AccelerationZ / 9.81 : null,

      // Inputs
      cur_Throttle: cur ? cur.AccelInput : null,
      cur_Brake: cur ? cur.BrakeInput : null,
      load_Throttle: load ? load.AccelInput : null,
      load_Brake: load ? load.BrakeInput : null,

      // Suspension FL
      cur_SuspFL: cur ? cur.NormalizedSuspensionTravel[0] : null,
      load_SuspFL: load ? load.NormalizedSuspensionTravel[0] : null,

      // Slip Ratio FL
      cur_SlipRatioFL: cur ? cur.TireSlipRatio[0] : null,
      load_SlipRatioFL: load ? load.TireSlipRatio[0] : null,

      // Tire Temps
      cur_TempFL: cur?.TireTemp?.[0] ?? null,
      cur_TempFR: cur?.TireTemp?.[1] ?? null,
      cur_TempRL: cur?.TireTemp?.[2] ?? null,
      cur_TempRR: cur?.TireTemp?.[3] ?? null,
      load_TempFL: load?.TireTemp?.[0] ?? null,
      load_TempFR: load?.TireTemp?.[1] ?? null,
      load_TempRL: load?.TireTemp?.[2] ?? null,
      load_TempRR: load?.TireTemp?.[3] ?? null,
      
      // Route & Grip mapping
      cur_PosX: cur?.PositionX ?? null,
      cur_PosZ: cur?.PositionZ ?? null,
      cur_GripLimit: cur ? Math.max(...cur.TireSlipRatio.map(Math.abs)) : 0,
      
      load_PosX: load?.PositionX ?? null,
      load_PosZ: load?.PositionZ ?? null,
    });
  }

  const currentRoute = chartData.filter(d => d.cur_PosX !== null).map(d => ({ x: d.cur_PosX, y: d.cur_PosZ, grip: d.cur_GripLimit }));
  const loadedRoute = chartData.filter(d => d.load_PosX !== null).map(d => ({ x: d.load_PosX, y: d.load_PosZ }));

  const renderGripDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    const grip = payload.grip || 0;
    
    let color = '#00ff00'; // Green = Grip OK
    if (grip > 0.8) color = '#ffaa00'; // Yellow = Nearing limit
    if (grip > 1.0) color = '#ff003c'; // Red = Slipping
    
    return <circle cx={cx} cy={cy} r={3} fill={color} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', overflowY: 'auto' }}>
      
      {/* Toolbar */}
      <div className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
        <div>
          <h2 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Post-Race Analysis</h2>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Status: {isRecording ? <span style={{ color: '#ff003c', fontWeight: 'bold' }}>Recording... ({currentSession.length} samples)</span> : `Idle (${currentSession.length} samples)`}
            {loadedSession && ` | Loaded Session: ${loadedSession.length} samples`}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleSave} style={btnStyle}>Save Current Session</button>
          
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            onChange={handleLoad} 
            style={{ display: 'none' }} 
          />
          <button onClick={() => fileInputRef.current?.click()} style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)' }}>Load Session</button>
          
          {loadedSession && (
            <button onClick={() => setLoadedSession(null)} style={{ ...btnStyle, background: '#ffaa00', color: '#000' }}>Clear Loaded</button>
          )}

          <button onClick={clearCurrentSession} style={{ ...btnStyle, background: 'var(--secondary)' }}>Clear Current</button>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
          No data recorded or loaded. Start racing to record telemetry or load a session file.
        </div>
      ) : (
        <>
          {/* Chart 0: Track Route & Grip Map */}
          <ChartWidget title="Track Route & Grip Map (Top-Down 2D)" height="400px">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" dataKey="x" name="PosX" domain={['dataMin', 'dataMax']} tick={false} stroke="rgba(255,255,255,0.1)" />
                <YAxis type="number" dataKey="y" name="PosZ" domain={['dataMin', 'dataMax']} tick={false} stroke="rgba(255,255,255,0.1)" />
                <ZAxis type="number" range={[20, 20]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                {loadedSession && loadedRoute.length > 0 && (
                  <Scatter name="Loaded Route" data={loadedRoute} fill="rgba(255,255,255,0.2)" shape="circle" line={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 }} />
                )}
                {currentRoute.length > 0 && (
                  <Scatter name="Current Route & Grip" data={currentRoute} shape={renderGripDot} />
                )}
              </ScatterChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.8rem', marginTop: '-1rem' }}>
              <span style={{ color: '#00ff00' }}>● Optimal Grip</span>
              <span style={{ color: '#ffaa00' }}>● Nearing Limit</span>
              <span style={{ color: '#ff003c' }}>● Losing Grip (Slip &gt; 1.0)</span>
            </div>
          </ChartWidget>

          {/* Chart 1: Speed & RPM */}
          <ChartWidget title="Speed & RPM">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis yAxisId="left" stroke="var(--primary)" tick={{fontSize: 12}} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--secondary)" tick={{fontSize: 12}} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="cur_Speed" name="Speed (Current)" stroke="var(--primary)" dot={false} strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="cur_RPM" name="RPM (Current)" stroke="var(--secondary)" dot={false} strokeWidth={2} />
                {loadedSession && (
                  <>
                    <Line yAxisId="left" type="monotone" dataKey="load_Speed" name="Speed (Loaded)" stroke="rgba(0, 240, 255, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="load_RPM" name="RPM (Loaded)" stroke="rgba(255, 0, 60, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* Chart 2: Inputs */}
          <ChartWidget title="Driver Inputs (Throttle & Brake)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis domain={[0, 255]} stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend />
                <Line type="step" dataKey="cur_Throttle" name="Throttle (Current)" stroke="#00ff00" dot={false} strokeWidth={2} />
                <Line type="step" dataKey="cur_Brake" name="Brake (Current)" stroke="#ff0000" dot={false} strokeWidth={2} />
                {loadedSession && (
                  <>
                    <Line type="step" dataKey="load_Throttle" name="Throttle (Loaded)" stroke="rgba(0, 255, 0, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                    <Line type="step" dataKey="load_Brake" name="Brake (Loaded)" stroke="rgba(255, 0, 0, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* Chart 3: Dynamics G-Force */}
          <ChartWidget title="Lateral & Longitudinal G-Force">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis domain={[-2, 2]} stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend />
                <Line type="monotone" dataKey="cur_LatG" name="Lat G (Current)" stroke="var(--primary)" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="cur_LonG" name="Lon G (Current)" stroke="var(--secondary)" dot={false} strokeWidth={2} />
                {loadedSession && (
                  <>
                    <Line type="monotone" dataKey="load_LatG" name="Lat G (Loaded)" stroke="rgba(0, 240, 255, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                    <Line type="monotone" dataKey="load_LonG" name="Lon G (Loaded)" stroke="rgba(255, 0, 60, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* Chart 4: Suspension FL */}
          <ChartWidget title="Suspension Travel (Front Left)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis domain={[0, 1]} stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend />
                <Line type="monotone" dataKey="cur_SuspFL" name="Travel FL (Current)" stroke="#ffaa00" dot={false} strokeWidth={2} />
                {loadedSession && (
                  <Line type="monotone" dataKey="load_SuspFL" name="Travel FL (Loaded)" stroke="rgba(255, 170, 0, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartWidget>
          
          {/* Chart 5: Tire Slip Ratio FL */}
          <ChartWidget title="Tire Slip Ratio (Front Left)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis domain={[-1.5, 1.5]} stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend />
                <Line type="monotone" dataKey="cur_SlipRatioFL" name="Slip FL (Current)" stroke="var(--accent)" dot={false} strokeWidth={2} />
                {loadedSession && (
                  <Line type="monotone" dataKey="load_SlipRatioFL" name="Slip FL (Loaded)" stroke="rgba(112, 0, 255, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartWidget>

          {/* Chart 6: Tire Temperatures */}
          <ChartWidget title="Tire Temperatures (°C / °F)">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" stroke="var(--text-secondary)" tick={{fontSize: 12}} />
                <YAxis stroke="var(--text-secondary)" tick={{fontSize: 12}} domain={['dataMin - 10', 'dataMax + 10']} />
                <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }} />
                <Legend />
                <Line type="monotone" dataKey="cur_TempFL" name="FL Temp" stroke="#00f0ff" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="cur_TempFR" name="FR Temp" stroke="#ffaa00" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="cur_TempRL" name="RL Temp" stroke="#ff003c" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="cur_TempRR" name="RR Temp" stroke="#7000ff" dot={false} strokeWidth={2} />
                {loadedSession && (
                  <>
                    <Line type="monotone" dataKey="load_TempFL" name="FL Temp (Load)" stroke="rgba(0, 240, 255, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                    <Line type="monotone" dataKey="load_TempFR" name="FR Temp (Load)" stroke="rgba(255, 170, 0, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                    <Line type="monotone" dataKey="load_TempRL" name="RL Temp (Load)" stroke="rgba(255, 0, 60, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                    <Line type="monotone" dataKey="load_TempRR" name="RR Temp (Load)" stroke="rgba(112, 0, 255, 0.4)" dot={false} strokeDasharray="5 5" strokeWidth={2} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartWidget>
        </>
      )}
    </div>
  );
};

const ChartWidget: React.FC<{ title: string, children: React.ReactNode, height?: string }> = ({ title, children, height = '300px' }) => (
  <div className="glass-panel" style={{ height, display: 'flex', flexDirection: 'column' }}>
    <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>{title}</h4>
    <div style={{ flex: 1 }}>
      {children}
    </div>
  </div>
);

const btnStyle: React.CSSProperties = {
  background: 'var(--primary)',
  color: '#000',
  border: 'none',
  padding: '0.5rem 1rem',
  borderRadius: '4px',
  fontWeight: 'bold',
  cursor: 'pointer',
};

export default AnalysisView;
