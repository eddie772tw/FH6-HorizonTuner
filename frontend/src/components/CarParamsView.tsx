import React from 'react';
import { useCarParams, CarParams } from '../context/CarParamsContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useSettings } from '../context/SettingsContext';

const CarParamsView: React.FC = () => {
  const {
    carId, carName, carParams, setCarParams, saveCarParams,
    clearDynoCurve, importDynoValues, updateSettings, isLoading
  } = useCarParams();
  const { settings } = useSettings();
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);

  // Power conversion for dyno (input in hp)
  const getPowerVal = (hp: number) => {
    if (settings.units.power === 'kw') return hp * 0.7457;
    if (settings.units.power === 'ps') return hp * 1.01387;
    return hp;
  };
  const getPowerLabel = () => {
    if (settings.units.power === 'kw') return 'kW';
    if (settings.units.power === 'ps') return 'PS';
    return 'HP';
  };

  // Torque conversion for dyno (input in lb-ft)
  const getTorqueVal = (lbft: number) => {
    if (settings.units.torque === 'nm') return lbft * 1.35582;
    return lbft;
  };
  const getTorqueLabel = () => {
    if (settings.units.torque === 'nm') return 'N·m';
    return 'lb-ft';
  };

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
    .map(rpm => {
      const rawHp = carParams.dyno_curve[rpm].hp;
      const rawTorque = carParams.dyno_curve[rpm].torque;
      return {
        rpm: parseInt(rpm),
        hp: Math.round(getPowerVal(rawHp) * 10) / 10,
        torque: Math.round(getTorqueVal(rawTorque) * 10) / 10
      };
    })
    .sort((a, b) => a.rpm - b.rpm);

  // Weight unit handling (internal is kg)
  const displayCarWeight = settings.units.weight === 'lbs' 
    ? carParams.weight * 2.20462 
    : carParams.weight;

  const handleWeightChange = (valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const internalWeight = settings.units.weight === 'lbs'
      ? val / 2.20462
      : val;
    updateParam('weight', internalWeight);
  };

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
          <label>Weight ({settings.units.weight})</label>
          <input type="number" value={Math.round(displayCarWeight)} onChange={e => handleWeightChange(e.target.value)} style={inputStyle} />
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

        {/* Import from Dyno button */}
        <button
          onClick={importDynoValues}
          disabled={Object.keys(carParams.dyno_curve).length === 0}
          style={{
            ...btnStyle,
            background: Object.keys(carParams.dyno_curve).length === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0, 180, 255, 0.15)',
            color: Object.keys(carParams.dyno_curve).length === 0 ? 'rgba(255,255,255,0.3)' : '#00b4ff',
            border: '1px solid rgba(0, 180, 255, 0.3)',
            fontSize: '0.85rem',
            padding: '0.4rem 0.75rem',
            cursor: Object.keys(carParams.dyno_curve).length === 0 ? 'not-allowed' : 'pointer',
            width: '100%',
            textAlign: 'center'
          }}
        >
          📥 從 Dyno 數據導入 Max HP / Torque RPM
        </button>

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
        {/* Title row with toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ color: 'var(--primary)', margin: 0 }}>Live Dyno Curve</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={() => setShowClearConfirm(true)}
              style={{
                ...btnStyle,
                background: 'rgba(255, 60, 60, 0.15)',
                color: '#ff6b6b',
                border: '1px solid rgba(255, 60, 60, 0.3)',
                fontSize: '0.8rem',
                padding: '0.3rem 0.6rem'
              }}
            >
              清除數據
            </button>
          </div>
        </div>

        {/* Toggle switches row */}
        <div style={{
          display: 'flex', gap: '1.5rem', marginBottom: '0.75rem',
          padding: '0.6rem 0.8rem',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '6px',
          alignItems: 'center',
          fontSize: '0.85rem'
        }}>
          <ToggleSwitch
            label="Dyno 紀錄"
            checked={settings.dyno_recording}
            onChange={(v) => updateSettings({ dyno_recording: v })}
            color="#00e676"
          />
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.15)' }} />
          <ToggleSwitch
            label="賽事自動紀錄"
            checked={settings.race_recording}
            onChange={(v) => updateSettings({ race_recording: v })}
            color="#00b0ff"
          />
        </div>

        {/* Clear Confirmation Dialog */}
        {showClearConfirm && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid rgba(255, 60, 60, 0.5)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <span style={{ color: '#ff6b6b', fontSize: '0.9rem' }}>
              ⚠ 確定要清除此車輛的所有 Dyno 數據嗎？此操作無法復原。
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button
                onClick={async () => {
                  await clearDynoCurve();
                  setShowClearConfirm(false);
                }}
                style={{
                  ...btnStyle,
                  background: '#ff4444',
                  color: 'white',
                  fontSize: '0.85rem',
                  padding: '0.35rem 0.75rem'
                }}
              >
                確認清除
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                style={{
                  ...btnStyle,
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  padding: '0.35rem 0.75rem'
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
          在遊戲中以全油門駕駛車輛，系統將自動收集並記錄各 RPM 區段的馬力與扭矩數據。每個 RPM 點保留最多 50 筆歷史紀錄，透過 IQR 過濾離群值後加權計算。
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
                  label={{ value: `Power (${getPowerLabel()})`, angle: -90, position: 'insideLeft', fill: 'var(--accent)' }} 
                />
                <YAxis 
                  yAxisId="torque" 
                  orientation="right" 
                  stroke="hsl(120, 80%, 60%)" 
                  label={{ value: `Torque (${getTorqueLabel()})`, angle: -90, position: 'insideRight', fill: 'hsl(120, 80%, 60%)' }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)' }}
                />
                <Legend verticalAlign="top" height={36}/>
                <Line yAxisId="hp" type="monotone" dataKey="hp" name={`Power (${getPowerLabel()})`} stroke="var(--accent)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
                <Line yAxisId="torque" type="monotone" dataKey="torque" name={`Torque (${getTorqueLabel()})`} stroke="hsl(120, 80%, 60%)" strokeWidth={2} dot={{ r: 1.5 }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
              {settings.dyno_recording
                ? '尚未收集到 Dyno 數據。請在遊戲中全油門行駛！'
                : 'Dyno 紀錄已關閉。開啟後將開始收集數據。'}
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};

// --- Toggle Switch Component ---
const ToggleSwitch: React.FC<{
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  color?: string;
}> = ({ label, checked, onChange, color = '#00e676' }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        background: checked ? color : 'rgba(255,255,255,0.15)',
        position: 'relative',
        transition: 'background 0.2s ease',
        flexShrink: 0,
        cursor: 'pointer'
      }}
    >
      <div style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'white',
        position: 'absolute',
        top: '2px',
        left: checked ? '18px' : '2px',
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }} />
    </div>
    <span style={{ color: checked ? 'white' : 'var(--text-secondary)', fontSize: '0.85rem', transition: 'color 0.2s' }}>
      {label}
    </span>
  </label>
);

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
