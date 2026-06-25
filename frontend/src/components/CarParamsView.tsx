import React from 'react';
import { useCarParams, CarParams } from '../context/CarParamsContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const CarParamsView: React.FC = () => {
  const { carId, carName, carParams, setCarParams, saveCarParams, isLoading } = useCarParams();

  if (isLoading) {
    return <div style={{ color: 'white', padding: '2rem' }}>Loading car parameters...</div>;
  }

  if (!carParams) {
    return <div style={{ color: 'white', padding: '2rem' }}>No car loaded or telemetry inactive. Start driving a car to auto-create profile!</div>;
  }

  const updateParam = (field: keyof CarParams, value: any) => {
    setCarParams({ ...carParams, [field]: value });
  };

  const updateAdjust = (field: keyof CarParams['adjustability'], value: any) => {
    setCarParams({ ...carParams, adjustability: { ...carParams.adjustability, [field]: value } });
  };

  // Convert dyno_curve dict to sorted array for Recharts
  const dynoData = Object.keys(carParams.dyno_curve)
    .map(rpm => ({
      rpm: parseInt(rpm),
      hp: carParams.dyno_curve[rpm].hp,
      torque: carParams.dyno_curve[rpm].torque
    }))
    .sort((a, b) => a.rpm - b.rpm);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', height: '100%' }}>
      
      {/* Left Column: Form */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>Car Parameters</h2>
          <button onClick={saveCarParams} style={btnStyle}>Save Params</button>
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>Car: <span style={{ color: 'white', fontWeight: 'bold' }}>{carName} (ID: {carId})</span></div>
        
        <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
        
        <h3 style={{ margin: 0 }}>Static Info</h3>
        
        <div style={formRowStyle}>
          <label>Weight (kg)</label>
          <input type="number" value={carParams.weight} onChange={e => updateParam('weight', parseFloat(e.target.value))} style={inputStyle} />
        </div>
        <div style={formRowStyle}>
          <label>Front Weight (%)</label>
          <input type="number" value={carParams.weight_distribution} onChange={e => updateParam('weight_distribution', parseFloat(e.target.value))} style={inputStyle} step="0.1" />
        </div>
        <div style={formRowStyle}>
          <label>Drivetrain</label>
          <select value={carParams.drivetrain} onChange={e => updateParam('drivetrain', e.target.value)} style={inputStyle}>
            <option value="FWD">FWD (Front Wheel Drive)</option>
            <option value="RWD">RWD (Rear Wheel Drive)</option>
            <option value="AWD">AWD (All Wheel Drive)</option>
          </select>
        </div>
        <div style={formRowStyle}>
          <label>Induction</label>
          <select value={carParams.induction} onChange={e => updateParam('induction', e.target.value)} style={inputStyle}>
            <option value="NA">Naturally Aspirated (NA)</option>
            <option value="Supercharger">Supercharger</option>
            <option value="Turbo">Single Turbo</option>
            <option value="TwinTurbo">Twin Turbo</option>
          </select>
        </div>
        <div style={formRowStyle}>
          <label>Max HP RPM</label>
          <input type="number" value={carParams.maxHpRpm || 0} onChange={e => updateParam('maxHpRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
        </div>
        <div style={formRowStyle}>
          <label>Max Torque RPM</label>
          <input type="number" value={carParams.maxTorqueRpm || 0} onChange={e => updateParam('maxTorqueRpm', parseInt(e.target.value))} style={inputStyle} step="100" />
        </div>

        <hr style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
        
        <h3 style={{ margin: 0 }}>Adjustability Limits</h3>
        
        <div style={formRowStyle}>
          <label>Gearbox</label>
          <select value={carParams.adjustability.gearbox} onChange={e => updateAdjust('gearbox', e.target.value)} style={inputStyle}>
            <option value="Fixed">Fixed (Unadjustable)</option>
            <option value="FinalDrive">Final Drive Only</option>
            <option value="Full">Full Adjustable</option>
          </select>
        </div>
        <div style={formRowStyle}>
          <label>Gears Count</label>
          <input type="number" value={carParams.adjustability.gears} min={4} max={10} onChange={e => updateAdjust('gears', parseInt(e.target.value))} style={inputStyle} />
        </div>
        <div style={formRowStyle}>
          <label>Suspension</label>
          <select value={carParams.adjustability.suspension} onChange={e => updateAdjust('suspension', e.target.value)} style={inputStyle}>
            <option value="Fixed">Fixed</option>
            <option value="Street">Street (No Springs/Dampers)</option>
            <option value="Sport">Sport (No Springs/Dampers)</option>
            <option value="Race">Race (Full Adjustable)</option>
          </select>
        </div>
        <div style={formRowStyle}>
          <label>Anti-roll Bars</label>
          <select value={carParams.adjustability.arb} onChange={e => updateAdjust('arb', e.target.value)} style={inputStyle}>
            <option value="Fixed">Fixed</option>
            <option value="Adjustable">Adjustable</option>
          </select>
        </div>

      </div>

      {/* Right Column: Dyno Chart */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Live Dyno Curve</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Drive the car in-game with telemetry active to automatically collect and map engine horsepower and torque data across the RPM range.
        </p>

        <div style={{ flex: 1, minHeight: 400 }}>
          {dynoData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dynoData} margin={{ top: 20, right: 30, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis 
                  dataKey="rpm" 
                  stroke="var(--text-secondary)" 
                  label={{ value: 'Engine RPM', position: 'bottom', fill: 'var(--text-secondary)' }} 
                />
                <YAxis 
                  yAxisId="hp" 
                  stroke="var(--accent)" 
                  label={{ value: 'Horsepower (HP)', angle: -90, position: 'insideLeft', fill: 'var(--accent)' }} 
                />
                <YAxis 
                  yAxisId="torque" 
                  orientation="right" 
                  stroke="hsl(120, 80%, 60%)" 
                  label={{ value: 'Torque (lb-ft)', angle: -90, position: 'insideRight', fill: 'hsl(120, 80%, 60%)' }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }}
                />
                <Legend verticalAlign="top" height={36}/>
                <Line yAxisId="hp" type="monotone" dataKey="hp" name="Horsepower" stroke="var(--accent)" strokeWidth={3} dot={true} />
                <Line yAxisId="torque" type="monotone" dataKey="torque" name="Torque" stroke="hsl(120, 80%, 60%)" strokeWidth={3} dot={true} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
              No dyno data collected yet. Rev the engine!
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

const formRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem'
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: 'white',
  borderRadius: '4px',
  width: '180px',
  textAlign: 'right'
};

const btnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: 'var(--primary)',
  color: 'black',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold'
};

export default CarParamsView;
